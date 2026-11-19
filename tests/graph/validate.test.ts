import { readFileSync } from "node:fs";
import { DEFAULT_SIZE_SETTINGS, type SizeSettings, StoryGraph } from "@shared/model";
import { describe, expect, it } from "vitest";
import { validateGraph } from "../../src/server/story/validate";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/reference-story.json", import.meta.url), "utf8"));
const size: SizeSettings = fixture.sizeSettings;
const reference = (): StoryGraph => StoryGraph.parse(structuredClone(fixture.graph));
const codes = (graph: StoryGraph, s: SizeSettings = size) => validateGraph(graph, s).map((i) => i.code);
const errors = (graph: StoryGraph, s: SizeSettings = size) =>
  validateGraph(graph, s).filter((i) => i.severity === "error").map((i) => i.code);

describe("validateGraph", () => {
  it("accepte l'histoire de référence (branches qui se rejoignent comprises)", () => {
    expect(validateGraph(reference(), size)).toEqual([]);
  });

  it("règle 1 : le segment de départ doit exister", () => {
    const g = reference();
    g.startSegmentId = "inconnu";
    expect(errors(g)).toContain("start_missing");
  });

  it("règle 2 : la suite d'un segment doit exister", () => {
    const g = reference();
    g.segments[2]!.next = { kind: "segment", segmentId: "inconnu" };
    g.segments[0]!.next = { kind: "choice", choiceId: "inconnu" };
    expect(errors(g)).toEqual(expect.arrayContaining(["unknown_next_segment", "unknown_next_choice"]));
  });

  it("règle 3 : chaque option doit viser un segment existant", () => {
    const g = reference();
    g.choices[0]!.options[1]!.targetSegmentId = "inconnu";
    const issues = validateGraph(g, size);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "unknown_option_target", severity: "error", target: { kind: "option", id: "opt-chateau" } }),
    );
  });

  it("règle 4 : tout segment doit être atteignable", () => {
    const g = reference();
    g.segments.push({ id: "orphelin", title: "Orphelin", lines: g.segments[4]!.lines, next: { kind: "end" }, audio: null });
    expect(validateGraph(g, size)).toContainEqual(
      expect.objectContaining({ code: "unreachable_segment", target: { kind: "segment", id: "orphelin" } }),
    );
  });

  it("règle 5 : aucun cycle", () => {
    const g = reference();
    g.segments.find((s) => s.id === "fete")!.next = { kind: "segment", segmentId: "intro" };
    expect(errors(g)).toContain("cycle");
  });

  it("règle 6 : respect des réglages de taille (avertissement, non bloquant)", () => {
    const g = reference();
    const strict = { ...DEFAULT_SIZE_SETTINGS, choicesPerPath: 1, optionsPerChoice: 3 };
    const issues = validateGraph(g, strict);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["too_many_choices", "wrong_option_count"]));
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("refuse les identifiants en double", () => {
    const g = reference();
    g.segments[4]!.id = "fete";
    g.choices[1]!.options[1]!.targetSegmentId = "fete";
    expect(codes(g)).toContain("duplicate_id");
  });

  it("donne des messages en français", () => {
    const g = reference();
    g.startSegmentId = "inconnu";
    expect(validateGraph(g, size)[0]!.message).toMatch(/segment de départ/i);
  });
});
