import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "../../src/server/storage/projects";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

describe("bibliothèque des histoires", () => {
  it("garde l'ordre choisi, les nouvelles histoires en tête", async () => {
    const store = new ProjectStore(await tempDir());
    const a = await store.create({ title: "A" });
    const b = await store.create({ title: "B" });
    const c = await store.create({ title: "C" });
    await store.setOrder([a.id, c.id, b.id]);
    expect((await store.list()).map((p) => p.title)).toEqual(["A", "C", "B"]);
    // Modifier une histoire ne la déplace pas.
    await store.update(b.id, (p) => {
      p.title = "B2";
    });
    expect((await store.list()).map((p) => p.title)).toEqual(["A", "C", "B2"]);
    await store.create({ title: "D" });
    expect((await store.list()).map((p) => p.title)).toEqual(["D", "A", "C", "B2"]);
    await expect(store.setOrder([a.id, b.id])).rejects.toMatchObject({ code: "order_changed" });
  });

  it("met une histoire supprimée à la corbeille au lieu de l'effacer", async () => {
    const dir = await tempDir();
    const store = new ProjectStore(dir);
    const a = await store.create({ title: "A" });
    await store.delete(a.id);
    expect(await store.list()).toEqual([]);
    const trash = await readdir(join(dir, "corbeille"));
    expect(trash).toHaveLength(1);
    expect(trash[0]).toContain(a.id);
    expect(await readdir(join(dir, "corbeille", trash[0]!))).toContain("project.json");
  });
});
