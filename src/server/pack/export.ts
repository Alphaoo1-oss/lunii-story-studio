import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ExportRecord } from "@shared/model";
import yazl from "yazl";
import { AppError } from "../errors";
import type { ProjectStore } from "../storage/projects";
import { graphStats } from "../story/validate";
import { assetName, ensureDefaultPictos, mediaRefs } from "./assets";
import { checkProject } from "./check";
import { mapToStoryPack } from "./mapping";

// Export d'un projet en pack STUdio (contracts/studio-pack.md). Le pack est écrit dans un
// fichier temporaire puis renommé : jamais de pack partiel (constitution, principe II).
export async function exportProject(store: ProjectStore, projectId: string, now = new Date()): Promise<ExportRecord> {
  const check = await checkProject(store, await store.get(projectId));
  if (!check.ok) {
    throw new AppError("export_invalid", "L'histoire n'est pas encore prête à être exportée.", 422, { issues: check.issues });
  }
  const project = await ensureDefaultPictos(store, await store.get(projectId));

  // Clé logique → nom d'asset (SHA-1) et fichier source.
  const assets = new Map<string, { name: string; path: string }>();
  for (const ref of mediaRefs(project)) {
    const path = store.file(project.id, ref.file);
    assets.set(ref.key, { name: await assetName(path), path });
  }
  const { pack } = mapToStoryPack(project, (key) => {
    const found = assets.get(key);
    if (!found) throw new AppError("export_asset_missing", `Média manquant pour l'export (${key}).`, 500);
    return found.name;
  });

  // L'âge de l'enfant en tête du nom, pour ranger les packs par âge.
  const base = `exports/[${project.listenerAge}]${slug(project.title)}-${timestamp(now)}`;
  let file = `${base}.zip`;
  for (let n = 2; await exists(store.file(project.id, file)); n++) file = `${base}-${n}.zip`;
  const target = store.file(project.id, file);
  const tmp = `${target}.tmp`;
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(pack, null, 2), "utf8"), "story.json");
  zip.addFile(assets.get("cover")!.path, "thumbnail.png");
  const added = new Set<string>();
  for (const { name, path } of assets.values()) {
    if (added.has(name)) continue;
    added.add(name);
    zip.addFile(path, `assets/${name}`);
  }
  zip.end();

  try {
    await mkdir(dirname(target), { recursive: true });
    await pipeline(zip.outputStream, createWriteStream(tmp));
    await rename(tmp, target);
  } catch {
    await rm(tmp, { force: true });
    throw new AppError("export_failed", "L'écriture du pack a échoué. Aucun fichier n'a été produit.", 500);
  }

  const durations = [
    project.titleAudio?.durationSec ?? 0,
    ...project.graph!.segments.map((s) => s.audio?.durationSec ?? 0),
    ...project.graph!.choices.flatMap((c) => c.options.map((o) => o.announceAudio?.durationSec ?? 0)),
  ];
  const record: ExportRecord = {
    file,
    createdAt: now.toISOString(),
    stats: {
      ...graphStats(project.graph!),
      totalMinutes: Math.round((durations.reduce((a, b) => a + b, 0) / 60) * 10) / 10 || 0.1,
    },
  };
  await store.update(project.id, (p) => ({ ...p, exports: [...p.exports, record] }));
  return record;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function slug(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "histoire"
  );
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
