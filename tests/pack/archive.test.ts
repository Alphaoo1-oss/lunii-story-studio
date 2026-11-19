import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { probe } from "../../src/server/audio/ffmpeg";
import { AppError } from "../../src/server/errors";
import { exportProject } from "../../src/server/pack/export";
import type { StoryPack } from "../../src/server/pack/types";
import { ProjectStore } from "../../src/server/storage/projects";
import { createReferenceProject } from "../fixtures/media";
import { useTempDir } from "../helpers";
import { readZip } from "./zip";

const tempDir = useTempDir();

async function exportReference() {
  const dir = await tempDir();
  const store = new ProjectStore(dir);
  const project = await createReferenceProject(store);
  const record = await exportProject(store, project.id);
  return { dir, store, project, record, zipPath: store.file(project.id, record.file) };
}

describe("exportProject", () => {
  it("produit une archive au contenu exact : story.json, thumbnail.png et assets/", async () => {
    const { zipPath } = await exportReference();
    const entries = await readZip(zipPath);
    const names = [...entries.keys()];
    expect(names).toContain("story.json");
    expect(names).toContain("thumbnail.png");
    for (const name of names) {
      if (name === "story.json" || name === "thumbnail.png") continue;
      expect(name).toMatch(/^assets\/[0-9a-f]{40}\.(mp3|png)$/);
    }
  });

  it("référence chaque asset présent, nommé par l'empreinte SHA-1 de son contenu", async () => {
    const { zipPath } = await exportReference();
    const entries = await readZip(zipPath);
    const pack = JSON.parse(entries.get("story.json")!.toString("utf8")) as StoryPack;
    const referenced = new Set(pack.stageNodes.flatMap((s) => [s.image, s.audio]).filter((x): x is string => !!x));
    const assets = [...entries.keys()].filter((n) => n.startsWith("assets/"));
    expect(new Set(assets.map((n) => n.slice("assets/".length)))).toEqual(referenced);
    for (const name of assets) {
      const sha1 = createHash("sha1").update(entries.get(name)!).digest("hex");
      expect(name).toBe(`assets/${sha1}${name.slice(name.lastIndexOf("."))}`);
    }
  });

  it("déduplique les médias identiques", async () => {
    const { store, project } = await exportReference();
    // Même image pour les deux options du premier choix.
    await store.update(project.id, (p) => {
      const [a, b] = p.graph!.choices[0]!.options;
      b!.picto = { ...a!.picto! };
    });
    const record = await exportProject(store, project.id);
    const entries = await readZip(store.file(project.id, record.file));
    const pack = JSON.parse(entries.get("story.json")!.toString("utf8")) as StoryPack;
    const images = pack.stageNodes.map((s) => s.image).filter(Boolean);
    expect(new Set(images).size).toBeLessThan(images.length);
  });

  it("contient des médias réellement au format de la Lunii", async () => {
    const { dir, zipPath } = await exportReference();
    const entries = await readZip(zipPath);
    for (const [name, content] of entries) {
      if (name.endsWith(".png")) {
        const meta = await sharp(content).metadata();
        expect([name, meta.format, meta.width, meta.height]).toEqual([name, "png", 320, 240]);
      } else if (name.endsWith(".mp3")) {
        const file = join(dir, "check.mp3");
        await writeFile(file, content);
        expect(await probe(file)).toMatchObject({ codec: "mp3", sampleRate: 44100, channels: 1 });
      }
    }
  });

  it("crée le picto par défaut des options qui n'en ont pas", async () => {
    const { store, project } = await exportReference();
    const saved = await store.get(project.id);
    const option = saved.graph!.choices[0]!.options[1]!;
    expect(option.picto?.origin).toBe("default");
  });

  it("enregistre l'export et ses statistiques", async () => {
    const { store, project, record } = await exportReference();
    expect(record.stats).toMatchObject({ segments: 5, choices: 2, endings: 2 });
    expect(record.stats.totalMinutes).toBeGreaterThan(0);
    expect(record.file).toMatch(/^exports\/.+\.zip$/);
    expect((await store.get(project.id)).exports).toEqual([record]);
  });

  it("bloque un export invalide sans laisser de fichier partiel", async () => {
    const dir = await tempDir();
    const store = new ProjectStore(dir);
    const project = await createReferenceProject(store);
    await store.update(project.id, (p) => {
      p.graph!.segments[0]!.audio = null;
    });
    const err = await exportProject(store, project.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(422);
    expect(await readdir(store.file(project.id, "exports"))).toEqual([]);
  });
});
