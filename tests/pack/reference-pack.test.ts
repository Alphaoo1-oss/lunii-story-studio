import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportProject } from "../../src/server/pack/export";
import { ProjectStore } from "../../src/server/storage/projects";
import { createReferenceProject } from "../fixtures/media";
import { useTempDir } from "../helpers";
import { readZip } from "./zip";

const tempDir = useTempDir();
const OUTPUT = new URL("../output/", import.meta.url);

// Écrit tests/output/reference-pack.zip pour un import manuel dans STUdio (quickstart V10).
describe("pack de référence", () => {
  it("est écrit dans tests/output/ pour l'import manuel dans STUdio", async () => {
    const store = new ProjectStore(await tempDir());
    const project = await createReferenceProject(store);
    const record = await exportProject(store, project.id);
    await mkdir(OUTPUT, { recursive: true });
    const target = fileURLToPath(new URL("reference-pack.zip", OUTPUT));
    await copyFile(store.file(project.id, record.file), target);
    expect((await readZip(target)).has("story.json")).toBe(true);
  });
});
