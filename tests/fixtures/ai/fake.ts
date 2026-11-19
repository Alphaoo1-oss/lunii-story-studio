import type { GenerateRequest, TextGenerator } from "../../../src/server/ai/generator";
import { AppError } from "../../../src/server/errors";

export const TRUNCATED = Symbol("réponse tronquée");

// Doublure du générateur : rejoue des réponses enregistrées, dans l'ordre, et garde les appels.
export class FakeTextGenerator implements TextGenerator {
  readonly calls: { system: string; prompt: string }[] = [];

  constructor(private readonly responses: unknown[]) {}

  async generate<T>(req: GenerateRequest<T>): Promise<T> {
    this.calls.push({ system: req.system, prompt: req.prompt });
    if (this.responses.length === 0) throw new Error("Aucune réponse enregistrée pour cet appel.");
    const next = this.responses.shift();
    if (next === TRUNCATED) throw new AppError("ai_invalid_output", "Réponse incomplète (JSON tronqué).", 502);
    if (next instanceof Error) throw next;
    const parsed = req.schema.safeParse(next);
    if (!parsed.success) throw new AppError("ai_invalid_output", `Réponse non conforme : ${parsed.error.message}`, 502);
    return parsed.data;
  }
}

export async function loadAiFixture(name: string): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), "utf8"));
}
