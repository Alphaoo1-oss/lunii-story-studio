import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LuniiCatalog } from "../../src/server/lunii/catalog";
import { folderOf, LuniiService, readIndex } from "../../src/server/lunii/device";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

const A = "1ca14331-97b9-5db0-9f64-b7c6576b534c";
const B = "3d411a00-3437-4939-a60d-71b038260255";
const C = "15924fbd-229d-4efc-80c2-4383304d64a4";

// Fausse Lunii V3 : index, dossiers d'histoires, et bases de Lunii QT à côté.
async function fakeLunii() {
  const root = await tempDir();
  const pc = await tempDir();
  await writeFile(join(root, ".md"), Buffer.from([6, 0, ...Array(110).fill(0)]));
  await writeFile(join(root, "version"), "2023-06-14 14:51 UTC");
  await writeFile(join(root, ".pi"), Buffer.concat([A, B, C].map((u) => Buffer.from(u.replace(/-/g, ""), "hex"))));
  for (const uuid of [A, B, C]) {
    await mkdir(join(root, ".content", folderOf(uuid), "rf"), { recursive: true });
    await writeFile(join(root, ".content", folderOf(uuid), "ni"), Buffer.alloc(1000));
  }
  await mkdir(join(root, ".content", "3BEC7E73"));
  const qt = join(pc, ".lunii-qt");
  await mkdir(join(qt, "cache"), { recursive: true });
  await writeFile(join(qt, "official.db"), JSON.stringify({ x1: { uuid: B, title: "Les mondes merveilleux" } }));
  await writeFile(join(qt, "third-party.db"), JSON.stringify({ [A.replace(/-/g, "")]: { uuid: A, title: "Léo et la mission dodo" } }));
  await writeFile(join(qt, "cache", A.toUpperCase()), "PNG");
  const catalog = new LuniiCatalog(qt);
  const service = new LuniiService({ drives: [join(pc, "absent"), root], backupDir: join(pc, "data"), catalog });
  return { root, pc, service };
}

describe("Ma Lunii", () => {
  it("détecte la Lunii, liste ses histoires dans l'ordre avec leurs titres", async () => {
    const { service, root } = await fakeLunii();
    const view = (await service.stories())!;
    expect(view.device).toMatchObject({ root, generation: "V3", firmware: "2023-06-14 14:51 UTC" });
    expect(view.stories.map((s) => [s.folder, s.origin, s.title, s.thumbnail])).toEqual([
      ["576B534C", "custom", "Léo et la mission dodo", true],
      ["38260255", "official", "Les mondes merveilleux", false],
      ["304D64A4", "unknown", null, false],
    ]);
    expect(view.orphans).toEqual(["3BEC7E73"]);
    expect((await service.sizes())[A]).toBe(1000);
  });

  it("change l'ordre en sauvegardant l'ancien index, et refuse une liste différente", async () => {
    const { service, root, pc } = await fakeLunii();
    await service.reorder([C, A, B]);
    expect(await readIndex(root)).toEqual([C, A, B]);
    const backups = await readdir(join(pc, "data", "index"));
    expect(backups).toHaveLength(1);
    expect((await readFile(join(pc, "data", "index", backups[0]!))).length).toBe(48);
    await expect(service.reorder([C, A])).rejects.toMatchObject({ code: "lunii_changed" });
    expect((await readdir(root)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("retire une histoire en la gardant sur le PC, puis la remet en fin de molette", async () => {
    const { service, root } = await fakeLunii();
    await service.remove(A);
    expect(await readIndex(root)).toEqual([B, C]);
    expect(await readdir(join(root, ".content"))).not.toContain("576B534C");
    const [item] = await service.trash();
    expect(item).toMatchObject({ uuid: A, title: "Léo et la mission dodo", sizeBytes: 1000 });

    await service.restore(item!.id);
    expect(await readIndex(root)).toEqual([B, C, A]);
    expect((await readFile(join(root, ".content", "576B534C", "ni"))).length).toBe(1000);
    expect(await service.trash()).toEqual([]);
  });

  it("ne trouve rien quand aucune Lunii n'est branchée", async () => {
    const pc = await tempDir();
    const service = new LuniiService({ drives: [pc], backupDir: pc, catalog: new LuniiCatalog(pc) });
    expect(await service.stories()).toBeNull();
    await expect(service.remove(A)).rejects.toMatchObject({ code: "lunii_absent" });
  });
});
