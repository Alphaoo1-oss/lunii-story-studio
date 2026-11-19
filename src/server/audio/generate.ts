import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AudioClip, Character, Project } from "@shared/model";
import { AppError } from "../errors";
import type { ProjectStore } from "../storage/projects";
import {
  clipState,
  lineSourceHash,
  lineState,
  narrator,
  segmentAudioState,
  segmentSourceHash,
  spokenTextHash,
} from "../story/state";
import type { TtsProvider } from "../tts/provider";
import { concat, toLuniiMp3 } from "./ffmpeg";

// Silence entre deux répliques d'une même étape.
export const LINE_GAP_MS = 400;

type SyntheticSource = "voicebox" | "piper" | "elevenlabs";

// Un texte à dire avec une voix de synthèse, et l'endroit du projet où ranger l'audio.
type Job =
  | { kind: "line"; id: string; text: string; character: Character }
  | { kind: "announce"; id: string; text: string; character: Character }
  | { kind: "title"; id: "title"; text: string; character: Character };

export type GenerationScope = "all" | { lineIds: string[] };
export type GenerationProgress = { done: number; total: number; label: string };
export type GenerationSummary = { generated: number; recordedPending: number };

// Mise en voix US3 : génère les audios manquants ou obsolètes, puis assemble les étapes.
export class AudioService {
  constructor(
    private readonly store: ProjectStore,
    private readonly providers: Record<SyntheticSource, TtsProvider>,
  ) {}

  async generate(
    projectId: string,
    scope: GenerationScope,
    onProgress: (p: GenerationProgress) => void = () => {},
  ): Promise<GenerationSummary> {
    const project = await this.store.get(projectId);
    if (!project.graph) throw new AppError("no_story", "Le projet n'a pas encore d'histoire.");
    const { jobs, recordedPending } = planJobs(project, scope);

    const voiceless = [...new Set(jobs.filter((j) => !j.character.voice).map((j) => j.character.name))];
    if (voiceless.length) {
      throw new AppError("voice_missing", `Choisissez d'abord une voix pour : ${voiceless.join(", ")}.`);
    }

    // Une série par voix : Piper ne charge son modèle qu'une fois par série.
    const batches = new Map<string, Job[]>();
    for (const job of jobs.filter((j) => j.character.voice!.source !== "recorded")) {
      const v = job.character.voice!;
      const key = `${v.source}|${v.voiceId}`;
      batches.set(key, [...(batches.get(key) ?? []), job]);
    }
    const total = [...batches.values()].reduce((n, b) => n + b.length, 0);
    // Répliques demandées explicitement (« Refaire ») : jamais reprises d'un cache du fournisseur.
    const forced = new Set(scope === "all" ? [] : scope.lineIds);

    let done = 0;
    const work = await mkdtemp(join(tmpdir(), "lss-tts-"));
    try {
      for (const batch of batches.values()) {
        const voice = batch[0]!.character.voice!;
        const provider = this.providers[voice.source as SyntheticSource];
        // Chaque fichier est converti et enregistré dès qu'il existe : une erreur en cours de
        // série ne fait rien perdre de ce qui a déjà été produit.
        // Extension .wav : Piper écrit du WAV ; ffmpeg reconnaît le MP3 d'ElevenLabs à son contenu.
        const items = batch.map((job) => ({ job, output: join(work, `${randomUUID()}.wav`) }));
        // Piper charge son modèle une fois par série ; les autres voix font une requête par texte :
        // chaque réplique est alors enregistrée dès qu'elle est prête, et la progression avance.
        const chunks = voice.source === "piper" ? [items] : items.map((item) => [item]);
        for (const chunk of chunks) {
          let failure: unknown;
          try {
            await provider.synthesize(
              chunk.map((i) => ({ text: i.job.text, output: i.output, fresh: forced.has(i.job.id) })),
              voice.voiceId!,
              voice.settings,
            );
          } catch (err) {
            failure = err;
          }
          for (const { job, output } of chunk) {
            const clip = await this.saveClip(projectId, job, output, voice.source as SyntheticSource).catch(() => null);
            if (!clip) continue;
            done++;
            onProgress({ done, total, label: job.text.slice(0, 60) });
          }
          if (failure) throw failure;
        }
      }
    } finally {
      await rm(work, { recursive: true, force: true });
      await this.assemble(projectId);
    }
    return { generated: done, recordedPending };
  }

