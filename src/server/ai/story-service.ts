import { randomUUID } from "node:crypto";
import type { Character, FamilyMember, Line, Project, Segment, StoryGraph } from "@shared/model";
import { AppError, notFound } from "../errors";
import { findMember } from "../storage/family";
import { validateGraph } from "../story/validate";
import type { GenerateRequest, TextGenerator } from "./generator";
import { retryPrompt, scenariosPrompt, segmentsTextPrompt, skeletonPrompt, systemPrompt } from "./prompts";
import { ScenariosOutput, SkeletonOutput, segmentsTextOutput } from "./schemas";

// Nombre de segments écrits par appel : assez pour la cohérence, assez peu pour rester rapide.
const SEGMENTS_PER_BATCH = 6;
const NARRATOR_ID = "narrateur";

// Parcours US1 : indications → 4 scénarios → choix → histoire → réécriture d'un segment.
// Les méthodes renvoient le projet modifié ; l'appelant l'enregistre.
export class StoryService {
  constructor(private readonly text: TextGenerator) {}

  async proposeScenarios(project: Project, extraHint?: string, family: FamilyMember[] = []): Promise<Project> {
    if (!project.brief.trim()) {
      throw new AppError("brief_missing", "Décrivez d'abord l'histoire souhaitée dans les indications.");
    }
    const output = await this.generateChecked(
      { system: systemPrompt(project.listenerAge), prompt: scenariosPrompt(project, extraHint, family), schema: ScenariosOutput },
      (o) => {
        const titles = new Set(o.scenarios.map((s) => s.title.trim().toLowerCase()));
        return titles.size < o.scenarios.length ? "Deux scénarios portent le même titre : les 4 doivent être distincts." : null;
      },
    );
    const batch = output.scenarios.map((s) => ({ ...s, id: randomUUID() }));
    return {
      ...project,
      scenarioBatches: [...project.scenarioBatches, batch],
      assumptions: output.assumptions,
      stage: project.stage === "brief" ? "scenarios" : project.stage,
    };
  }

  // Les personnes de la famille gardent leur apparence et leur voix d'une histoire à l'autre.
  selectScenario(project: Project, scenarioId: string, family: FamilyMember[] = []): Project {
    const scenario = project.scenarioBatches.flat().find((s) => s.id === scenarioId);
    if (!scenario) throw notFound("Scénario");
    const characters: Character[] = [
      { id: NARRATOR_ID, name: "Narrateur", isNarrator: true, age: null, description: "Voix qui raconte l'histoire.", appearance: "", voice: null },
    ];
    for (const c of scenario.characters) {
      if (characters.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) continue;
      const member = findMember(family, c.name);
      characters.push({
        id: uniqueId(slug(c.name), characters.map((x) => x.id)),
        name: c.name,
        isNarrator: false,
        age: c.age ?? null,
        description: c.description,
        appearance: member?.appearance ?? "",
        voice: member?.voice ?? null,
      });
    }
    return {
      ...project,
      selectedScenarioId: scenario.id,
      title: scenario.title.slice(0, 80),
      characters,
      graph: null,
      stage: "story",
    };
  }

  async generateStory(project: Project): Promise<Project> {
    const scenario = project.scenarioBatches.flat().find((s) => s.id === project.selectedScenarioId);
    if (!scenario) throw new AppError("scenario_missing", "Choisissez d'abord un scénario.");
    const system = systemPrompt(project.listenerAge);

    // 1. Squelette : structure validée en code (et conforme aux réglages de taille).
    const skeleton = await this.generateChecked(
      { system, prompt: skeletonPrompt(project, scenario), schema: SkeletonOutput },
      (s) => {
        const issues = validateGraph(toGraph(s, () => []), project.sizeSettings);
        return issues.length ? issues.map((i) => `- ${i.message}`).join("\n") : null;
      },
    );
    const titled: Project = { ...project, title: skeleton.title, description: skeleton.description };

    // 2. Texte des segments, par lots, avec le plan complet en contexte.
    const texts = new Map<string, Line[]>();
    const ids = skeleton.segments.map((s) => s.id);
    for (let i = 0; i < ids.length; i += SEGMENTS_PER_BATCH) {
      const batch = ids.slice(i, i + SEGMENTS_PER_BATCH);
      for (const [id, lines] of await this.writeSegments(titled, skeleton, batch)) texts.set(id, lines);
    }

    return { ...titled, graph: toGraph(skeleton, (id) => texts.get(id)!) };
  }

