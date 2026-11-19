import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type AudioClip, Project } from "@shared/model";
import sharp from "sharp";
import { runFfmpeg, toLuniiMp3 } from "../../src/server/audio/ffmpeg";
import type { ProjectStore } from "../../src/server/storage/projects";
import { lineSourceHash, narrator, segmentSourceHash, spokenTextHash } from "../../src/server/story/state";

// Médias factices pour les tests (aucun réseau, aucune clé).

const REFERENCE = new URL("./reference-story.json", import.meta.url);

// Crée dans le store le projet de référence complet : chaque réplique, segment, annonce et
// le titre ont un audio à jour ; la couverture et une option ont un picto (l'autre option
// utilisera le picto par défaut).
export async function createReferenceProject(store: ProjectStore): Promise<Project> {
  const fixture = JSON.parse(await readFile(REFERENCE, "utf8"));
  const { id } = await store.create({ title: fixture.title });
  const dir = store.dir(id);
  let n = 0;
  const clip = async (file: string, sourceHash: string, seconds = 0.4): Promise<AudioClip> => {
    const wav = join(dir, "audio", `${file}.wav`);
    await tone(wav, { seconds, frequency: 300 + 40 * n++ });
    const info = await toLuniiMp3(wav, join(dir, "audio", `${file}.mp3`));
    return {
      file: `audio/${file}.mp3`,
      source: "piper",
      durationSec: info.durationSec,
      peakDb: null,
      silent: false,
      clipped: false,
      sourceHash,
      createdAt: new Date().toISOString(),
    };
  };

  const project = Project.parse({ ...fixture, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const reader = narrator(project);
  for (const segment of project.graph!.segments) {
    for (const line of segment.lines) {
      line.textHash = lineSourceHash(line, project.characters.find((c) => c.id === line.characterId));
      line.audio = await clip(`line-${line.id}`, line.textHash, 0.2);
    }
    segment.audio = await clip(`segment-${segment.id}`, segmentSourceHash(segment), 0.6);
  }
  for (const choice of project.graph!.choices) {
    for (const option of choice.options) {
      option.announceAudio = await clip(`announce-${option.id}`, spokenTextHash(option.label, reader), 0.3);
    }
  }
  project.titleAudio = await clip("title", spokenTextHash(project.title, reader), 0.3);

  await image(join(dir, "images", "cover.png"), "#E2703A");
  project.coverPicto = { file: "images/cover.png", origin: "generated", style: "aquarelle", promptHash: null };
  await image(join(dir, "images", "opt-foret.png"), "#5B8E7D");
  project.graph!.choices[0]!.options[0]!.picto = { file: "images/opt-foret.png", origin: "generated", style: "aquarelle", promptHash: null };

  return store.update(id, () => ({ ...project, stage: "export" }));
}

export async function tone(output: string, opts: { seconds?: number; frequency?: number; volume?: number; stereo?: boolean } = {}) {
  const { seconds = 0.5, frequency = 440, volume = 0.5, stereo = false } = opts;
  await mkdir(dirname(output), { recursive: true });
  await runFfmpeg([
    "-y",
    "-f", "lavfi",
    "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${seconds}`,
    "-af", `volume=${volume}`,
    "-ac", stereo ? "2" : "1",
    output,
  ]);
}

export async function silence(output: string, seconds = 0.5) {
  await mkdir(dirname(output), { recursive: true });
  await runFfmpeg(["-y", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", String(seconds), output]);
}

export async function image(output: string, color: string, width = 320, height = 240) {
  await mkdir(dirname(output), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(output);
}
