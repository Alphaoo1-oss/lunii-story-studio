import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { VoiceAssignment } from "@shared/model";
import { z } from "zod";
import type { AppDeps } from "../app";
import { StoryService } from "../ai/story-service";
import { AppError, notFound } from "../errors";
import { projectView } from "./projects";

type Params = { id: string };

const ScenariosRequest = z.object({ extraHint: z.string().max(1000).optional() });
const RegenerateRequest = z.object({ instruction: z.string().max(1000).optional() });
const SegmentPatch = z.object({
  title: z.string().min(1).max(120).optional(),
  lines: z
    .array(z.object({ id: z.string().optional(), characterId: z.string(), text: z.string().min(1).max(1000) }))
    .min(1)
    .optional(),
});
const OptionPatch = z.object({ label: z.string().min(1).max(60) });
const CharacterPatch = z.object({
  name: z.string().min(1).max(40).optional(),
  description: z.string().max(1000).optional(),
  appearance: z.string().max(1000).optional(),
  voice: VoiceAssignment.nullable().optional(),
});

// Routes US1 (contracts/http-api.md, « Scénarios et histoire »). Les générations appellent
// Claude (payant) uniquement sur action explicite de l'utilisateur.
export async function storyRoutes(app: FastifyInstance, { projects, family, text }: AppDeps) {
  const service = new StoryService(text);

  app.post<{ Params: Params }>("/api/projects/:id/scenarios", async (req) => {
    const { extraHint } = ScenariosRequest.parse(req.body ?? {});
    const result = await service.proposeScenarios(await projects.get(req.params.id), extraHint, await family.list());
    return projectView(
      await projects.update(req.params.id, (p) => ({
        ...p,
        scenarioBatches: result.scenarioBatches,
        assumptions: result.assumptions,
        stage: result.stage,
      })),
    );
  });

  app.post<{ Params: Params & { scenarioId: string } }>("/api/projects/:id/scenarios/:scenarioId/select", async (req) => {
    const members = await family.list();
    return projectView(await projects.update(req.params.id, (p) => service.selectScenario(p, req.params.scenarioId, members)));
  });

  app.post<{ Params: Params }>("/api/projects/:id/story", async (req) => {
    const result = await service.generateStory(await projects.get(req.params.id));
    return projectView(
      await projects.update(req.params.id, (p) => ({
        ...p,
        title: result.title,
        description: result.description,
        graph: result.graph,
      })),
    );
  });

  app.post<{ Params: Params & { segmentId: string } }>("/api/projects/:id/segments/:segmentId/regenerate", async (req) => {
    const { instruction } = RegenerateRequest.parse(req.body ?? {});
    const result = await service.regenerateSegment(await projects.get(req.params.id), req.params.segmentId, instruction);
    const regenerated = result.graph!.segments.find((s) => s.id === req.params.segmentId)!;
    return projectView(
      await projects.update(req.params.id, (p) => {
        if (!p.graph) throw notFound("Histoire");
        p.graph.segments = p.graph.segments.map((s) => (s.id === regenerated.id ? regenerated : s));
      }),
    );
  });

  app.patch<{ Params: Params & { segmentId: string } }>("/api/projects/:id/segments/:segmentId", async (req) => {
    const patch = SegmentPatch.parse(req.body);
    return projectView(
      await projects.update(req.params.id, (p) => {
        const segment = p.graph?.segments.find((s) => s.id === req.params.segmentId);
        if (!segment) throw notFound("Étape");
        if (patch.title) segment.title = patch.title;
        if (patch.lines) {
          for (const line of patch.lines) {
            if (!p.characters.some((c) => c.id === line.characterId)) {
              throw new AppError("unknown_character", "Une réplique est attribuée à un personnage inconnu.");
            }
          }
          // On garde les répliques existantes (et leur audio) : l'audio devient obsolète si le
          // texte a changé, ce que détecte l'empreinte.
          segment.lines = patch.lines.map((line) => {
            const existing = segment.lines.find((l) => l.id === line.id);
            return existing
              ? { ...existing, characterId: line.characterId, text: line.text }
              : { id: line.id ?? randomUUID(), characterId: line.characterId, text: line.text, textHash: null, audio: null };
          });
        }
      }),
    );
  });

  app.patch<{ Params: Params & { optionId: string } }>("/api/projects/:id/options/:optionId", async (req) => {
    const { label } = OptionPatch.parse(req.body);
    return projectView(
      await projects.update(req.params.id, (p) => {
        const option = p.graph?.choices.flatMap((c) => c.options).find((o) => o.id === req.params.optionId);
        if (!option) throw notFound("Option");
        option.label = label;
      }),
    );
  });

  app.patch<{ Params: Params & { characterId: string } }>("/api/projects/:id/characters/:characterId", async (req) => {
    const patch = CharacterPatch.parse(req.body);
    let name = "";
    const project = await projects.update(req.params.id, (p) => {
      const character = p.characters.find((c) => c.id === req.params.characterId);
      if (!character) throw notFound("Personnage");
      Object.assign(character, patch);
      name = character.name;
    });
    // Une apparence ou une voix changée ici l'est aussi dans la fiche famille.
    const { appearance, voice } = patch;
    if (appearance !== undefined || voice !== undefined) {
      await family.updateByName(name, { ...(appearance !== undefined && { appearance }), ...(voice !== undefined && { voice }) });
    }
    return projectView(project);
  });
}
