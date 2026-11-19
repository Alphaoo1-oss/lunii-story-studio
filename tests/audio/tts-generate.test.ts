import { describe, expect, it } from "vitest";
import { AudioService } from "../../src/server/audio/generate";
import { AppError } from "../../src/server/errors";
import { checkProject } from "../../src/server/pack/check";
import { ProjectStore } from "../../src/server/storage/projects";
import { lineState } from "../../src/server/story/state";
import { createReferenceProject } from "../fixtures/media";
import { FakeTts } from "../fixtures/tts";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

// Projet de référence : narrateur en voix Piper « fr_FR-siwis-medium », Léo et Mia enregistrés.
async function setup(tts = new FakeTts()) {
  const store = new ProjectStore(await tempDir());
  const project = await createReferenceProject(store);
  const service = new AudioService(store, { voicebox: new FakeTts(), piper: tts, elevenlabs: new FakeTts() });
  return { store, project, service, tts };
}

const line = (p: Awaited<ReturnType<ProjectStore["get"]>>, id: string) =>
  p.graph!.segments.flatMap((s) => s.lines).find((l) => l.id === id)!;

describe("AudioService.generate", () => {
  it("ne génère que les répliques manquantes ou obsolètes, puis réassemble les étapes", async () => {
    const { store, project, service, tts } = await setup();
    await store.update(project.id, (p) => {
      line(p, "intro-1").text = "Le soir d'Halloween, une citrouille brille dans le jardin.";
      line(p, "fete-1").audio = null;
    });

    const summary = await service.generate(project.id, "all");

    expect(tts.calls.map((c) => c.text)).toEqual([
      "Le soir d'Halloween, une citrouille brille dans le jardin.",
      "Toutes les citrouilles du jardin s'allument pour une grande fête.",
    ]);
    expect(tts.calls.every((c) => c.voiceId === "fr_FR-siwis-medium")).toBe(true);
    expect(summary).toMatchObject({ generated: 2, recordedPending: 0 });
    const saved = await store.get(project.id);
    expect(lineState(line(saved, "intro-1"), saved.characters)).toBe("ok");
    expect(await checkProject(store, saved)).toEqual({ ok: true, issues: [] });
  });

  it("conserve les audios déjà produits quand le fournisseur échoue", async () => {
    const { store, project, service } = await setup(new FakeTts({ failAt: 1 }));
    await store.update(project.id, (p) => {
      line(p, "intro-1").text = "Première phrase modifiée.";
      line(p, "intro-3").text = "Deuxième phrase modifiée ?";
    });
    const err = await service.generate(project.id, "all").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toMatch(/quota/);
    const saved = await store.get(project.id);
    expect(lineState(line(saved, "intro-1"), saved.characters)).toBe("ok");
    expect(lineState(line(saved, "intro-3"), saved.characters)).toBe("stale");
  });

  it("régénère une seule réplique à la demande, même à jour, en remplaçant son fichier", async () => {
    const { store, project, service, tts } = await setup();
    const before = line(project, "etoiles-1").audio!.file;
    await service.generate(project.id, { lineIds: ["etoiles-1"] });
    expect(tts.calls).toHaveLength(1);
    const saved = await store.get(project.id);
    expect(line(saved, "etoiles-1").audio!.file).not.toBe(before);
    expect(saved.graph!.segments.find((s) => s.id === "etoiles")!.audio!.sourceHash).toBeTruthy();
    expect((await checkProject(store, saved)).ok).toBe(true);
  });

  it("laisse de côté les voix à enregistrer et les compte", async () => {
    const { store, project, service, tts } = await setup();
    await store.update(project.id, (p) => {
      line(p, "intro-2").text = "Elle nous sourit !";
    });
    const summary = await service.generate(project.id, "all");
    expect(tts.calls).toHaveLength(0);
    expect(summary.recordedPending).toBe(1);
  });

  it("refait l'annonce d'une option dont le libellé a changé, avec la voix du narrateur", async () => {
    const { store, project, service, tts } = await setup();
    await store.update(project.id, (p) => {
      p.graph!.choices[0]!.options[0]!.label = "La forêt enchantée";
    });
    await service.generate(project.id, "all");
    expect(tts.calls).toEqual([{ text: "La forêt enchantée", voiceId: "fr_FR-siwis-medium" }]);
    expect((await checkProject(store, await store.get(project.id))).ok).toBe(true);
  });

  it("refait toutes les répliques d'un personnage dont la voix a changé", async () => {
    const { store, project, service, tts } = await setup();
    await store.update(project.id, (p) => {
      p.characters.find((c) => c.id === "narrateur")!.voice = { source: "piper", voiceId: "fr_FR-tom-medium", settings: {} };
    });
    await service.generate(project.id, "all");
    const narratorLines = project.graph!.segments.flatMap((s) => s.lines).filter((l) => l.characterId === "narrateur");
    const announcements = project.graph!.choices.flatMap((c) => c.options).length;
    // Répliques du narrateur + annonces des options + titre.
    expect(tts.calls).toHaveLength(narratorLines.length + announcements + 1);
    expect(tts.calls.every((c) => c.voiceId === "fr_FR-tom-medium")).toBe(true);
  });

  it("signale les personnages sans voix choisie", async () => {
    const { store, project, service } = await setup();
    await store.update(project.id, (p) => {
      p.characters.find((c) => c.id === "narrateur")!.voice = null;
      line(p, "intro-1").audio = null;
    });
    const err = await service.generate(project.id, "all").catch((e) => e);
    expect((err as AppError).message).toMatch(/Narrateur/);
  });
});
