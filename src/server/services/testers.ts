import Anthropic from "@anthropic-ai/sdk";
import type { Service, ServiceTestResult } from "@shared/api";
import type { Settings } from "@shared/model";
import { claudeAuthStatus } from "../ai/claude-cli";

// Vérifie qu'une clé est acceptée par son service, sans rien générer (aucun coût).
export type ServiceTester = (settings: Settings) => Promise<ServiceTestResult>;

const missing: ServiceTestResult = { ok: false, message: "Aucune clé n'est enregistrée pour ce service." };

async function httpCheck(url: string, headers: Record<string, string>): Promise<ServiceTestResult> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return { ok: true, message: "La clé fonctionne." };
    if (res.status === 401 || res.status === 403) return { ok: false, message: "La clé est refusée par le service." };
    return { ok: false, message: `Le service a répondu avec une erreur (${res.status}).` };
  } catch {
    return { ok: false, message: "Impossible de joindre le service. Vérifiez la connexion Internet." };
  }
}

export const defaultTesters: Record<Service, ServiceTester> = {
  // Vérifie la connexion à l'abonnement sans rien générer (aucune consommation).
  async subscription() {
    try {
      const status = await claudeAuthStatus();
      if (status.loggedIn) {
        return { ok: true, message: `Connecté à votre abonnement Claude${status.subscriptionType ? ` (${status.subscriptionType})` : ""}.` };
      }
      return { ok: false, message: "Pas encore connecté. Lancez « npm run claude:login » (ou « npm.cmd run claude:login » sous Windows) dans un terminal." };
    } catch {
      return { ok: false, message: "Impossible de lancer Claude pour vérifier la connexion." };
    }
  },
  async anthropic(settings) {
    if (!settings.anthropicApiKey) return missing;
    try {
      await new Anthropic({ apiKey: settings.anthropicApiKey }).models.list({ limit: 1 });
      return { ok: true, message: "La clé fonctionne." };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: "La clé est refusée par Anthropic." };
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, message: "Impossible de joindre Anthropic. Vérifiez la connexion Internet." };
      }
      return { ok: false, message: "Anthropic a répondu avec une erreur." };
    }
  },
  async elevenlabs(settings) {
    if (!settings.elevenLabsApiKey) return missing;
    return httpCheck("https://api.elevenlabs.io/v1/user", { "xi-api-key": settings.elevenLabsApiKey });
  },
  async gemini(settings) {
    if (!settings.geminiApiKey) return missing;
    return httpCheck("https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": settings.geminiApiKey });
  },
};
