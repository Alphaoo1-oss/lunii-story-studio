import { describe, expect, it } from "vitest";
import type { PictoEvent, PictoTarget } from "@shared/api";
import sharp from "sharp";
import { buildApp } from "../../src/server/app";
import { AudioService } from "../../src/server/audio/generate";
import { PictoService } from "../../src/server/images/pictos";
import { FamilyStore } from "../../src/server/storage/family";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import { FakeTextGenerator } from "../fixtures/ai/fake";
import { FakeImages } from "../fixtures/images";
import { createReferenceProject } from "../fixtures/media";
import { FakeTts } from "../fixtures/tts";
import { noLunii, useTempDir } from "../helpers";

const tempDir = useTempDir();

async function setup(images = new FakeImages()) {
  const dir = await tempDir();
  const projects = new ProjectStore(dir);
  const fail = async () => ({ ok: false, message: "non testé" });
  const tts = { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() };
  const app = await buildApp({
    family: new FamilyStore(dir),
    projects,
    settings: new SettingsStore(dir, {}),
    testers: { subscription: fail, anthropic: fail, elevenlabs: fail, gemini: fail },
    text: new FakeTextGenerator([]),
    voices: tts,
    audio: new AudioService(projects, tts),
    pictos: new PictoService(projects, images),
    lunii: noLunii(dir),
    dataDir: dir,
  });
  return { app, projects, images };
}

const events = (body: string): PictoEvent[] =>
  body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as PictoEvent);

async function pictos(app: Awaited<ReturnType<typeof setup>>["app"], id: string): Promise<PictoTarget[]> {
  return (await app.inject({ method: "GET", url: `/api/projects/${id}` })).json().derived.pictos;
}

describe("pictos", () => {
  it("propose les styles, le pixel art rétro en premier", async () => {
    const { app } = await setup();
    const styles = (await app.inject({ method: "GET", url: "/api/styles" })).json();
    expect(styles[0]).toMatchObject({ id: "pixel-art", label: "Pixel art rétro" });
    expect(styles.length).toBeGreaterThanOrEqual(4);
  });

  it("génère la couverture puis un picto par option, en 320×240, avec le style et les personnages", async () => {
    const { app, projects, images } = await setup();
    const project = await createReferenceProject(projects);
    const options = project.graph!.choices.flatMap((c) => c.options);

    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/pictos/generate`, payload: { style: "pixel-art" } });
    const stream = events(res.body);
    // Toutes les cibles : les pictos existants ont été faits dans un autre style.
    expect(stream.at(-1)).toEqual({ type: "done", generated: 1 + options.length });
    expect(images.requests).toHaveLength(1 + options.length);

    const [cover, first] = images.requests;
    expect(cover!.prompt).toMatch(/8-bit pixel art/);
    expect(cover!.prompt).toContain(project.title);
    expect(cover!.prompt).toContain("Never include any text");
    for (const c of project.characters.filter((c) => !c.isNarrator)) expect(first!.prompt).toContain(c.description);
    expect(first!.prompt).toContain(options[0]!.label);
    // La couverture sert de référence aux options, pour garder le même style.
    expect(cover!.references).toEqual([]);
    expect(first!.references).toHaveLength(1);

    const after = await pictos(app, project.id);
    expect(after.every((t) => t.state === "ok")).toBe(true);
    const meta = await sharp(projects.file(project.id, after[0]!.file!)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 320, 240]);
  });

  it("marque un picto à refaire quand le style ou le libellé change, et ne refait que ceux-là", async () => {
    const { app, projects, images } = await setup();
    const project = await createReferenceProject(projects);
    await app.inject({ method: "POST", url: `/api/projects/${project.id}/pictos/generate`, payload: { style: "pixel-art" } });
    const option = project.graph!.choices[0]!.options[1]!;
    await projects.update(project.id, (p) => {
      p.graph!.choices[0]!.options[1]!.label = "Le grand chêne";
    });
    expect((await pictos(app, project.id)).find((t) => t.target === `option:${option.id}`)!.state).toBe("stale");

    const before = images.requests.length;
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/pictos/generate`, payload: { style: "pixel-art" } });
    expect(events(res.body).at(-1)).toEqual({ type: "done", generated: 1 });
    expect(images.requests.length - before).toBe(1);

    await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { visualStyle: "aquarelle" } });
    expect((await pictos(app, project.id)).every((t) => t.state === "stale")).toBe(true);
  });

  it("importe une image recadrée en 320×240, puis revient au picto par défaut", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);
    const photo = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "#ff0000" } }).jpeg().toBuffer();
    const boundary = "----lss";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      photo,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imported = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/pictos/cover`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    const cover = (imported.json().derived.pictos as PictoTarget[])[0]!;
    expect(cover.state).toBe("imported");
    const meta = await sharp(projects.file(project.id, cover.file!)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 320, 240]);

    const reset = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}/pictos/cover` });
    expect((reset.json().derived.pictos as PictoTarget[])[0]).toMatchObject({ state: "default", file: null });
  });

  it("fournit les prompts à copier dans Gemini, et suit une image faite à partir d'eux", async () => {
    const { app, projects } = await setup();
    const project = await createReferenceProject(projects);
    const prompts = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/pictos/prompts?style=pixel-art` })).json();
    expect(prompts.intro).toMatch(/8-bit pixel art/);
    expect(prompts.intro).toContain("same art style");
    expect(prompts.items.map((i: { target: string }) => i.target)).toEqual((await pictos(app, project.id)).map((t) => t.target));
    expect(prompts.items[1].prompt).toMatch(/^Create ONE picture/);
    expect(prompts.items[1].prompt).toContain("320x240");

    const image = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#000000" } }).png().toBuffer();
    const boundary = "----lss";
    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/pictos/cover?style=pixel-art`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="g.png"\r\nContent-Type: image/png\r\n\r\n`),
        image,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    expect((res.json().derived.pictos as PictoTarget[])[0]!.state).toBe("ok");
    expect(res.json().visualStyle).toBe("pixel-art");
  });

  it("garde les pictos déjà faits quand Gemini échoue en cours de route", async () => {
    const { app, projects } = await setup(new FakeImages(1));
    const project = await createReferenceProject(projects);
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/pictos/generate`, payload: { style: "pixel-art" } });
    const stream = events(res.body);
    expect(stream.at(-1)).toEqual({ type: "error", message: "Le quota Gemini est atteint." });
    expect((await pictos(app, project.id))[0]!.state).toBe("ok");
  });
});
