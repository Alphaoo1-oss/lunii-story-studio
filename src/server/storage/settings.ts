import { join, resolve } from "node:path";
import type { PublicSettings, SettingsUpdate } from "@shared/api";
import { API_KEY_FIELDS, type ApiKeyField, Settings } from "@shared/model";
import { readJsonIfExists, writeFileAtomic } from "./files";

const ENV_KEYS: Record<ApiKeyField, string> = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  elevenLabsApiKey: "ELEVENLABS_API_KEY",
  geminiApiKey: "GEMINI_API_KEY",
};

// Réglages dans <dataDir>/settings.json ; une clé absente du fichier peut venir de .env.
// Les clés ne quittent jamais le serveur (constitution, principe III).
export class SettingsStore {
  private readonly path: string;

  constructor(
    dataDir: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.path = join(resolve(dataDir), "settings.json");
  }

  async getSettings(): Promise<Settings> {
    const stored = Settings.parse((await readJsonIfExists(this.path)) ?? {});
    for (const field of API_KEY_FIELDS) {
      stored[field] ??= this.env[ENV_KEYS[field]]?.trim() || null;
    }
    if (this.env.PORT) stored.port = Number(this.env.PORT);
    if (!this.subscriptionAllowed()) stored.textProvider = "api";
    return stored;
  }

  // L'abonnement Claude (connexion claude.ai) est réservé à l'usage personnel de la personne qui a
  // installé l'application sur son propre ordinateur : il ne s'active qu'avec
  // CLAUDE_SUBSCRIPTION_PERSONAL=1 dans son .env. Toute autre installation utilise sa propre clé API.
  subscriptionAllowed(): boolean {
    return this.env.CLAUDE_SUBSCRIPTION_PERSONAL === "1";
  }

  async getPublicSettings(): Promise<PublicSettings> {
    return { ...toPublic(await this.getSettings()), subscriptionAllowed: this.subscriptionAllowed() };
  }

  async update(change: SettingsUpdate): Promise<PublicSettings> {
    const stored = Settings.parse((await readJsonIfExists(this.path)) ?? {});
    for (const field of API_KEY_FIELDS) {
      const value = change[field];
      if (value !== undefined) stored[field] = value.trim() || null;
    }
    if (change.textProvider && (change.textProvider === "api" || this.subscriptionAllowed())) {
      stored.textProvider = change.textProvider;
    }
    if (change.textModel) stored.textModel = change.textModel;
    if (change.imageModel) stored.imageModel = change.imageModel;
    await writeFileAtomic(this.path, JSON.stringify(stored, null, 2));
    return this.getPublicSettings();
  }
}

export function toPublic(settings: Settings): PublicSettings {
  const { anthropicApiKey, elevenLabsApiKey, geminiApiKey, ...rest } = settings;
  const status = (key: string | null) => ({ configured: !!key, last4: key ? key.slice(-4) : "" });
  return {
    ...rest,
    keys: {
      anthropicApiKey: status(anthropicApiKey),
      elevenLabsApiKey: status(elevenLabsApiKey),
      geminiApiKey: status(geminiApiKey),
    },
  };
}
