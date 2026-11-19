import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { subscriptionEnv } from "../../src/server/ai/claude-cli";
import type { GenerateRequest, TextGenerator } from "../../src/server/ai/generator";
import { SettingsRoutedGenerator } from "../../src/server/ai/router";
import { interpretResult } from "../../src/server/ai/subscription";
import { AppError } from "../../src/server/errors";
import { SettingsStore } from "../../src/server/storage/settings";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();
const Schema = z.object({ prenom: z.string() });

// Seuls les champs lus par interpretResult comptent ici.
const result = (r: Partial<Record<string, unknown>>) => r as unknown as SDKResultMessage;
const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err as AppError;
  }
  throw new Error("aucune erreur levée");
};

describe("interpretResult", () => {
  it("renvoie la sortie structurée validée", () => {
    const r = result({ type: "result", subtype: "success", is_error: false, result: "", structured_output: { prenom: "Pompon" } });
    expect(interpretResult(r, Schema)).toEqual({ prenom: "Pompon" });
  });

  it("explique comment se connecter quand l'abonnement n'est pas connecté", () => {
    const err = errorOf(() =>
      interpretResult(result({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" }), Schema),
    );
    expect(err.code).toBe("claude_login_required");
    expect(err.message).toContain("npm run claude:login");
  });

  it("signale la limite d'utilisation de l'abonnement", () => {
    const err = errorOf(() =>
      interpretResult(result({ type: "result", subtype: "success", is_error: true, result: "Claude usage limit reached. Your limit resets at 5pm" }), Schema),
    );
    expect(err.code).toBe("claude_usage_limit");
  });

  it("traite une sortie absente ou non conforme comme une réponse invalide (nouvel essai possible)", () => {
    const noOutput = result({ type: "result", subtype: "success", is_error: false, result: "" });
    expect(errorOf(() => interpretResult(noOutput, Schema)).code).toBe("ai_invalid_output");
    const retries = result({ type: "result", subtype: "error_max_structured_output_retries", is_error: true });
    expect(errorOf(() => interpretResult(retries, Schema)).code).toBe("ai_invalid_output");
    const wrong = result({ type: "result", subtype: "success", is_error: false, result: "", structured_output: { nom: 1 } });
    expect(errorOf(() => interpretResult(wrong, Schema)).code).toBe("ai_invalid_output");
  });
});

describe("subscriptionEnv", () => {
  it("retire les clés API et les variables d'une session Claude parente, garde le reste", () => {
    const env = subscriptionEnv({
      PATH: "/bin",
      ANTHROPIC_API_KEY: "sk-ant-x",
      ANTHROPIC_BASE_URL: "http://proxy",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "desktop",
      CLAUDE_CODE_OAUTH_TOKEN: "jeton",
      CLAUDE_CONFIG_DIR: "/home/.claude",
    });
    expect(env).toEqual({ PATH: "/bin", CLAUDE_CODE_OAUTH_TOKEN: "jeton", CLAUDE_CONFIG_DIR: "/home/.claude" });
  });
});

describe("SettingsRoutedGenerator", () => {
  const named = (name: string): TextGenerator => ({ generate: async <T>(_: GenerateRequest<T>) => name as T });
  const req: GenerateRequest<string> = { system: "", prompt: "", schema: z.string() };

  it("utilise l'abonnement par défaut, puis la clé API si l'utilisateur la choisit", async () => {
    const settings = new SettingsStore(await tempDir(), {});
    const router = new SettingsRoutedGenerator(settings, { subscription: named("abonnement"), api: named("api") });
    expect(await router.generate(req)).toBe("abonnement");
    await settings.update({ textProvider: "api" });
    expect(await router.generate(req)).toBe("api");
  });
});