  // Assemble l'audio des étapes dont toutes les répliques sont à jour et l'audio obsolète.
  async assemble(projectId: string): Promise<Project> {
    const project = await this.store.get(projectId);
    for (const segment of project.graph?.segments ?? []) {
      if (segment.lines.some((l) => lineState(l, project.characters) !== "ok")) continue;
      if (segmentAudioState(segment, project.characters) === "ok") continue;
      const file = `audio/segment-${segment.id}-${shortId()}.mp3`;
      const info = await concat(
        segment.lines.map((l) => this.store.file(projectId, l.audio!.file)),
        LINE_GAP_MS,
        this.store.file(projectId, file),
      );
      const audio: AudioClip = {
        file,
        source: "assembled",
        durationSec: info.durationSec,
        peakDb: null,
        silent: false,
        clipped: false,
        sourceHash: segmentSourceHash(segment),
        createdAt: new Date().toISOString(),
      };
      await this.replace(projectId, segment.audio?.file, async (p) => {
        const target = p.graph?.segments.find((s) => s.id === segment.id);
        if (target) target.audio = audio;
      });
    }
    return this.store.get(projectId);
  }

  private async saveClip(projectId: string, job: Job, raw: string, source: SyntheticSource): Promise<AudioClip> {
    const file = `audio/${job.kind}-${job.id}-${shortId()}.mp3`;
    const info = await toLuniiMp3(raw, this.store.file(projectId, file));
    const sourceHash = job.kind === "line" ? lineSourceHash({ text: job.text }, job.character) : spokenTextHash(job.text, job.character);
    const clip: AudioClip = {
      file,
      source,
      durationSec: info.durationSec,
      peakDb: null,
      silent: false,
      clipped: false,
      sourceHash,
      createdAt: new Date().toISOString(),
    };
    let previous: string | undefined;
    await this.store.update(projectId, (p) => {
      if (job.kind === "title") {
        previous = p.titleAudio?.file;
        p.titleAudio = clip;
        return;
      }
      if (job.kind === "announce") {
        const option = p.graph?.choices.flatMap((c) => c.options).find((o) => o.id === job.id);
        if (!option) return;
        previous = option.announceAudio?.file;
        option.announceAudio = clip;
        return;
      }
      const line = p.graph?.segments.flatMap((s) => s.lines).find((l) => l.id === job.id);
      // Le texte a pu changer pendant la génération : on garde l'empreinte du texte réellement dit.
      if (!line) return;
      previous = line.audio?.file;
      line.audio = clip;
      line.textHash = sourceHash;
    });
    await this.removeFile(projectId, previous);
    return clip;
  }

  private async replace(projectId: string, previous: string | undefined, change: (p: Project) => Promise<void>) {
    await this.store.update(projectId, change);
    await this.removeFile(projectId, previous);
  }

  private async removeFile(projectId: string, file: string | undefined) {
    if (file) await rm(this.store.file(projectId, file), { force: true });
  }
}

// Ce qu'il reste à dire en voix de synthèse, et combien de répliques attendent un enregistrement.
export function planJobs(project: Project, scope: GenerationScope): { jobs: Job[]; recordedPending: number } {
  const graph = project.graph!;
  const forced = scope === "all" ? new Set<string>() : new Set(scope.lineIds);
  const characterOf = (id: string) => project.characters.find((c) => c.id === id)!;
  const jobs: Job[] = [];
  let recordedPending = 0;

  for (const line of graph.segments.flatMap((s) => s.lines)) {
    const character = characterOf(line.characterId);
    const wanted = scope === "all" ? lineState(line, project.characters) !== "ok" : forced.has(line.id);
    if (!wanted) continue;
    if (character?.voice?.source === "recorded") {
      recordedPending++;
      continue;
    }
    jobs.push({ kind: "line", id: line.id, text: line.text, character });
  }

  // Annonces des options et titre : seulement en génération complète, par la voix du narrateur.
  const reader = narrator(project);
  if (scope === "all" && reader) {
    for (const option of graph.choices.flatMap((c) => c.options)) {
      if (clipState(option.announceAudio, spokenTextHash(option.label, reader)) === "ok") continue;
      if (reader.voice?.source === "recorded") recordedPending++;
      else jobs.push({ kind: "announce", id: option.id, text: option.label, character: reader });
    }
    if (clipState(project.titleAudio, spokenTextHash(project.title, reader)) !== "ok") {
      if (reader.voice?.source === "recorded") recordedPending++;
      else jobs.push({ kind: "title", id: "title", text: project.title, character: reader });
    }
  }
  return { jobs, recordedPending };
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}
