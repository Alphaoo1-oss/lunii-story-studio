import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { DEFAULT_SIZE_SETTINGS, Project } from "@shared/model";
import { AppError, notFound } from "../errors";
import { readJsonIfExists, writeFileAtomic } from "./files";

export const PROJECT_SUBDIRS = ["audio", "images", "exports"] as const;
export type ProjectSubdir = (typeof PROJECT_SUBDIRS)[number];

// Projets stockés dans <dataDir>/projects/<id>/project.json, médias dans les sous-dossiers.
export class ProjectStore {
  readonly root: string;
  private locks = new Map<string, Promise<unknown>>();

  constructor(dataDir: string) {
    this.root = resolve(dataDir, "projects");
  }

  dir(id: string): string {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw notFound("Projet");
    return join(this.root, id);
  }

  // Chemin absolu d'un fichier du projet à partir d'un chemin relatif (ex. "audio/x.mp3"),
  // en refusant toute sortie du dossier du projet.
  file(id: string, relative: string): string {
    const base = this.dir(id);
    const full = resolve(base, relative);
    if (!full.startsWith(base + sep)) throw new AppError("bad_path", "Chemin de fichier invalide.");
    return full;
  }

  async create(init: Partial<Pick<Project, "title" | "brief" | "listenerAge">> = {}): Promise<Project> {
    const now = new Date().toISOString();
    const project = Project.parse({
      id: randomUUID(),
      title: init.title ?? "Nouvelle histoire",
      brief: init.brief ?? "",
      listenerAge: init.listenerAge ?? 5,
      sizeSettings: DEFAULT_SIZE_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
    for (const sub of PROJECT_SUBDIRS) await mkdir(join(this.dir(project.id), sub), { recursive: true });
    await this.write(project);
    return project;
  }

  async get(id: string): Promise<Project> {
    const raw = await readJsonIfExists(join(this.dir(id), "project.json"));
    if (raw === undefined) throw notFound("Projet");
    return Project.parse(raw);
  }

  async list(): Promise<Project[]> {
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const projects: Project[] = [];
    for (const id of entries) {
      try {
        projects.push(await this.get(id));
      } catch {
        // Dossier étranger ou projet illisible : ignoré dans la liste.
      }
    }
    // Ordre choisi par l'utilisateur ; les projets absents de l'ordre (nouveaux) viennent en tête,
    // du plus récent au plus ancien.
    const order = ((await readJsonIfExists(this.orderFile())) as string[] | undefined) ?? [];
    const rank = new Map(order.map((id, i) => [id, i]));
    const unranked = projects.filter((p) => !rank.has(p.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const ranked = projects.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return [...unranked, ...ranked];
  }

  async setOrder(ids: string[]): Promise<void> {
    const existing = new Set((await this.list()).map((p) => p.id));
    if (ids.length !== existing.size || new Set(ids).size !== ids.length || !ids.every((id) => existing.has(id))) {
      throw new AppError("order_changed", "La liste des histoires a changé. Rechargez la page.", 409);
    }
    await writeFileAtomic(this.orderFile(), JSON.stringify(ids, null, 2));
  }

  // Lit, modifie et réécrit un projet, en sérialisant les modifications d'un même projet.
  async update(id: string, change: (project: Project) => Project | void | Promise<Project | void>): Promise<Project> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.then(async () => {
      const current = await this.get(id);
      const changed = (await change(current)) ?? current;
      const saved = Project.parse({ ...changed, id, updatedAt: new Date().toISOString() });
      await this.write(saved);
      return saved;
    });
    this.locks.set(id, next.catch(() => undefined));
    return next;
  }

  // Suppression : le dossier du projet part dans <dataDir>/corbeille, d'où il peut être récupéré.
  async delete(id: string): Promise<void> {
    await this.get(id);
    const trash = resolve(this.root, "..", "corbeille");
    await mkdir(trash, { recursive: true });
    await rename(this.dir(id), join(trash, `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}`));
  }

  private orderFile(): string {
    return join(this.root, "order.json");
  }

  private async write(project: Project): Promise<void> {
    await writeFileAtomic(join(this.dir(project.id), "project.json"), JSON.stringify(project, null, 2));
  }
}
