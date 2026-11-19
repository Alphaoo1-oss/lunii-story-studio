import { tmpdir } from "node:os";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AppError } from "../errors";
import type { SettingsStore } from "../storage/settings";
import { subscriptionEnv } from "./claude-cli";
import type { GenerateRequest, TextGenerator } from "./generator";

// Génération via l'abonnement Claude de l'utilisateur, par le SDK Claude Agent : Claude Code
// tourne sans outil ni réglage du poste, et ne renvoie qu'une réponse au format imposé.
// Réservé à un usage personnel : une application partagée doit utiliser une clé API.
export class ClaudeSubscriptionGenerator implements TextGenerator {
  constructor(private readonly settings: SettingsStore) {}

  async generate<T>({ system, prompt, schema }: GenerateRequest<T>): Promise<T> {
    const { textModel } = await this.settings.getSettings();
    // Chargé au premier usage : le SDK est lourd et bloquait le démarrage sous `tsx watch`.
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    let result: SDKResultMessage | undefined;
    try {
      for await (const message of query({
        prompt,
        options: {
          systemPrompt: system,
          model: textModel,
          tools: [],
          settingSources: [],
          persistSession: false,
          cwd: tmpdir(),
          env: subscriptionEnv(),
          maxTurns: 6,
          outputFormat: { type: "json_schema", schema: z.toJSONSchema(schema, { target: "draft-7" }) },
        },
      })) {
        if (message.type === "result") result = message;
      }
    } catch (err) {
      // query() lève une exception après un résultat en erreur : c'est le résultat qui compte.
      if (!result) {
        throw new AppError("claude_unavailable", `Impossible de lancer Claude : ${err instanceof Error ? err.message : err}`, 503);
      }
    }
    return interpretResult(result, schema);
  }
}

export function interpretResult<T>(result: SDKResultMessage | undefined, schema: z.ZodType<T>): T {
  if (!result) throw new AppError("claude_unavailable", "Claude n'a renvoyé aucune réponse.", 503);
  const text = "result" in result ? result.result : "";
  if (result.is_error || result.subtype !== "success") {
    if (/not logged in|\/login|authenticat/i.test(text)) {
      throw new AppError(
        "claude_login_required",
        "L'application n'est pas connectée à votre abonnement Claude. Lancez « npm run claude:login » (ou « npm.cmd run claude:login » sous Windows) dans un terminal, puis réessayez.",
        401,
      );
    }
    if (/usage limit|rate limit|limit reached|resets/i.test(text)) {
      throw new AppError(
        "claude_usage_limit",
        "La limite d'utilisation de votre abonnement Claude est atteinte. Réessayez quand elle sera réinitialisée.",
        429,
      );
    }
    if (result.subtype === "error_max_structured_output_retries") {
      throw new AppError("ai_invalid_output", "La réponse de Claude ne respecte pas le format attendu.", 502);
    }
    throw new AppError("claude_error", `Claude a répondu avec une erreur${text ? ` : ${text}` : "."}`, 502);
  }
  const parsed = schema.safeParse(result.structured_output);
  if (!parsed.success) {
    throw new AppError("ai_invalid_output", "La réponse de Claude est incomplète ou mal formée.", 502);
  }
  return parsed.data;
}
