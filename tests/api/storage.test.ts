import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as files from "../../src/server/storage/files";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

describe("ProjectStore", () => {
  it("crée, relit, modifie et liste un projet", async () => {
    const store = new ProjectStore(await tempDir());
    const created = await store.create({ title: "Léo et la citrouille" });
    expect(await readdir(store.dir(created.id))).toEqual(expect.arrayContaining(["audio", "images", "exports", "project.json"]));

    const updated = await store.update(created.id, (p) => ({ ...p, brief: "Halloween" }));
    expect(updated.brief).toBe("Halloween");
    expect((await store.get(created.id)).brief).toBe("Halloween");
    expect((await store.list()).map((p) => p.id)).toEqual([created.id]);
  });

  it("sérialise les modifications concurrentes d'un même projet", async () => {
    const store = new ProjectStore(await tempDir());
    const { id } = await store.create();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.update(id, (p) => ({ ...p, brief: `${p.brief}${i}` }))),
    );
    expect((await store.get(id)).brief).toBe("0123456789");
  });

  it("conserve l'ancienne version si la modification échoue", async () => {
    const store = new ProjectStore(await tempDir());
    const { id } = await store.create({ title: "Avant" });
    await expect(store.update(id, (p) => ({ ...p, title: "" }))).rejects.toThrow();
    await expect(
      store.update(id, () => {
        throw new Error("interrompu");
      }),
    ).rejects.toThrow("interrompu");
    expect((await store.get(id)).title).toBe("Avant");
    // Le verrou est libéré après un échec.
    expect((await store.update(id, (p) => ({ ...p, title: "Après" }))).title).toBe("Après");
  });

  it("n'écrit jamais de fichier partiel", async () => {
    const dir = await tempDir();
    const target = join(dir, "x.json");
    await writeFile(target, "ancien");
    await files.writeFileAtomic(target, "nouveau");
    expect(await readFile(target, "utf8")).toBe("nouveau");
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("refuse les chemins qui sortent du dossier du projet", async () => {
    const store = new ProjectStore(await tempDir());
    const { id } = await store.create();
    expect(() => store.file(id, "../../settings.json")).toThrow(/invalide/);
    expect(() => store.dir("../autre")).toThrow();
  });
});

describe("SettingsStore", () => {
  it("n'expose jamais la valeur d'une clé", async () => {
    const dir = await tempDir();
    const store = new SettingsStore(dir, {});
    const secret = "sk-ant-tres-secret-1234";
    const pub = await store.update({ anthropicApiKey: secret });
    expect(pub.keys.anthropicApiKey).toEqual({ configured: true, last4: "1234" });
    expect(JSON.stringify(pub)).not.toContain(secret);
    expect(JSON.stringify(await store.getPublicSettings())).not.toContain(secret);
    expect((await store.getSettings()).anthropicApiKey).toBe(secret);
  });

  it("lit les clés du .env sans les écrire dans le fichier de réglages", async () => {
    const dir = await tempDir();
    const store = new SettingsStore(dir, { ELEVENLABS_API_KEY: "el-key-9876" });
    expect((await store.getPublicSettings()).keys.elevenLabsApiKey.configured).toBe(true);
    await store.update({ textModel: "claude-opus-5-5" });
    expect(await readFile(join(dir, "settings.json"), "utf8")).not.toContain("el-key-9876");
  });

  it("efface une clé avec une valeur vide", async () => {
    const store = new SettingsStore(await tempDir(), {});
    await store.update({ geminiApiKey: "AIza-gemini-abcd" });
    const pub = await store.update({ geminiApiKey: "" });
    expect(pub.keys.geminiApiKey.configured).toBe(false);
  });
});
