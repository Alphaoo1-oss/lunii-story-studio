import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AppError } from "../errors";
import type { SettingsStore } from "../storage/settings";
import type { GenerateRequest, TextGenerator } from "./generator";

// Modèles qui acceptent le repli serveur en cas de refus (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

// Génération structurée avec Claude : la réponse est contrainte par le schéma (structured
// outputs) puis validée côté client par le SDK.
export class ClaudeGenerator implements TextGenerator {
  constructor(private readonly settings: SettingsStore) {}

  async generate<T>({ system, prompt, schema, maxTokens = 16_000 }: GenerateRequest<T>): Promise<T> {
    const { anthropicApiKey, textModel } = await this.settings.getSettings();
    if (!anthropicApiKey) {
      throw new AppError("anthropic_key_missing", "Aucune clé Anthropic n'est enregistrée. Ajoutez-la dans les Réglages.", 400);
    }
    const client = new Anthropic({ apiKey: anthropicApiKey, maxRetries: 2 });
    const fallback = FALLBACK_MODELS.has(textModel)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {};

    let response;
    try {
      response = await client.beta.messages.parse({
        model: textModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: betaZodOutputFormat(schema) },
        ...fallback,
      });
    } catch (err) {
      throw translateError(err);
    }

    if (response.stop_reason === "refusal") {
      throw new AppError(
        "ai_refused",
        "Claude a refusé cette demande. Reformulez les indications pour qu'elles conviennent à une histoire pour enfants.",
        422,
      );
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new AppError("ai_invalid_output", "La réponse de Claude est incomplète ou mal formée.", 502);
    }
    return response.parsed_output as T;
  }
}

export function translateError(err: unknown): AppError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError("anthropic_auth", "La clé Anthropic est refusée. Vérifiez-la dans les Réglages.", 400);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError("anthropic_quota", "La limite d'utilisation d'Anthropic est atteinte. Réessayez dans quelques minutes.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    const detail = apiMessage(err);
    // L'API ne donne pas de code dédié au crédit épuisé : seul son message l'indique.
    if (/credit balance/i.test(detail)) {
      return new AppError(
        "anthropic_credit",
        "Votre compte Anthropic n'a plus de crédit. Ajoutez des crédits sur console.anthropic.com (rubrique « Plans & Billing »), puis réessayez.",
        402,
      );
    }
    return new AppError("anthropic_bad_request", `Anthropic a refusé la requête : ${detail}`, 400);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("anthropic_network", "Impossible de joindre Anthropic. Vérifiez la connexion Internet.", 503);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AppError("anthropic_unavailable", "Le service d'Anthropic est momentanément indisponible. Réessayez plus tard.", 503);
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("anthropic_error", `Anthropic a répondu avec une erreur (${err.status ?? "?"}).`, 502);
  }
  // Erreur de lecture ou de validation de la réponse par le SDK.
  return new AppError("ai_invalid_output", "La réponse de Claude ne respecte pas le format attendu.", 502);
}

// Message lisible de l'API (champ error.message du corps), sans le JSON brut.
function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === "string" ? body.error.message : err.message;
}
