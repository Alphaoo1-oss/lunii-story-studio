import { describe, expect, it } from "vitest";
import type { AudioEvent } from "@shared/api";
import { buildApp } from "../../src/server/app";
import { AudioService } from "../../src/server/audio/generate";
import { PictoService } from "../../src/server/images/pictos";
import { FamilyStore } from "../../src/server/storage/family";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import { FakeTextGenerator } from "../fixtures/ai/fake";
import { createReferenceProject } from "../fixtures/media";
import { FakeImages } from "../fixtures/images";
import { FakeTts } from "../fixtures/tts";
import { noLunii, useTempDir } from "../helpers";

const tempDir = useTempDir();

async function setup() {
  const dir = await tempDir();
  const projects = new ProjectStore(dir);
  const piper = new FakeTts();
  const fail = async () => ({ ok: false, message: "non testé" });
  const app = await buildApp({
    family: new FamilyStore(dir),
    projects,
    settings: new SettingsStore(dir, {}),
    testers: { subscription: fail, anthropic: fail, elevenlabs: fail, gemini: fail },
    text: new FakeTextGenerator([]),
    voices: { voicebox: new FakeTts(), piper, elevenlabs: new FakeTts() },
    audio: new AudioService(projects, { voicebox: new FakeTts(), piper, elevenlabs: new FakeTts() }),
    pictos: new PictoService(projects, new FakeImages()),
    lunii: noLunii(dir),
    dataDir: dir,
  });
  return { app, projects, piper };
}

const events = (body: string): AudioEvent[] =>
  body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as AudioEvent);

describe("routes des voix", () => {
  it("attribue une voix, l'état des audios devient obsolète, la génération le remet à jour", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/characters/narrateur`,
      payload: { voice: { source: "piper", voiceId: "fr_FR-tom-medium", settings: {} } },
    });
    const audio = patched.json().derived.audio;
    expect(audio.lines["intro-1"]).toBe("stale");
    expect(audio.toGenerate).toBe(12);
    expect(audio.toRecord).toBe(0);
    expect(audio.toAssign).toBe(0);

    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/audio/generate`, payload: { scope: "all" } });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const stream = events(res.body);
    expect(stream.filter((e) => e.type === "progress")).toHaveLength(12);
    expect(stream.at(-1)).toEqual({ type: "done", generated: 12, recordedPending: 0 });

    const after = (await app.inject({ method: "GET", url: `/api/projects/${project.id}` })).json().derived.audio;
    expect(Object.values(after.segments).every((s) => s === "ok")).toBe(true);
    expect(after.toGenerate).toBe(0);
  });

  it("refuse une voix de synthèse sans identifiant", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/characters/leo`,
      payload: { voice: { source: "elevenlabs", voiceId: null, settings: {} } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("transmet l'erreur dans le flux sans perdre le travail", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);
    await projects.update(project.id, (p) => {
      p.characters.find((c) => c.id === "narrateur")!.voice = null;
      p.graph!.segments[0]!.lines[0]!.audio = null;
    });
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/audio/generate`, payload: {} });
    expect(events(res.body).at(-1)).toMatchObject({ type: "error", message: expect.stringMatching(/Narrateur/) });
  });

  it("liste, télécharge et fait écouter les voix locales", async () => {
    const { app, piper } = await setup();
    expect((await app.inject({ method: "GET", url: "/api/voices?source=piper" })).json()[0].id).toBe("fake-voice");
    await app.inject({ method: "POST", url: "/api/voices/piper/install", payload: { voiceId: "fake-voice" } });
    expect(piper.installed).toEqual(["fake-voice"]);

    const preview = await app.inject({ method: "POST", url: "/api/voices/preview", payload: { source: "piper", voiceId: "fake-voice" } });
    expect(preview.headers["content-type"]).toBe("audio/mpeg");
    // Le même aperçu est servi depuis le cache, sans nouvel appel.
    await app.inject({ method: "POST", url: "/api/voices/preview", payload: { source: "piper", voiceId: "fake-voice" } });
    expect(piper.calls).toHaveLength(1);
  });
});
