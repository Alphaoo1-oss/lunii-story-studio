import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { LuniiCatalog } from "../src/server/lunii/catalog";
import { LuniiService } from "../src/server/lunii/device";

// Dossier temporaire supprimé automatiquement après chaque test.
export function useTempDir(): () => Promise<string> {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });
  return async () => {
    const dir = await mkdtemp(join(tmpdir(), "lss-test-"));
    dirs.push(dir);
    return dir;
  };
}

// Aucune Lunii branchée (aucun lecteur examiné).
export function noLunii(dir: string) {
  const catalog = new LuniiCatalog(dir);
  return { catalog, service: new LuniiService({ drives: [], backupDir: dir, catalog }) };
}
