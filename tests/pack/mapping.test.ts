import { readFileSync } from "node:fs";
import { Project } from "@shared/model";
import { describe, expect, it } from "vitest";
import { mapToStoryPack } from "../../src/server/pack/mapping";
import type { StageNode } from "../../src/server/pack/types";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/reference-story.json", import.meta.url), "utf8"));
const now = new Date().toISOString();
const project = Project.parse({ ...fixture, id: "p1", createdAt: now, updatedAt: now });
// Chaque fichier référencé est remplacé par un nom d'asset factice et déterministe.
const assetName = (key: string) => `asset-${key}`;
const { pack, ids } = mapToStoryPack(project, assetName);

const stage = (key: string): StageNode => {
  const node = pack.stageNodes.find((s) => s.uuid === ids.get(key));
  if (!node) throw new Error(`nœud ${key} absent`);
  return node;
};
const action = (key: string) => {
  const node = pack.actionNodes.find((a) => a.id === ids.get(key));
  if (!node) throw new Error(`action ${key} absente`);
  return node;
};
const target = (node: StageNode) => {
  if (!node.okTransition) return null;
  const a = pack.actionNodes.find((x) => x.id === node.okTransition!.actionNode)!;
  return a.options[node.okTransition.optionIndex];
};

describe("mapToStoryPack", () => {
  it("produit les métadonnées du format v1", () => {
    expect(pack).toMatchObject({
      format: "v1",
      title: fixture.title,
      description: fixture.description,
      version: 1,
      nightModeAvailable: false,
    });
  });

  it("a exactement une couverture (squareOne) qui mène à l'introduction", () => {
    expect(pack.stageNodes.filter((s) => s.squareOne)).toHaveLength(1);
    const cover = stage("cover");
    expect(cover.squareOne).toBe(true);
    expect(cover.image).toBe(assetName("cover"));
    expect(cover.audio).toBe(assetName("title"));
    expect(cover.controlSettings).toEqual({ wheel: true, ok: true, home: false, pause: false, autoplay: false });
    expect(cover.okTransition).toEqual({ actionNode: ids.get("action:start"), optionIndex: 0 });
    expect(target(cover)).toBe(ids.get("seg:intro"));
  });

  it("enchaîne un segment sur le choix qui le suit, en lecture automatique", () => {
    const intro = stage("seg:intro");
    expect(intro.type).toBe("stage");
    expect(intro.image).toBeNull();
    expect(intro.audio).toBe(assetName("segment:intro"));
    expect(intro.controlSettings).toEqual({ wheel: false, ok: false, home: true, pause: true, autoplay: true });
    expect(intro.okTransition).toEqual({ actionNode: ids.get("action:choice:choix-lieu"), optionIndex: 0 });
    expect(action("action:choice:choix-lieu").options).toEqual([ids.get("opt:opt-foret"), ids.get("opt:opt-chateau")]);
  });

  it("annonce chaque option par son picto et son audio, sélectionnable à la molette", () => {
    const opt = stage("opt:opt-foret");
    expect(opt.image).toBe(assetName("option-picto:opt-foret"));
    expect(opt.audio).toBe(assetName("announce:opt-foret"));
    expect(opt.controlSettings).toEqual({ wheel: true, ok: true, home: true, pause: false, autoplay: false });
    expect(target(opt)).toBe(ids.get("seg:foret"));
  });

  it("relie un segment à son suivant via une action à option unique", () => {
    const chateau = stage("seg:chateau");
    expect(action("action:next:chateau").options).toEqual([ids.get("seg:fete")]);
    expect(target(chateau)).toBe(ids.get("seg:fete"));
  });

  it("fait partager le même nœud aux branches qui se rejoignent", () => {
    expect(target(stage("seg:chateau"))).toBe(ids.get("seg:fete"));
    expect(target(stage("opt:opt-fete"))).toBe(ids.get("seg:fete"));
    expect(pack.stageNodes.filter((s) => s.name === "La fête du jardin")).toHaveLength(1);
  });

  it("termine chaque fin sans transition (retour au menu de la Lunii)", () => {
    for (const key of ["seg:fete", "seg:etoiles"]) expect(stage(key).okTransition).toBeNull();
  });

  it("ne produit que des références valides", () => {
    const stageIds = new Set(pack.stageNodes.map((s) => s.uuid));
    const actions = new Map(pack.actionNodes.map((a) => [a.id, a]));
    for (const s of pack.stageNodes) {
      expect(s.homeTransition).toBeNull();
      if (s.okTransition) {
        const a = actions.get(s.okTransition.actionNode);
        expect(a).toBeDefined();
        expect(s.okTransition.optionIndex).toBeLessThan(a!.options.length);
      }
    }
    for (const a of pack.actionNodes) for (const o of a.options) expect(stageIds.has(o)).toBe(true);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const id of [...stageIds, ...actions.keys()]) expect(id).toMatch(uuid);
  });

  it("compte 1 couverture + 5 segments + 4 options", () => {
    expect(pack.stageNodes).toHaveLength(10);
  });
});
