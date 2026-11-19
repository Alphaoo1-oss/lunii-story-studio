import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { AppError } from "../errors";
import type { SynthesisItem, TtsProvider, VoiceInfo } from "./provider";

// Voix locale Piper (gratuite, hors ligne). Le moteur et les voix sont téléchargés à la demande,
// sur action de l'utilisateur, dans <dataDir>/piper/.

const RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";
const VOICES = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

// Voix françaises proposées. Un identifiant « modèle#locuteur » désigne un locuteur d'un modèle
// à plusieurs voix.
export const PIPER_VOICES: { id: string; name: string; description: string; model: string; path: string; speaker?: number }[] = [
  { id: "fr_FR-siwis-medium", name: "Siwis", description: "femme, claire", model: "fr_FR-siwis-medium", path: "fr/fr_FR/siwis/medium" },
  { id: "fr_FR-upmc-medium#jessica", name: "Jessica", description: "femme, douce", model: "fr_FR-upmc-medium", path: "fr/fr_FR/upmc/medium", speaker: 0 },
  { id: "fr_FR-upmc-medium#pierre", name: "Pierre", description: "homme", model: "fr_FR-upmc-medium", path: "fr/fr_FR/upmc/medium", speaker: 1 },
  { id: "fr_FR-tom-medium", name: "Tom", description: "homme", model: "fr_FR-tom-medium", path: "fr/fr_FR/tom/medium" },
  { id: "fr_FR-gilles-low", name: "Gilles", description: "homme, qualité réduite", model: "fr_FR-gilles-low", path: "fr/fr_FR/gilles/low" },
];

const ARCHIVES: Record<string, string> = {
  "win32-x64": "piper_windows_amd64.zip",
  "linux-x64": "piper_linux_x86_64.tar.gz",
  "linux-arm64": "piper_linux_aarch64.tar.gz",
  "darwin-x64": "piper_macos_x64.tar.gz",
  "darwin-arm64": "piper_macos_aarch64.tar.gz",
};

const run = promisify(execFile);

export class PiperTts implements TtsProvider {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir, "piper");
  }

  async listVoices(): Promise<VoiceInfo[]> {
    const engine = await exists(this.binary());
    return Promise.all(
      PIPER_VOICES.map(async (v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        installed: engine && (await exists(this.modelFile(v.model))),
      })),
    );
  }

  // Télécharge le moteur (~22 Mo) s'il manque, puis la voix demandée (~60 Mo).
  async install(voiceId: string): Promise<void> {
    const voice = findVoice(voiceId);
    if (!(await exists(this.binary()))) {
      const archive = ARCHIVES[`${process.platform}-${process.arch}`];
      if (!archive) throw new AppError("piper_platform", "La voix locale n'est pas disponible sur ce système.");
      const file = join(this.root, archive);
      await download(`${RELEASE}/${archive}`, file);
      // tar (inclus dans Windows 10+, macOS et Linux) sait extraire zip et tar.gz.
      await run("tar", ["-xf", file, "-C", this.root]);
      await rm(file, { force: true });
    }
    for (const ext of [".onnx", ".onnx.json"]) {
      const target = this.modelFile(voice.model) + (ext === ".onnx" ? "" : ".json");
      if (!(await exists(target))) await download(`${VOICES}/${voice.path}/${voice.model}${ext}`, target);
    }
  }

  async synthesize(items: SynthesisItem[], voiceId: string, settings: Record<string, unknown>): Promise<void> {
    const voice = findVoice(voiceId);
    if (!(await exists(this.binary())) || !(await exists(this.modelFile(voice.model)))) {
      throw new AppError("piper_not_installed", `La voix locale « ${voice.name} » n'est pas encore téléchargée. Téléchargez-la depuis la page Voix.`);
    }
    // Vitesse : 1 = normale ; Piper attend l'inverse (length_scale).
    const speed = typeof settings.speed === "number" && settings.speed > 0 ? settings.speed : 1;
    const args = ["--model", this.modelFile(voice.model), "--json-input", "--length_scale", String(1 / speed)];
    const input = items
      .map((i) => JSON.stringify({ text: i.text, output_file: i.output, ...(voice.speaker !== undefined ? { speaker_id: voice.speaker } : {}) }))
      .join("\n");

    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(this.binary(), args, { cwd: join(this.root, "piper") });
      let stderr = "";
      child.stderr.on("data", (c) => (stderr += c));
      child.on("error", () => reject(new AppError("piper_failed", "Impossible de lancer la voix locale.", 500)));
      child.on("close", (code) =>
        code === 0
          ? resolvePromise()
          : reject(new AppError("piper_failed", `La voix locale a échoué : ${stderr.trim().split(/\r?\n/).at(-1) ?? code}`, 500)),
      );
      child.stdin.end(`${input}\n`);
    });
    for (const item of items) {
      if (!(await exists(item.output))) throw new AppError("piper_failed", "La voix locale n'a pas produit tous les fichiers.", 500);
    }
  }

  private binary(): string {
    return join(this.root, "piper", process.platform === "win32" ? "piper.exe" : "piper");
  }

  private modelFile(model: string): string {
    return join(this.root, "voices", `${model}.onnx`);
  }
}

export function findVoice(voiceId: string) {
  const voice = PIPER_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new AppError("piper_voice", "Voix locale inconnue. Choisissez-en une autre.");
  return voice;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function download(url: string, target: string): Promise<void> {
  await mkdir(resolve(target, ".."), { recursive: true });
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    throw new AppError("piper_download", "Téléchargement impossible : vérifiez la connexion Internet.", 503);
  }
  if (!res.ok || !res.body) throw new AppError("piper_download", `Téléchargement impossible (${res.status}).`, 502);
  const tmp = `${target}.download`;
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
    await rename(tmp, target);
  } catch {
    await rm(tmp, { force: true });
    throw new AppError("piper_download", "Le téléchargement a été interrompu. Réessayez.", 502);
  }
}
