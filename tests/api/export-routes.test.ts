import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app";
import { FamilyStore } from "../../src/server/storage/family";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import { createReferenceProject } from "../fixtures/media";
import { FakeTextGenerator } from "../fixtures/ai/fake";
import { AudioService } from "../../src/server/audio/generate";
import { PictoService } from "../../src/server/images/pictos";
import { FakeImages } from "../fixtures/images";
import { FakeTts } from "../fixtures/tts";
import { noLunii, useTempDir } from "../helpers";

const tempDir = useTempDir();

async function setup() {
  const dir = await tempDir();
  const projects = new ProjectStore(dir);
  const fail = async () => ({ ok: false, message: "non testé" });
  const app = await buildApp({
    family: new FamilyStore(dir),
    projects,
    settings: new SettingsStore(dir, {}),
    testers: { subscription: fail, anthropic: fail, elevenlabs: fail, gemini: fail },
    text: new FakeTextGenerator([]),
    voices: { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() },
    audio: new AudioService(projects, { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() }),
    pictos: new PictoService(projects, new FakeImages()),
    lunii: noLunii(dir),
    dataDir: dir,
  });
  return { app, projects };
}

describe("routes d'export", () => {
  it("vérifie, exporte puis sert le pack en téléchargement", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);

    const check = await app.inject({ method: "GET", url: `/api/projects/${project.id}/export/check` });
    expect(check.json()).toEqual({ ok: true, issues: [] });

    const exported = await app.inject({ method: "POST", url: `/api/projects/${project.id}/export` });
    expect(exported.statusCode).toBe(200);
    const file = (exported.json().file as string).split("/").pop()!;
    expect(file).toMatch(/^\[5\][a-z0-9]/);

    const download = await app.inject({ method: "GET", url: `/api/projects/${project.id}/exports/${file}` });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toContain("application/zip");
    expect(download.headers["content-disposition"]).toContain(file);
    expect(download.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("refuse un export incomplet avec la liste des manques (422)", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);
    await projects.update(project.id, (p) => {
      p.graph!.segments[0]!.audio = null;
    });
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/export` });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("export_invalid");
    expect(body.issues).toContainEqual(expect.objectContaining({ code: "segment_audio_missing", target: { kind: "segment", id: "intro" } }));
  });

  it("répond 404 en français pour un projet ou un export inconnu", async () => {
    const { app, projects } = await setup();
    const project = await projects.create();
    const missing = await app.inject({ method: "GET", url: "/api/projects/inconnu/export/check" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.message).toBe("Projet introuvable.");
    const noFile = await app.inject({ method: "GET", url: `/api/projects/${project.id}/exports/x.zip` });
    expect(noFile.statusCode).toBe(404);
  });

  it("ne renvoie jamais une clé via les réglages", async () => {
    const { app } = await setup();
    await app.inject({ method: "PUT", url: "/api/settings", payload: { anthropicApiKey: "sk-ant-secret-0000" } });
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.body).not.toContain("sk-ant-secret-0000");
    expect(res.json().keys.anthropicApiKey).toEqual({ configured: true, last4: "0000" });
  });
});
