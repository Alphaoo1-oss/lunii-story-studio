import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app";
import { FamilyStore } from "../../src/server/storage/family";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import { FakeTextGenerator, loadAiFixture } from "../fixtures/ai/fake";
import { AudioService } from "../../src/server/audio/generate";
import { PictoService } from "../../src/server/images/pictos";
import { FakeImages } from "../fixtures/images";
import { FakeTts } from "../fixtures/tts";
import { noLunii, useTempDir } from "../helpers";

const tempDir = useTempDir();

async function setup(responses: unknown[]) {
  const dir = await tempDir();
  const projects = new ProjectStore(dir);
  const text = new FakeTextGenerator(responses);
  const fail = async () => ({ ok: false, message: "non testé" });
  const app = await buildApp({
    family: new FamilyStore(dir),
    projects,
    settings: new SettingsStore(dir, {}),
    testers: { subscription: fail, anthropic: fail, elevenlabs: fail, gemini: fail },
    text,
    voices: { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() },
    audio: new AudioService(projects, { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() }),
    pictos: new PictoService(projects, new FakeImages()),
    lunii: noLunii(dir),
    dataDir: dir,
  });
  return { app, projects, text };
}

describe("fiche famille", () => {
  it("est reprise au choix du scénario, et suit les changements d'apparence et de voix", async () => {
    const { app } = await setup([await loadAiFixture("scenarios")]);
    const saved = await app.inject({
      method: "PUT",
      url: "/api/family",
      payload: { members: [{ name: "Mia", aliases: ["Mimi"], appearance: "Cheveux noirs au carré." }] },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()[0]).toMatchObject({ name: "Mia", aliases: ["Mimi"], voice: null });

    const id = (await app.inject({ method: "POST", url: "/api/projects", payload: {} })).json().id as string;
    await app.inject({ method: "PATCH", url: `/api/projects/${id}`, payload: { brief: "Léo et Mia" } });
    const scenarioId = (await app.inject({ method: "POST", url: `/api/projects/${id}/scenarios`, payload: {} })).json()
      .scenarioBatches[0][0].id as string;
    const selected = (await app.inject({ method: "POST", url: `/api/projects/${id}/scenarios/${scenarioId}/select` })).json();
    expect(selected.characters.find((c: { id: string }) => c.id === "mia").appearance).toBe("Cheveux noirs au carré.");

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}/characters/mia`,
      payload: { appearance: "Cheveux noirs longs.", voice: { source: "voicebox", voiceId: "v-mia", settings: {} } },
    });
    const family = (await app.inject({ method: "GET", url: "/api/family" })).json();
    expect(family[0]).toMatchObject({ appearance: "Cheveux noirs longs.", voice: { voiceId: "v-mia" } });
  });
});

describe("routes de l'histoire", () => {
  it("parcourt idée → scénarios → choix → histoire → modifications", async () => {
    const { app } = await setup([
      await loadAiFixture("scenarios"),
      await loadAiFixture("skeleton"),
      await loadAiFixture("segments"),
      await loadAiFixture("segment-regenerated"),
    ]);

    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {} });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}`,
      payload: { brief: "Léo, 6 ans, et Mia, 4 ans, Halloween", listenerAge: 5 },
    });
    expect(patched.json()).toMatchObject({ brief: "Léo, 6 ans, et Mia, 4 ans, Halloween", listenerAge: 5 });

    const scenarios = await app.inject({ method: "POST", url: `/api/projects/${id}/scenarios`, payload: {} });
    expect(scenarios.statusCode).toBe(200);
    const scenarioId = scenarios.json().scenarioBatches[0][0].id as string;

    const selected = await app.inject({ method: "POST", url: `/api/projects/${id}/scenarios/${scenarioId}/select` });
    expect(selected.json().stage).toBe("story");

    const story = await app.inject({ method: "POST", url: `/api/projects/${id}/story` });
    expect(story.statusCode).toBe(200);
    const view = story.json();
    expect(view.graph.segments).toHaveLength(5);
    expect(view.derived.graphIssues).toEqual([]);
    expect(view.derived.estimate.segments).toBe(5);

    const segment = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}/segments/intro`,
      payload: {
        title: "La citrouille magique",
        lines: [
          { id: "keep-me", characterId: "narrateur", text: "Il était une fois une citrouille." },
          { characterId: "mia", text: "Elle brille !" },
        ],
      },
    });
    expect(segment.statusCode).toBe(200);
    const intro = segment.json().graph.segments.find((s: { id: string }) => s.id === "intro");
    expect(intro.title).toBe("La citrouille magique");
    expect(intro.lines).toHaveLength(2);
    expect(intro.lines[1].id).toBeTruthy();

    const option = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}/options/opt-foret`,
      payload: { label: "La forêt enchantée" },
    });
    expect(option.json().graph.choices[0].options[0].label).toBe("La forêt enchantée");

    const regenerated = await app.inject({
      method: "POST",
      url: `/api/projects/${id}/segments/foret/regenerate`,
      payload: { instruction: "avec un renard" },
    });
    expect(regenerated.json().graph.segments.find((s: { id: string }) => s.id === "foret").lines[0].text).toMatch(/renard/);

    const character = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}/characters/mia`,
      payload: { description: "Petite fille en costume de chat." },
    });
    expect(character.json().characters.find((c: { id: string }) => c.id === "mia").description).toMatch(/chat/);

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.json().map((p: { id: string }) => p.id)).toEqual([id]);
  });

  it("refuse de générer des scénarios sans indications", async () => {
    const { app, text } = await setup([]);
    const id = (await app.inject({ method: "POST", url: "/api/projects", payload: {} })).json().id;
    const res = await app.inject({ method: "POST", url: `/api/projects/${id}/scenarios`, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/indications/i);
    expect(text.calls).toHaveLength(0);
  });

  it("refuse une modification qui rend l'histoire invalide pour un libellé trop long", async () => {
    const { app, projects } = await setup([]);
    const project = await projects.create({ brief: "test" });
    await projects.update(project.id, (p) => ({
      ...p,
      graph: {
        startSegmentId: "a",
        segments: [{ id: "a", title: "A", lines: [{ id: "l", characterId: "n", text: "x", textHash: null, audio: null }], next: { kind: "end" }, audio: null }],
        choices: [],
      },
    }));
    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/options/inconnue`,
      payload: { label: "x" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("n'avance l'étape que si l'histoire est valide", async () => {
    const { app, projects } = await setup([]);
    const project = await projects.create({ brief: "test" });
    const res = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { stage: "voices" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/histoire/i);
  });
});
