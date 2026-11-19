import type { AudioStatus, ProjectView } from "@shared/api";
import { PROJECT_STAGES, type Project, ProjectStage, SizeSettings } from "@shared/model";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { pictoTargets } from "../images/pictos";
import { AppError } from "../errors";
import { estimateSize } from "@shared/estimate";
import { planJobs } from "../audio/generate";
import { clipState, lineState, narrator, segmentAudioState, spokenTextHash } from "../story/state";
import { validateGraph } from "../story/validate";

// Projet + états dérivés (validité du graphe, estimation de taille) renvoyés à l'interface.
export function projectView(project: Project): ProjectView {
  return {
    ...project,
    derived: {
      graphIssues: project.graph ? validateGraph(project.graph, project.sizeSettings) : [],
      estimate: estimateSize(project.sizeSettings),
      audio: audioStatus(project),
      pictos: pictoTargets(project),
    },
  };
}

const ProjectCreate = z.object({
  title: z.string().min(1).max(80).optional(),
  brief: z.string().max(4000).optional(),
  listenerAge: z.number().int().min(2).max(10).optional(),
});

const ProjectPatch = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  brief: z.string().max(4000).optional(),
  listenerAge: z.number().int().min(2).max(10).optional(),
  sizeSettings: SizeSettings.partial().optional(),
  stage: ProjectStage.optional(),
  visualStyle: z.string().nullable().optional(),
});

function audioStatus(project: Project): AudioStatus | null {
  const graph = project.graph;
  if (!graph) return null;
  const reader = narrator(project);
  const lines = Object.fromEntries(graph.segments.flatMap((s) => s.lines).map((l) => [l.id, lineState(l, project.characters)]));
  const segments = Object.fromEntries(graph.segments.map((s) => [s.id, segmentAudioState(s, project.characters)]));
  const options = Object.fromEntries(
    graph.choices.flatMap((c) => c.options).map((o) => [o.id, clipState(o.announceAudio, spokenTextHash(o.label, reader))]),
  );
  const { jobs, recordedPending } = planJobs(project, "all");
  return {
    lines,
    segments,
    options,
    title: clipState(project.titleAudio, spokenTextHash(project.title, reader)),
    toGenerate: jobs.filter((j) => j.character.voice && j.character.voice.source !== "recorded").length,
    toRecord: recordedPending,
    toAssign: jobs.filter((j) => !j.character.voice).length,
  };
}

// Ce qu'il faut pour atteindre une étape du parcours (constitution, principe IV).
function stageBlocker(project: Project, stage: ProjectStage): string | null {
  switch (stage) {
    case "brief":
      return null;
    case "scenarios":
      return project.brief.trim() ? null : "Décrivez d'abord l'histoire souhaitée.";
    case "story":
      return project.selectedScenarioId ? null : "Choisissez d'abord un scénario.";
    default:
      if (!project.graph) return "L'histoire doit d'abord être générée.";
      return validateGraph(project.graph, project.sizeSettings).some((i) => i.severity === "error")
        ? "L'histoire contient des erreurs à corriger avant de continuer."
        : null;
  }
}

export async function projectRoutes(app: FastifyInstance, { projects }: AppDeps) {
  app.get("/api/projects", async () => (await projects.list()).map(projectView));

  app.post("/api/projects", async (req) => projectView(await projects.create(ProjectCreate.parse(req.body ?? {}))));

  app.put("/api/projects/order", async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
    await projects.setOrder(ids);
    return (await projects.list()).map(projectView);
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    await projects.delete(req.params.id);
    return (await projects.list()).map(projectView);
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req) => projectView(await projects.get(req.params.id)));

  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const patch = ProjectPatch.parse(req.body);
    const saved = await projects.update(req.params.id, (p) => {
      const { sizeSettings, stage, ...rest } = patch;
      const next: Project = { ...p, ...rest, sizeSettings: { ...p.sizeSettings, ...sizeSettings } };
      // L'étape enregistrée est la plus avancée atteinte : on ne la fait jamais reculer.
      if (stage && PROJECT_STAGES.indexOf(stage) > PROJECT_STAGES.indexOf(p.stage)) {
        const blocker = stageBlocker(next, stage);
        if (blocker) throw new AppError("stage_blocked", blocker);
        next.stage = stage;
      }
      return next;
    });
    return projectView(saved);
  });
}
