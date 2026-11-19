import { DEFAULT_SIZE_SETTINGS, Project } from "@shared/model";
import { describe, expect, it } from "vitest";
import { StoryService } from "../../src/server/ai/story-service";
import { AppError } from "../../src/server/errors";
import { validateGraph } from "../../src/server/story/validate";
import { FakeTextGenerator, loadAiFixture, TRUNCATED } from "../fixtures/ai/fake";

const now = new Date().toISOString();
const baseProject = (): Project =>
  Project.parse({
    id: "p1",
    title: "Nouvelle histoire",
    brief: "Léo, 6 ans, et sa sœur Mia, 4 ans, une aventure d'Halloween pas trop effrayante.",
    listenerAge: 5,
    sizeSettings: DEFAULT_SIZE_SETTINGS,
    createdAt: now,
    updatedAt: now,
  });

async function withScenarios(gen: FakeTextGenerator) {
  const service = new StoryService(gen);
  const project = await service.proposeScenarios(baseProject());
  return { service, project };
}

describe("StoryService.proposeScenarios", () => {
  it("propose exactement 4 scénarios distincts et passe à l'étape scénarios", async () => {
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios")]);
    const { project } = await withScenarios(gen);
    const batch = project.scenarioBatches.at(-1)!;
    expect(batch).toHaveLength(4);
    expect(new Set(batch.map((s) => s.title)).size).toBe(4);
    expect(new Set(batch.map((s) => s.id)).size).toBe(4);
    expect(project.stage).toBe("scenarios");
  });

  it("envoie à Claude les règles de sécurité, le français, l'âge de l'auditeur et la précision ajoutée", async () => {
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios")]);
    await new StoryService(gen).proposeScenarios(baseProject(), "avec un chat noir");
    const { system, prompt } = gen.calls[0]!;
    expect(system).toMatch(/français/i);
    expect(system).toMatch(/violence/i);
    expect(system).toMatch(/rassurant/i);
    expect(system).toMatch(/5 ans/);
    expect(prompt).toContain("Léo, 6 ans");
    expect(prompt).toContain("avec un chat noir");
  });

  it("réessaie une fois quand la réponse est invalide, puis réussit", async () => {
    const valid = await loadAiFixture("scenarios");
    const threeOnly = structuredClone(valid) as { scenarios: unknown[] };
    threeOnly.scenarios.pop();
    const gen = new FakeTextGenerator([threeOnly, valid]);
    const { project } = await withScenarios(gen);
    expect(project.scenarioBatches.at(-1)).toHaveLength(4);
    expect(gen.calls).toHaveLength(2);
    expect(gen.calls[1]!.prompt).toMatch(/précédente réponse/i);
  });

  it("abandonne après deux réponses invalides avec un message en français", async () => {
    const gen = new FakeTextGenerator([TRUNCATED, TRUNCATED]);
    const err = await new StoryService(gen).proposeScenarios(baseProject()).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toMatch(/réessayer/i);
  });
});

describe("StoryService.selectScenario", () => {
  it("retient le scénario et crée les personnages avec un narrateur", async () => {
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios")]);
    const { service, project } = await withScenarios(gen);
    const scenario = project.scenarioBatches[0]![0]!;
    const selected = service.selectScenario(project, scenario.id);
    expect(selected.selectedScenarioId).toBe(scenario.id);
    expect(selected.title).toBe(scenario.title);
    expect(selected.stage).toBe("story");
    expect(selected.characters.map((c) => [c.id, c.name, c.isNarrator])).toEqual([
      ["narrateur", "Narrateur", true],
      ["leo", "Léo", false],
      ["mia", "Mia", false],
    ]);
  });

  it("reprend l'apparence et la voix des personnes de la fiche famille", async () => {
    const family = [
      {
        id: "f1",
        name: "Leo",
        aliases: [],
        appearance: "Cheveux roux bouclés, taches de rousseur.",
        voice: { source: "voicebox" as const, voiceId: "v-leo", settings: {} },
        livesAtHome: false,
      },
    ];
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios")]);
    const service = new StoryService(gen);
    const project = await service.proposeScenarios(baseProject(), undefined, family);
    expect(gen.calls[0]!.prompt).toContain("Cheveux roux bouclés");
    const selected = service.selectScenario(project, project.scenarioBatches[0]![0]!.id, family);
    const leo = selected.characters.find((c) => c.name === "Léo")!;
    expect(leo.appearance).toBe("Cheveux roux bouclés, taches de rousseur.");
    expect(leo.voice?.voiceId).toBe("v-leo");
    expect(selected.characters.find((c) => c.name === "Mia")!.appearance).toBe("");
  });

  it("indique à Claude qui habite à la maison", async () => {
    const member = (name: string, livesAtHome: boolean) => ({ id: name, name, aliases: [], appearance: "", voice: null, livesAtHome });
    const family = [member("Papa", true), member("Pompon", true), member("Mamie Rose", false)];
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios")]);
    await new StoryService(gen).proposeScenarios(baseProject(), undefined, family);
    const prompt = gen.calls[0]!.prompt;
    expect(prompt).toContain("Vivent ensemble dans la même maison, celle de l'enfant : Papa, Pompon.");
    expect(prompt).not.toMatch(/maison[^\n]*Mamie Rose/);
  });
});

