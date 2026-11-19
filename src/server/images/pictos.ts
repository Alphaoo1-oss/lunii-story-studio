import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import type { PictoState, PictoTarget } from "@shared/api";
import type { ChoiceOption, Picto, Project } from "@shared/model";
import { AppError } from "../errors";
import type { ProjectStore } from "../storage/projects";
import { toLuniiPng } from "./convert";
import type { ImageProvider } from "./provider";
import { styleById } from "./styles";

export type PictoScope = "all" | { targets: string[] };
export type PictoProgress = { done: number; total: number; label: string };

const COVER = "cover";

// Pictos illustrés US5 : couverture et un picto par option, dans un style commun.
export class PictoService {
  constructor(
    private readonly store: ProjectStore,
    private readonly images: ImageProvider,
  ) {}

  async generate(
    projectId: string,
    styleId: string,
    scope: PictoScope,
    onProgress: (p: PictoProgress) => void = () => {},
  ): Promise<{ generated: number }> {
    const style = styleById(styleId);
    if (!style) throw new AppError("unknown_style", "Ce style de pictos n'existe pas.");
    let project = await this.store.update(projectId, (p) => {
      p.visualStyle = style.id;
    });
    if (!project.graph) throw new AppError("no_story", "Le projet n'a pas encore d'histoire.");

    const all = pictoTargets(project);
    const wanted =
      scope === "all"
        ? all.filter((t) => t.state === "default" || t.state === "stale")
        : all.filter((t) => scope.targets.includes(t.target));
    // La couverture d'abord : elle sert ensuite de référence pour garder le même style.
    wanted.sort((a, b) => Number(b.target === COVER) - Number(a.target === COVER));

    let done = 0;
    for (const target of wanted) {
      project = await this.store.get(projectId);
      const prompt = promptFor(project, target.target, style.prompt);
      const reference = target.target === COVER ? undefined : await this.coverReference(project);
      const image = await this.images.generate({ prompt, references: reference ? [reference] : [] });
      await this.save(projectId, target.target, image, {
        origin: "generated",
        style: style.id,
        promptHash: hash(contentPrompt(project, target.target)),
      });
      done++;
      onProgress({ done, total: wanted.length, label: target.label });
    }
    return { generated: done };
  }

  // Image choisie par l'utilisateur, recadrée en 320×240. Avec un style : image faite à la main
  // (dans l'app Gemini) à partir du prompt de l'application, suivie comme une image générée.
  async importImage(projectId: string, target: string, image: Buffer, styleId?: string): Promise<Project> {
    const project = await this.store.get(projectId);
    if (target !== COVER) targetOf(project, target);
    const style = styleId ? styleById(styleId) : undefined;
    if (!style) return this.save(projectId, target, image, { origin: "imported", style: null, promptHash: null });
    await this.store.update(projectId, (p) => {
      p.visualStyle = style.id;
    });
    return this.save(projectId, target, image, { origin: "generated", style: style.id, promptHash: hash(contentPrompt(project, target)) });
  }

  // Retour au picto par défaut (libellé sur fond coloré, recréé à l'export).
  async reset(projectId: string, target: string): Promise<Project> {
    let previous: string | undefined;
    const project = await this.store.update(projectId, (p) => {
      previous = setPicto(p, target, null);
    });
    if (previous) await rm(this.store.file(projectId, previous), { force: true });
    return project;
  }

  private async save(projectId: string, target: string, image: Buffer, meta: Omit<Picto, "file">): Promise<Project> {
    const name = target === COVER ? "cover" : `option-${target.slice("option:".length)}`;
    const file = `images/${name}-${randomUUID().slice(0, 8)}.png`;
    try {
      await toLuniiPng(image, this.store.file(projectId, file));
    } catch {
      throw new AppError("image_unreadable", "Cette image n'a pas pu être lue. Choisissez un fichier PNG ou JPEG.");
    }
    let previous: string | undefined;
    const project = await this.store.update(projectId, (p) => {
      previous = setPicto(p, target, { file, ...meta });
    });
    if (previous) await rm(this.store.file(projectId, previous), { force: true });
    return project;
  }

  private async coverReference(project: Project): Promise<Buffer | undefined> {
    if (project.coverPicto?.origin !== "generated") return undefined;
    return readFile(this.store.file(project.id, project.coverPicto.file)).catch(() => undefined);
  }
}

// État de chaque picto du projet, couverture en tête.
export function pictoTargets(project: Project): PictoTarget[] {
  const targets: PictoTarget[] = [
    { target: COVER, label: project.title, file: project.coverPicto?.file ?? null, state: stateOf(project, COVER, project.coverPicto) },
  ];
  for (const option of project.graph?.choices.flatMap((c) => c.options) ?? []) {
    const target = `option:${option.id}`;
    targets.push({ target, label: option.label, file: option.picto?.file ?? null, state: stateOf(project, target, option.picto) });
  }
  return targets;
}

