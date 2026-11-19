import { randomUUID } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LuniiDevice, LuniiStory, LuniiTrashItem } from "@shared/api";
import { AppError } from "../errors";
import type { LuniiCatalog } from "./catalog";

// Gestion de la Lunii branchée en USB (vue comme une clé) : l'index `.pi` liste les histoires
// (16 octets par UUID, dans l'ordre de la molette) et chaque histoire est un dossier de
// `.content` nommé d'après les 8 derniers caractères de son UUID. On ne touche qu'à l'index et
// aux dossiers, jamais au contenu chiffré des histoires.

const FOLDER = /^[0-9A-F]{8}$/;

export class LuniiService {
  constructor(
    private readonly options: {
      // Racines à examiner (lecteurs A: à Z: par défaut).
      drives?: string[];
      // Sauvegardes de l'index et histoires supprimées, gardées sur le PC.
      backupDir: string;
      catalog: LuniiCatalog;
    },
  ) {}

  async findDevice(): Promise<LuniiDevice | null> {
    const drives = this.options.drives ?? [..."DEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => `${l}:\\`);
    for (const root of drives) {
      if (!(await exists(join(root, ".md"))) || !(await exists(join(root, ".pi")))) continue;
      const md = await readFile(join(root, ".md"));
      const mdVersion = md.length >= 2 ? md.readUInt16LE(0) : 0;
      const firmware = (await readFile(join(root, "version"), "utf8").catch(() => "")).trim() || null;
      const fs = await statfs(root).catch(() => null);
      return {
        root,
        generation: mdVersion >= 6 ? "V3" : "V2",
        firmware,
        freeBytes: fs ? fs.bavail * fs.bsize : null,
        totalBytes: fs ? fs.blocks * fs.bsize : null,
      };
    }
    return null;
  }

  async stories(): Promise<{ device: LuniiDevice; stories: LuniiStory[]; orphans: string[] } | null> {
    const device = await this.findDevice();
    if (!device) return null;
    const uuids = await readIndex(device.root);
    const folders = new Set((await readdir(join(device.root, ".content")).catch(() => [])).filter((f) => FOLDER.test(f)));
    const catalog = await this.options.catalog.load();
    const stories: LuniiStory[] = [];
    for (const uuid of uuids) {
      const info = catalog.get(uuid);
      stories.push({
        uuid,
        folder: folderOf(uuid),
        title: info?.title ?? null,
        origin: info?.origin ?? "unknown",
        missing: !folders.has(folderOf(uuid)),
        thumbnail: await exists(this.options.catalog.thumbnailPath(uuid)),
      });
    }
    const indexed = new Set(stories.map((s) => s.folder));
    return { device, stories, orphans: [...folders].filter((f) => !indexed.has(f)) };
  }

  // Taille de chaque dossier d'histoire (lent sur la Lunii : calculée à part).
  async sizes(): Promise<Record<string, number>> {
    const device = await this.requireDevice();
    const sizes: Record<string, number> = {};
    for (const uuid of await readIndex(device.root)) {
      sizes[uuid] = await folderSize(join(device.root, ".content", folderOf(uuid))).catch(() => 0);
    }
    return sizes;
  }

  // Nouvel ordre sur la molette : les mêmes histoires, ni plus ni moins.
  async reorder(uuids: string[]): Promise<void> {
    const device = await this.requireDevice();
    const current = await readIndex(device.root);
    const same = uuids.length === current.length && new Set(uuids).size === uuids.length && uuids.every((u) => current.includes(u));
    if (!same) throw new AppError("lunii_changed", "La liste des histoires a changé sur la Lunii. Rechargez la page.", 409);
    await this.writeIndex(device.root, uuids);
  }

  // Retire l'histoire de la Lunii après l'avoir copiée sur le PC (corbeille restaurable).
  async remove(uuid: string): Promise<void> {
    const device = await this.requireDevice();
    const current = await readIndex(device.root);
    if (!current.includes(uuid)) throw new AppError("not_found", "Cette histoire n'est plus sur la Lunii.", 404);
    const source = join(device.root, ".content", folderOf(uuid));
    const catalog = await this.options.catalog.load();
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${folderOf(uuid)}`;
    const target = join(this.trashDir(), id);
    if (await exists(source)) {
      await cp(source, join(target, "story"), { recursive: true, errorOnExist: true });
    }
    await writeJson(join(target, "info.json"), { uuid, title: catalog.get(uuid)?.title ?? null, deletedAt: new Date().toISOString() });
    await this.writeIndex(
      device.root,
      current.filter((u) => u !== uuid),
    );
    await rm(source, { recursive: true, force: true });
  }

  async trash(): Promise<LuniiTrashItem[]> {
    const entries = await readdir(this.trashDir()).catch(() => []);
    const items: LuniiTrashItem[] = [];
    for (const id of entries.sort().reverse()) {
      const info = await readFile(join(this.trashDir(), id, "info.json"), "utf8").then(JSON.parse, () => null);
      if (!info) continue;
      const size = await folderSize(join(this.trashDir(), id, "story")).catch(() => 0);
      items.push({ id, uuid: info.uuid, title: info.title, deletedAt: info.deletedAt, sizeBytes: size });
    }
    return items;
  }

  // Remet sur la Lunii une histoire de la corbeille, en fin de molette.
  async restore(id: string): Promise<void> {
    if (!/^[\w-]+$/.test(id)) throw new AppError("not_found", "Élément introuvable dans la corbeille.", 404);
    const device = await this.requireDevice();
    const dir = join(this.trashDir(), id);
    const info = await readFile(join(dir, "info.json"), "utf8").then(JSON.parse, () => null);
    if (!info) throw new AppError("not_found", "Élément introuvable dans la corbeille.", 404);
    const current = await readIndex(device.root);
    if (current.includes(info.uuid)) throw new AppError("lunii_present", "Cette histoire est déjà sur la Lunii.", 409);
    const target = join(device.root, ".content", folderOf(info.uuid));
    if (await exists(target)) throw new AppError("lunii_present", "Un dossier de cette histoire existe déjà sur la Lunii.", 409);
    const size = await folderSize(join(dir, "story"));
    const free = (await this.findDevice())?.freeBytes;
    if (free !== null && free !== undefined && free < size) {
      throw new AppError("lunii_full", "Il n'y a plus assez de place sur la Lunii pour cette histoire.", 409);
    }
    await cp(join(dir, "story"), target, { recursive: true, errorOnExist: true });
    await this.writeIndex(device.root, [...current, info.uuid]);
    await rm(dir, { recursive: true, force: true });
  }

  // Écrit l'index en gardant une copie de l'ancien sur le PC ; remplacement atomique.
  private async writeIndex(root: string, uuids: string[]): Promise<void> {
    const backups = join(resolve(this.options.backupDir), "index");
    await mkdir(backups, { recursive: true });
    await writeFile(join(backups, `pi-${new Date().toISOString().replace(/[:.]/g, "-")}`), await readFile(join(root, ".pi")));
    const tmp = join(root, `.pi.${randomUUID().slice(0, 8)}.tmp`);
    await writeFile(tmp, Buffer.concat(uuids.map(uuidBytes)));
    await rename(tmp, join(root, ".pi"));
  }

  private trashDir(): string {
    return join(resolve(this.options.backupDir), "corbeille");
  }

  private async requireDevice(): Promise<LuniiDevice> {
    const device = await this.findDevice();
    if (!device) throw new AppError("lunii_absent", "Aucune Lunii n'est branchée. Branchez-la en USB et réessayez.", 404);
    return device;
  }
}

export async function readIndex(root: string): Promise<string[]> {
  const pi = await readFile(join(root, ".pi"));
  if (pi.length % 16 !== 0) throw new AppError("lunii_index", "L'index des histoires de la Lunii est illisible.", 500);
  const uuids: string[] = [];
  for (let i = 0; i < pi.length; i += 16) {
    const hex = pi.subarray(i, i + 16).toString("hex");
    uuids.push(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
  }
  return uuids;
}

export function folderOf(uuid: string): string {
  return uuid.replace(/-/g, "").slice(-8).toUpperCase();
}

function uuidBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new AppError("invalid_request", "Identifiant d'histoire invalide.");
  return Buffer.from(hex, "hex");
}

async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await folderSize(path) : (await stat(path)).size;
  }
  return total;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
