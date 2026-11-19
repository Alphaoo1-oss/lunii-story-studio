import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { ExportIssue } from "@shared/api";
import type { Picto, Project } from "@shared/model";
import sharp from "sharp";
import { probe } from "../audio/ffmpeg";
import { defaultPicto, defaultPictoColor, LUNII_HEIGHT, LUNII_WIDTH } from "../images/convert";
import type { ProjectStore } from "../storage/projects";

// Médias référencés par le pack, avec leur clé logique (voir mapping.ts).
export type MediaRef = {
  key: string;
  file: string;
  kind: "audio" | "image";
  target: ExportIssue["target"];
};

export function mediaRefs(project: Project): MediaRef[] {
  const refs: MediaRef[] = [];
  const add = (key: string, file: string | undefined, kind: MediaRef["kind"], target: MediaRef["target"]) => {
    if (file) refs.push({ key, file, kind, target });
  };
  add("cover", project.coverPicto?.file, "image", { kind: "cover", id: project.id });
  add("title", project.titleAudio?.file, "audio", { kind: "project", id: project.id });
  for (const segment of project.graph?.segments ?? []) {
    add(`segment:${segment.id}`, segment.audio?.file, "audio", { kind: "segment", id: segment.id });
  }
  for (const choice of project.graph?.choices ?? []) {
    for (const option of choice.options) {
      add(`announce:${option.id}`, option.announceAudio?.file, "audio", { kind: "option", id: option.id });
      add(`option-picto:${option.id}`, option.picto?.file, "image", { kind: "option", id: option.id });
    }
  }
  return refs;
}

// Vérifie qu'un média existe et respecte le format de la Lunii (research.md R2).
export async function checkMedia(store: ProjectStore, project: Project, ref: MediaRef): Promise<ExportIssue | null> {
  const path = store.file(project.id, ref.file);
  const issue = (code: string, message: string): ExportIssue => ({ code, severity: "error", message, target: ref.target });
  try {
    await access(path);
  } catch {
    return issue(`${ref.kind}_file_missing`, `Le fichier ${ref.kind === "audio" ? "audio" : "image"} « ${ref.file} » a disparu.`);
  }
  try {
    if (ref.kind === "audio") {
      const info = await probe(path);
      if (info.codec !== "mp3" || info.sampleRate !== 44_100 || info.channels !== 1) {
        return issue("audio_format", `L'audio « ${ref.file} » n'est pas au format attendu (MP3 mono 44,1 kHz).`);
      }
    } else {
      const meta = await sharp(path).metadata();
      if (meta.format !== "png" || meta.width !== LUNII_WIDTH || meta.height !== LUNII_HEIGHT) {
        return issue("image_format", `L'image « ${ref.file} » n'est pas au format attendu (PNG 320×240).`);
      }
    }
  } catch {
    return issue(`${ref.kind}_unreadable`, `Le fichier « ${ref.file} » est illisible.`);
  }
  return null;
}

// Crée les pictos par défaut manquants (FR-018) et les enregistre dans le projet.
export async function ensureDefaultPictos(store: ProjectStore, project: Project): Promise<Project> {
  const missing: { file: string; label: string; color: string }[] = [];
  if (!project.coverPicto) missing.push({ file: "images/default-cover.png", label: project.title, color: "#E2703A" });
  project.graph?.choices.forEach((choice) =>
    choice.options.forEach((option, i) => {
      if (!option.picto) missing.push({ file: `images/default-${option.id}.png`, label: option.label, color: defaultPictoColor(i) });
    }),
  );
  if (missing.length === 0) return project;

  for (const m of missing) await defaultPicto(m.label, m.color, store.file(project.id, m.file));
  const picto = (file: string): Picto => ({ file, origin: "default", style: null, promptHash: null });
  return store.update(project.id, (p) => {
    p.coverPicto ??= picto("images/default-cover.png");
    for (const choice of p.graph?.choices ?? []) {
      for (const option of choice.options) option.picto ??= picto(`images/default-${option.id}.png`);
    }
  });
}

// Nom d'asset dans l'archive : empreinte SHA-1 du contenu + extension (déduplication).
export async function assetName(path: string): Promise<string> {
  const sha1 = createHash("sha1").update(await readFile(path)).digest("hex");
  return `${sha1}${extname(path).toLowerCase()}`;
}
