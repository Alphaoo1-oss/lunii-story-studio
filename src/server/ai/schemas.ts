import { z } from "zod";

// Formats de réponse imposés à Claude (structured outputs). Les contraintes non prises en
// charge par l'API (longueurs, nombre d'éléments) sont vérifiées côté client par le SDK.

export const ScenariosOutput = z.object({
  assumptions: z.array(z.string()),
  scenarios: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        summary: z.string().min(1),
        characters: z.array(
          z.object({
            name: z.string().min(1),
            age: z.number().int().nullable(),
            description: z.string(),
          }),
        ),
        choiceIdeas: z.array(z.string()),
      }),
    )
    .length(4),
});
export type ScenariosOutput = z.infer<typeof ScenariosOutput>;

export const SkeletonOutput = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  startSegmentId: z.string(),
  segments: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        summary: z.string(),
        next: z.object({
          kind: z.enum(["choice", "segment", "end"]),
          choiceId: z.string().nullable(),
          segmentId: z.string().nullable(),
        }),
      }),
    )
    .min(1),
  choices: z.array(
    z.object({
      id: z.string().min(1),
      prompt: z.string(),
      options: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1).max(60),
            targetSegmentId: z.string(),
          }),
        )
        .min(2)
        .max(3),
    }),
  ),
});
export type SkeletonOutput = z.infer<typeof SkeletonOutput>;

// Le personnage de chaque réplique est contraint aux identifiants du projet.
export function segmentsTextOutput(characterIds: [string, ...string[]]) {
  return z.object({
    segments: z.array(
      z.object({
        id: z.string(),
        lines: z
          .array(
            z.object({
              characterId: z.enum(characterIds),
              text: z.string().min(1).max(1000),
            }),
          )
          .min(1),
      }),
    ),
  });
}
export type SegmentsTextOutput = z.infer<ReturnType<typeof segmentsTextOutput>>;