function stateOf(project: Project, target: string, picto: Picto | null): PictoState {
  if (!picto || picto.origin === "default") return "default";
  if (picto.origin === "imported") return "imported";
  const current = picto.style === project.visualStyle && picto.promptHash === hash(contentPrompt(project, target));
  return current ? "ok" : "stale";
}

// Prompt complet : style commun, puis ce qu'il faut dessiner et les contraintes d'un picto Lunii.
export function promptFor(project: Project, target: string, stylePrompt: string): string {
  return [
    `Art style: ${stylePrompt}. Keep exactly this style.`,
    contentPrompt(project, target),
    "Composition: one clear subject, centered, large and readable on a tiny 320x240 screen, strong contrast, simple uncluttered background, landscape 4:3.",
    "Never include any text, letters, numbers or logos.",
    `Gentle, warm and reassuring, suitable for a ${project.listenerAge}-year-old child: nothing scary or violent.`,
  ].join("\n");
}

// Prompts à copier dans l'app Gemini : un message d'ouverture qui fixe le style et les
// personnages, puis un message par picto, à envoyer dans la même conversation.
export function handPrompts(project: Project, stylePrompt: string): { intro: string; items: { target: string; prompt: string }[] } {
  const targets = pictoTargets(project);
  const cast = castOf(project);
  const intro = [
    `I am making ${targets.length} small pictures for a French children's audio story box (Lunii), whose screen is 320x240 pixels.`,
    "I will ask for them one at a time in this conversation. Every picture must use exactly the same art style and show the characters with exactly the same looks.",
    `Art style: ${stylePrompt}.`,
    cast && `Characters:\n${cast}`,
    "Rules for every picture: landscape 4:3, one clear centered subject, strong contrast, no text, letters, numbers or logos, gentle and suitable for young children.",
    "Answer each request with the picture only. Wait for my first request.",
  ]
    .filter(Boolean)
    .join("\n");
  // Chaque prompt se suffit à lui-même et demande une seule image.
  const items = targets.map((t, i) => ({
    target: t.target,
    prompt: [
      `Create ONE picture${i > 0 ? " (same art style and same character looks as the previous pictures of this conversation)" : ""}.`,
      "Aim for the most beautiful, polished result possible: crisp clean shapes, careful details, harmonious values, no artifacts.",
      "It will be shown on the small 320x240 screen of a Lunii storybox: landscape 4:3, and it must stay perfectly readable at that tiny size.",
      "",
      promptFor(project, t.target, stylePrompt),
    ].join("\n"),
  }));
  return { intro, items };
}

function castOf(project: Project): string {
  return project.characters
    .filter((c) => !c.isNarrator)
    .map((c) => `- ${c.name}${c.age ? ` (${c.age} ans)` : ""} : ${[c.appearance, c.description].filter(Boolean).join(" ")}`)
    .join("\n");
}

// Ce que montre le picto (sans le style) : sert d'empreinte pour savoir s'il est à refaire.
function contentPrompt(project: Project, target: string): string {
  const cast = castOf(project);
  const characters = cast
    ? [
        `Characters (always draw them with these same looks):\n${cast}`,
        "Keep each character's face, hair, costume and accessories identical in every picture, and never add glasses, hats or accessories that their description does not give them.",
      ].join("\n")
    : "";
  if (target === COVER) {
    return [
      `Cover illustration of the French children's audio story "${project.title}".`,
      project.description && `Story: ${project.description}`,
      characters,
      "Show the main characters together in the story's setting.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const { option, prompt, scene } = targetOf(project, target);
  return [
    `Small picture for a choice button in the French children's audio story "${project.title}".`,
    `The child is asked: "${prompt}" This picture stands for the answer: "${option.label}".`,
    scene && `What happens next: ${scene}`,
    characters,
    "Draw only what this answer is about, so a child can recognise it without reading; show a character only if the answer is about them.",
  ]
    .filter(Boolean)
    .join("\n");
}

function targetOf(project: Project, target: string): { option: ChoiceOption; prompt: string; scene: string } {
  const id = target.startsWith("option:") ? target.slice("option:".length) : "";
  for (const choice of project.graph?.choices ?? []) {
    const option = choice.options.find((o) => o.id === id);
    if (!option) continue;
    const segment = project.graph!.segments.find((s) => s.id === option.targetSegmentId);
    const scene = (segment?.lines.slice(0, 2).map((l) => l.text).join(" ") ?? "").slice(0, 400);
    return { option, prompt: choice.prompt, scene };
  }
  throw new AppError("not_found", "Picto introuvable.", 404);
}

// Remplace le picto d'une cible ; renvoie le fichier qu'il remplaçait.
function setPicto(project: Project, target: string, picto: Picto | null): string | undefined {
  if (target === COVER) {
    const previous = project.coverPicto?.file;
    project.coverPicto = picto;
    return previous;
  }
  const option = targetOf(project, target).option;
  const previous = option.picto?.file;
  option.picto = picto;
  return previous;
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