describe("StoryService.generateStory", () => {
  async function selected(responses: unknown[]) {
    const gen = new FakeTextGenerator([await loadAiFixture("scenarios"), ...responses]);
    const { service, project } = await withScenarios(gen);
    return { gen, service, project: service.selectScenario(project, project.scenarioBatches[0]![0]!.id) };
  }

  it("produit un graphe valide, conforme aux réglages, avec le texte de chaque étape", async () => {
    const { service, project } = await selected([await loadAiFixture("skeleton"), await loadAiFixture("segments")]);
    const result = await service.generateStory(project);
    expect(validateGraph(result.graph!, result.sizeSettings)).toEqual([]);
    expect(result.graph!.segments).toHaveLength(5);
    expect(result.graph!.segments.find((s) => s.id === "intro")!.lines[1]).toMatchObject({
      characterId: "mia",
      text: "Elle nous fait un clin d'œil !",
      audio: null,
    });
    expect(result.description).toMatch(/Halloween/);
  });

  it("rejette un squelette dont une option mène nulle part, puis réessaie", async () => {
    const skeleton = (await loadAiFixture("skeleton")) as { choices: { options: { targetSegmentId: string }[] }[] };
    const broken = structuredClone(skeleton);
    broken.choices[0]!.options[0]!.targetSegmentId = "inconnu";
    const { gen, service, project } = await selected([broken, skeleton, await loadAiFixture("segments")]);
    await service.generateStory(project);
    expect(gen.calls[2]!.prompt).toMatch(/ne mène à aucune étape/);
  });

  it("rejette un squelette qui ne respecte pas les réglages de taille", async () => {
    const skeleton = await loadAiFixture("skeleton");
    const { gen, service, project } = await selected([skeleton, skeleton]);
    const strict = { ...project, sizeSettings: { ...project.sizeSettings, choicesPerPath: 1 } };
    const err = await service.generateStory(strict).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(gen.calls[2]!.prompt).toMatch(/choix/);
  });

  it("demande le texte de chaque étape en respectant la durée visée", async () => {
    const { gen, service, project } = await selected([await loadAiFixture("skeleton"), await loadAiFixture("segments")]);
    await service.generateStory(project);
    const textCall = gen.calls.at(-1)!;
    expect(textCall.prompt).toContain("intro");
    expect(textCall.prompt).toMatch(/mots/);
  });
});

describe("StoryService.regenerateSegment", () => {
  it("ne change que le segment visé", async () => {
    const gen = new FakeTextGenerator([
      await loadAiFixture("scenarios"),
      await loadAiFixture("skeleton"),
      await loadAiFixture("segments"),
      await loadAiFixture("segment-regenerated"),
    ]);
    const service = new StoryService(gen);
    let project = await service.proposeScenarios(baseProject());
    project = service.selectScenario(project, project.scenarioBatches[0]![0]!.id);
    project = await service.generateStory(project);
    const before = structuredClone(project.graph!);

    const after = await service.regenerateSegment(project, "foret", "avec un renard");
    expect(gen.calls.at(-1)!.prompt).toContain("avec un renard");
    const foret = after.graph!.segments.find((s) => s.id === "foret")!;
    expect(foret.lines[0]!.text).toMatch(/renard/);
    expect(foret.next).toEqual(before.segments.find((s) => s.id === "foret")!.next);
    for (const segment of before.segments.filter((s) => s.id !== "foret")) {
      expect(after.graph!.segments.find((s) => s.id === segment.id)).toEqual(segment);
    }
    expect(after.graph!.choices).toEqual(before.choices);
  });
});
