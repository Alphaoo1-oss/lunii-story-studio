import { createHash } from "node:crypto";
import type { AudioClip, Character, Line, Project, Segment } from "@shared/model";

// États dérivés des audios (FR-014) : un audio est obsolète quand ce dont il est issu a changé.

export type ClipState = "missing" | "stale" | "ok";

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

export function voiceKey(character: Character | undefined): string {
  const voice = character?.voice;
  if (!voice) return "none";
  return voice.source === "recorded" ? "recorded" : `${voice.source}:${voice.voiceId}`;
}

export function lineSourceHash(line: Pick<Line, "text">, character: Character | undefined): string {
  return sha1(`${voiceKey(character)}|${line.text}`);
}

// Un segment assemblé dépend des fichiers audio de ses répliques, dans l'ordre.
export function segmentSourceHash(segment: Pick<Segment, "lines">): string {
  return sha1(segment.lines.map((l) => `${l.id}:${l.audio?.file ?? "-"}:${l.textHash ?? "-"}`).join("|"));
}

export function narrator(project: Pick<Project, "characters">): Character | undefined {
  return project.characters.find((c) => c.isNarrator);
}

// Annonces lues par le narrateur : libellés d'options et titre de l'histoire.
export function spokenTextHash(text: string, reader: Character | undefined): string {
  return sha1(`${voiceKey(reader)}|${text}`);
}

export function clipState(clip: AudioClip | null, expectedHash: string): ClipState {
  if (!clip) return "missing";
  return clip.sourceHash === expectedHash ? "ok" : "stale";
}

export function lineState(line: Line, characters: Character[]): ClipState {
  if (!line.audio) return "missing";
  const character = characters.find((c) => c.id === line.characterId);
  return line.textHash === lineSourceHash(line, character) ? "ok" : "stale";
}

export function segmentAudioState(segment: Segment, characters: Character[]): ClipState {
  if (segment.lines.some((l) => lineState(l, characters) !== "ok")) {
    return segment.audio ? "stale" : "missing";
  }
  return clipState(segment.audio, segmentSourceHash(segment));
}