  async regenerateSegment(project: Project, segmentId: string, instruction?: string): Promise<Project> {
    const graph = project.graph;
    const segment = graph?.segments.find((s) => s.id === segmentId);
    if (!graph || !segment) throw notFound("Étape");
    const current = segment.lines.map((l) => `${l.characterId} : ${l.text}`).join("\n");
    const texts = await this.writeSegments(project, graph, [segmentId], { instruction, current });
    return {
      ...project,
      graph: {
        ...graph,
        segments: graph.segments.map((s) => (s.id === segmentId ? { ...s, lines: texts.get(segmentId)!, audio: null } : s)),
      },
    };
  }

  private async writeSegments(
    project: Project,
    plan: SkeletonOutput | StoryGraph,
    segmentIds: string[],
    extra?: { instruction?: string; current?: string },
  ): Promise<Map<string, Line[]>> {
    const characterIds = project.characters.map((c) => c.id) as [string, ...string[]];
    const output = await this.generateChecked(
      {
        system: systemPrompt(project.listenerAge),
        prompt: segmentsTextPrompt(project, plan, segmentIds, extra),
        schema: segmentsTextOutput(characterIds),
      },
      (o) => {
        const missing = segmentIds.filter((id) => !o.segments.some((s) => s.id === id));
        return missing.length ? `Il manque le texte des segments : ${missing.join(", ")}.` : null;
      },
    );
    return new Map(
      segmentIds.map((id) => [
        id,
        output.segments
          .find((s) => s.id === id)!
          .lines.map((l) => ({ id: randomUUID(), characterId: l.characterId, text: l.text, textHash: null, audio: null })),
      ]),
    );
  }

  // Génère, vérifie, et réessaie une fois en signalant à Claude ce qui n'allait pas.
  private async generateChecked<T>(req: GenerateRequest<T>, check: (output: T) => string | null): Promise<T> {
    let problems: string;
    try {
      const output = await this.text.generate(req);
      const issue = check(output);
      if (!issue) return output;
      problems = issue;
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== "ai_invalid_output") throw err;
      problems = err.message;
    }
    try {
      const output = await this.text.generate({ ...req, prompt: retryPrompt(req.prompt, problems) });
      const issue = check(output);
      if (!issue) return output;
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== "ai_invalid_output") throw err;
    }
    throw new AppError(
      "ai_unusable",
      "Claude n'a pas réussi à produire une histoire utilisable. Vous pouvez réessayer ou modifier les réglages.",
      502,
    );
  }
}

function toGraph(skeleton: SkeletonOutput, linesOf: (segmentId: string) => Line[]): StoryGraph {
  return {
    startSegmentId: skeleton.startSegmentId,
    segments: skeleton.segments.map(
      (s): Segment => ({
        id: s.id,
        title: s.title,
        // Le squelette n'a pas encore de texte : une réplique provisoire tient la place.
        lines: linesOf(s.id).length ? linesOf(s.id) : [{ id: `${s.id}-plan`, characterId: NARRATOR_ID, text: s.summary || s.title, textHash: null, audio: null }],
        next:
          s.next.kind === "choice"
            ? { kind: "choice", choiceId: s.next.choiceId ?? "" }
            : s.next.kind === "segment"
              ? { kind: "segment", segmentId: s.next.segmentId ?? "" }
              : { kind: "end" },
        audio: null,
      }),
    ),
    choices: skeleton.choices.map((c) => ({
      id: c.id,
      prompt: c.prompt,
      options: c.options.map((o) => ({ ...o, announceAudio: null, picto: null })),
    })),
  };
}

function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "personnage"
  );
}

function uniqueId(base: string, taken: string[]): string {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
