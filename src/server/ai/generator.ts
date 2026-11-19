import type { z } from "zod";

// Génération de texte structuré, injectable : Claude en production, doublure dans les tests.
export type GenerateRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
};

export interface TextGenerator {
  // Rejette avec AppError("ai_invalid_output") si la réponse ne respecte pas le schéma.
  generate<T>(req: GenerateRequest<T>): Promise<T>;
}
