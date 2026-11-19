import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeGenerator } from "./ai/claude";
import { SettingsRoutedGenerator } from "./ai/router";
import { ClaudeSubscriptionGenerator } from "./ai/subscription";
import { AudioService } from "./audio/generate";
import { GeminiImages } from "./images/gemini";
import { PictoService } from "./images/pictos";
import { LuniiCatalog } from "./lunii/catalog";
import { LuniiService } from "./lunii/device";
import { ElevenLabsTts } from "./tts/elevenlabs";
import { PiperTts } from "./tts/piper";
import { VoiceboxTts } from "./tts/voicebox";
import { buildApp } from "./app";
import { defaultTesters } from "./services/testers";
import { FamilyStore } from "./storage/family";
import { ProjectStore } from "./storage/projects";
import { SettingsStore } from "./storage/settings";

try {
  process.loadEnvFile(".env");
} catch {
  // Pas de fichier .env : les clés viennent des Réglages.
}

const dataDir = process.env.DATA_DIR ?? "./data";
const settings = new SettingsStore(dataDir);
const projects = new ProjectStore(dataDir);
const voices = { voicebox: new VoiceboxTts(), piper: new PiperTts(dataDir), elevenlabs: new ElevenLabsTts(settings) };
const catalog = new LuniiCatalog();
const app = await buildApp({
  projects,
  family: new FamilyStore(dataDir),
  voices,
  audio: new AudioService(projects, voices),
  pictos: new PictoService(projects, new GeminiImages(settings)),
  lunii: { catalog, service: new LuniiService({ backupDir: join(dataDir, "lunii"), catalog }) },
  dataDir,
  settings,
  testers: defaultTesters,
  text: new SettingsRoutedGenerator(settings, {
    subscription: new ClaudeSubscriptionGenerator(settings),
    api: new ClaudeGenerator(settings),
  }),
  webDir: fileURLToPath(new URL("../../dist/web", import.meta.url)),
});

const { port } = await settings.getSettings();
// Écoute locale uniquement (constitution, principe III).
await app.listen({ host: "127.0.0.1", port });
console.log(`Lunii Story Studio : serveur prêt sur http://127.0.0.1:${port}`);
