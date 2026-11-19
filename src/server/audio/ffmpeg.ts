import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { AppError } from "../errors";

// Formats audio du pack (research.md R2) : MP3 mono 44 100 Hz, normalisé en crête à 0 dB.
export const LUNII_SAMPLE_RATE = 44_100;
const MP3_BITRATE = "128k";
// Marge sous 0 dBFS pour éviter l'écrêtage à l'encodage MP3.
const TARGET_PEAK_DB = -0.5;
const SILENT_BELOW_DB = -45;
const CLIPPED_FROM_DB = -0.1;

export type AudioInfo = { codec: string; sampleRate: number; channels: number; durationSec: number };
export type AudioLevels = { peakDb: number; meanDb: number; silent: boolean; clipped: boolean };

export async function runFfmpeg(args: string[]): Promise<string> {
  if (!ffmpegPath) throw new AppError("ffmpeg_missing", "ffmpeg est introuvable.", 500);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-nostdin", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stderr);
      else reject(new AppError("ffmpeg_failed", `Le traitement audio a échoué : ${lastLine(stderr)}`, 500));
    });
  });
}

// ffmpeg-static ne fournit pas ffprobe : on lit la description du flux affichée par ffmpeg.
export async function probe(file: string): Promise<AudioInfo> {
  const out = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-nostdin", "-i", file, "-f", "null", "-"]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", () => resolvePromise(stderr));
  });
  const stream = /Stream #\d+:\d+[^:]*: Audio: (\w+)[^,]*, (\d+) Hz, (mono|stereo|(\d+) channels)/.exec(out);
  if (!stream) throw new AppError("audio_unreadable", "Fichier audio illisible.");
  const [, codec, rate, layout, count] = stream;
  return {
    codec: codec!,
    sampleRate: Number(rate),
    channels: layout === "mono" ? 1 : layout === "stereo" ? 2 : Number(count),
    durationSec: lastDuration(out),
  };
}

export async function levels(file: string): Promise<AudioLevels> {
  const out = await runFfmpeg(["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const peakDb = Number(/max_volume: (-?[\d.]+|-inf) dB/.exec(out)?.[1] ?? "-inf");
  const meanDb = Number(/mean_volume: (-?[\d.]+|-inf) dB/.exec(out)?.[1] ?? "-inf");
  const peak = Number.isFinite(peakDb) ? peakDb : -Infinity;
  return {
    peakDb: peak,
    meanDb: Number.isFinite(meanDb) ? meanDb : -Infinity,
    silent: peak < SILENT_BELOW_DB,
    clipped: peak >= CLIPPED_FROM_DB,
  };
}

// Convertit n'importe quel fichier audio au format du pack, normalisé en crête.
export async function toLuniiMp3(input: string, output: string): Promise<AudioInfo> {
  const { peakDb, silent } = await levels(input);
  const gain = silent ? 0 : TARGET_PEAK_DB - peakDb;
  await mkdir(dirname(output), { recursive: true });
  await runFfmpeg([
    "-y",
    "-i", input,
    "-af", `volume=${gain.toFixed(2)}dB`,
    "-ac", "1",
    "-ar", String(LUNII_SAMPLE_RATE),
    "-c:a", "libmp3lame",
    "-b:a", MP3_BITRATE,
    "-map_metadata", "-1",
    output,
  ]);
  return probe(output);
}

// Enchaîne des fichiers audio avec un silence entre chacun, puis convertit au format du pack.
export async function concat(files: string[], gapMs: number, output: string): Promise<AudioInfo> {
  if (files.length === 0) throw new AppError("audio_empty", "Aucun audio à assembler.");
  const args: string[] = ["-y"];
  const labels: string[] = [];
  let input = 0;
  files.forEach((file, i) => {
    args.push("-i", file);
    labels.push(`[${input++}:a]`);
    if (gapMs > 0 && i < files.length - 1) {
      args.push("-f", "lavfi", "-t", (gapMs / 1000).toFixed(3), "-i", `anullsrc=r=${LUNII_SAMPLE_RATE}:cl=mono`);
      labels.push(`[${input++}:a]`);
    }
  });
  const normalized = labels.map((label, i) => `${label}aformat=sample_rates=${LUNII_SAMPLE_RATE}:channel_layouts=mono[a${i}]`);
  const filter = `${normalized.join(";")};${labels.map((_, i) => `[a${i}]`).join("")}concat=n=${labels.length}:v=0:a=1[out]`;
  const tmp = join(tmpdir(), `lss-${randomUUID()}.wav`);
  try {
    await runFfmpeg([...args, "-filter_complex", filter, "-map", "[out]", tmp]);
    return await toLuniiMp3(tmp, output);
  } finally {
    await rm(tmp, { force: true });
  }
}

function lastDuration(out: string): number {
  // "time=" de la dernière ligne de progression = durée réellement décodée.
  const times = [...out.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const match = times.at(-1) ?? /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function lastLine(text: string): string {
  return text.trim().split(/\r?\n/).at(-1) ?? "erreur inconnue";
}
