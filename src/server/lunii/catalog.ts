import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LuniiStoryOrigin } from "@shared/api";

// Titres des histoires, lus dans les bases que Lunii QT garde sur le PC (~/.lunii-qt) :
// `official.db` (catalogue Lunii) et `third-party.db` (histoires ajoutées), plus les vignettes
// de son cache. La Lunii elle-même ne stocke que les UUID.

export type CatalogEntry = { title: string; origin: LuniiStoryOrigin };

export class LuniiCatalog {
  private cache: { key: string; entries: Map<string, CatalogEntry> } | null = null;

  constructor(readonly dir: string = join(homedir(), ".lunii-qt")) {}

  async load(): Promise<Map<string, CatalogEntry>> {
    const files = ["official.db", "third-party.db"].map((f) => join(this.dir, f));
    const key = (await Promise.all(files.map((f) => stat(f).then((s) => s.mtimeMs, () => 0)))).join("|");
    if (this.cache?.key === key) return this.cache.entries;

    const entries = new Map<string, CatalogEntry>();
    const read = async (file: string) => JSON.parse(await readFile(file, "utf8").catch(() => "{}")) as Record<string, { uuid?: string; title?: string }>;
    for (const [file, origin] of [
      [files[0]!, "official"],
      [files[1]!, "custom"],
    ] as const) {
      for (const story of Object.values(await read(file))) {
        if (!story.uuid || !story.title) continue;
        entries.set(story.uuid.toLowerCase(), { title: story.title, origin });
      }
    }
    this.cache = { key, entries };
    return entries;
  }

  thumbnailPath(uuid: string): string {
    return join(this.dir, "cache", uuid.toUpperCase());
  }
}
