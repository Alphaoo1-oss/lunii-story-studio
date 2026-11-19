import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkProject } from "../../src/server/pack/check";
import { ProjectStore } from "../../src/server/storage/projects";
import { createReferenceProject } from "../fixtures/media";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

async function reference() {
  const store = new ProjectStore(await tempDir());
  const project = await createReferenceProject(store);
  return { store, project };
}

const errorsOf = async (store: ProjectStore, id: string) =>
  (await checkProject(store, await store.get(id))).issues.filter((i) => i.severity === "error");

describe("checkProject", () => {
  it("valide l'histoire de référence complète", async () => {
    const { store, project } = await reference();
    expect(await checkProject(store, project)).toEqual({ ok: true, issues: [] });
  });

  it("signale un segment sans audio", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.graph!.segments[1]!.audio = null;
    });
    expect(await errorsOf(store, project.id)).toContainEqual(
      expect.objectContaining({ code: "segment_audio_missing", target: { kind: "segment", id: "foret" } }),
    );
  });

  it("signale une option sans annonce audio", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.graph!.choices[1]!.options[0]!.announceAudio = null;
    });
    expect(await errorsOf(store, project.id)).toContainEqual(
      expect.objectContaining({ code: "option_audio_missing", target: { kind: "option", id: "opt-fete" } }),
    );
  });

  it("signale un audio devenu obsolète après modification du texte", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.graph!.segments[0]!.lines[1]!.text = "Elle nous sourit !";
    });
    const issues = await errorsOf(store, project.id);
    expect(issues).toContainEqual(expect.objectContaining({ code: "line_audio_stale", target: { kind: "line", id: "intro-2" } }));
    expect(issues).toContainEqual(expect.objectContaining({ code: "segment_audio_stale", target: { kind: "segment", id: "intro" } }));
  });

  it("signale un titre sans audio et un fichier audio disparu", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.titleAudio = null;
    });
    await rm(store.file(project.id, project.graph!.segments[2]!.audio!.file));
    const codes = (await errorsOf(store, project.id)).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["title_audio_missing", "audio_file_missing"]));
  });

  it("reprend les erreurs de structure du graphe", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.graph!.choices[0]!.options[0]!.targetSegmentId = "inconnu";
    });
    expect((await errorsOf(store, project.id)).map((i) => i.code)).toContain("unknown_option_target");
  });

  it("ne bloque pas pour un picto manquant (un picto par défaut sera créé)", async () => {
    const { store, project } = await reference();
    await store.update(project.id, (p) => {
      p.coverPicto = null;
    });
    const result = await checkProject(store, await store.get(project.id));
    expect(result.ok).toBe(true);
  });

  it("exige une histoire", async () => {
    const store = new ProjectStore(await tempDir());
    const project = await store.create();
    const result = await checkProject(store, project);
    expect(result.ok).toBe(false);
    expect(result.issues[0]!.message).toMatch(/histoire/i);
  });
});
