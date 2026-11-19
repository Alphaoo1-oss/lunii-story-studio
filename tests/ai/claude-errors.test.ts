import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { translateError } from "../../src/server/ai/claude";

const apiError = (status: number, message: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "invalid_request_error", message } }, undefined, new Headers());

describe("translateError", () => {
  it("explique en français un crédit épuisé, sans JSON brut", () => {
    const err = translateError(apiError(400, "Your credit balance is too low to access the Anthropic API."));
    expect(err.code).toBe("anthropic_credit");
    expect(err.message).toMatch(/plus de crédit/);
    expect(err.message).toMatch(/console\.anthropic\.com/);
    expect(err.message).not.toContain("{");
  });

  it("ne montre que le message de l'API pour les autres requêtes refusées", () => {
    const err = translateError(apiError(400, "max_tokens: too large"));
    expect(err.code).toBe("anthropic_bad_request");
    expect(err.message).toBe("Anthropic a refusé la requête : max_tokens: too large");
  });

  it("traduit une clé refusée et un quota atteint", () => {
    expect(translateError(apiError(401, "invalid x-api-key")).code).toBe("anthropic_auth");
    expect(translateError(apiError(429, "rate limited")).code).toBe("anthropic_quota");
  });
});
