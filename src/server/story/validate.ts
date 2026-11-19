import type { ExportIssue } from "@shared/api";
import type { SizeSettings, StoryGraph } from "@shared/model";

// Règles de validité du graphe (data-model.md, StoryGraph). Les écarts aux réglages de taille
// sont des avertissements : l'utilisateur peut avoir ajouté ou retiré une option volontairement.

const error = (code: string, message: string, kind: ExportIssue["target"]["kind"], id: string): ExportIssue => ({
  code,
  severity: "error",
  message,
  target: { kind, id },
});
const warning = (code: string, message: string, kind: ExportIssue["target"]["kind"], id: string): ExportIssue => ({
  ...error(code, message, kind, id),
  severity: "warning",
});

// Successeurs d'un segment dans le graphe des segments (à travers les choix).
export function successors(graph: StoryGraph, segmentId: string): string[] {
  const segment = graph.segments.find((s) => s.id === segmentId);
  if (!segment) return [];
  const { next } = segment;
  if (next.kind === "segment") return [next.segmentId];
  if (next.kind === "choice") {
    return graph.choices.find((c) => c.id === next.choiceId)?.options.map((o) => o.targetSegmentId) ?? [];
  }
  return [];
}

export function reachableSegments(graph: StoryGraph): Set<string> {
  const seen = new Set<string>();
  const stack = graph.segments.some((s) => s.id === graph.startSegmentId) ? [graph.startSegmentId] : [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...successors(graph, id).filter((t) => graph.segments.some((s) => s.id === t)));
  }
  return seen;
}

export function validateGraph(graph: StoryGraph, size: SizeSettings): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const segmentIds = new Set<string>();
  const choiceIds = new Set<string>();
  const optionIds = new Set<string>();

  for (const s of graph.segments) {
    if (segmentIds.has(s.id)) issues.push(error("duplicate_id", `Deux étapes portent le même identifiant « ${s.id} ».`, "segment", s.id));
    segmentIds.add(s.id);
  }
  for (const c of graph.choices) {
    if (choiceIds.has(c.id)) issues.push(error("duplicate_id", `Deux choix portent le même identifiant « ${c.id} ».`, "choice", c.id));
    choiceIds.add(c.id);
    for (const o of c.options) {
      if (optionIds.has(o.id)) issues.push(error("duplicate_id", `Deux options portent le même identifiant « ${o.id} ».`, "option", o.id));
      optionIds.add(o.id);
    }
  }

  // Règle 1
  if (!segmentIds.has(graph.startSegmentId)) {
    issues.push(error("start_missing", "Le segment de départ de l'histoire est introuvable.", "project", graph.startSegmentId));
  }

  // Règle 2
  const usedChoices = new Set<string>();
  for (const s of graph.segments) {
    if (s.next.kind === "segment" && !segmentIds.has(s.next.segmentId)) {
      issues.push(error("unknown_next_segment", `L'étape « ${s.title} » mène à une étape qui n'existe pas.`, "segment", s.id));
    }
    if (s.next.kind === "choice") {
      usedChoices.add(s.next.choiceId);
      if (!choiceIds.has(s.next.choiceId)) {
        issues.push(error("unknown_next_choice", `L'étape « ${s.title} » mène à un choix qui n'existe pas.`, "segment", s.id));
      }
    }
  }

  // Règle 3
  for (const c of graph.choices) {
    for (const o of c.options) {
      if (!segmentIds.has(o.targetSegmentId)) {
        issues.push(error("unknown_option_target", `L'option « ${o.label} » ne mène à aucune étape.`, "option", o.id));
      }
    }
  }

  // Règle 4
  const reachable = reachableSegments(graph);
  for (const s of graph.segments) {
    if (segmentIds.has(graph.startSegmentId) && !reachable.has(s.id)) {
      issues.push(error("unreachable_segment", `L'étape « ${s.title} » n'est jamais atteinte.`, "segment", s.id));
    }
  }
  for (const c of graph.choices) {
    if (!usedChoices.has(c.id)) {
      issues.push(error("unreachable_choice", `Le choix « ${c.prompt} » n'est proposé après aucune étape.`, "choice", c.id));
    }
  }

  // Règle 5 (et calcul de la profondeur en choix, pour la règle 6)
  const cycle = findCycle(graph);
  if (cycle) {
    issues.push(error("cycle", "L'histoire tourne en rond : une branche revient à une étape déjà passée.", "segment", cycle));
  } else if (segmentIds.has(graph.startSegmentId)) {
    // Règle 6
    const depth = maxChoicesOnPath(graph);
    if (depth > size.choicesPerPath) {
      issues.push(
        warning(
          "too_many_choices",
          `Un parcours compte ${depth} choix alors que le réglage en prévoit au plus ${size.choicesPerPath}.`,
          "project",
          graph.startSegmentId,
        ),
      );
    }
  }
  for (const c of graph.choices) {
    if (c.options.length !== size.optionsPerChoice) {
      issues.push(
        warning(
          "wrong_option_count",
          `Le choix « ${c.prompt} » propose ${c.options.length} options au lieu de ${size.optionsPerChoice}.`,
          "choice",
          c.id,
        ),
      );
    }
  }

  return issues;
}

function findCycle(graph: StoryGraph): string | null {
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): string | null => {
    if (state.get(id) === "visiting") return id;
    if (state.get(id) === "done") return null;
    state.set(id, "visiting");
    for (const next of successors(graph, id)) {
      const found = visit(next);
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };
  for (const s of graph.segments) {
    const found = visit(s.id);
    if (found) return found;
  }
  return null;
}

// Nombre maximal de points de choix rencontrés sur un parcours depuis le départ (graphe acyclique).
export function maxChoicesOnPath(graph: StoryGraph): number {
  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const segment = graph.segments.find((s) => s.id === id);
    if (!segment) return 0;
    const below = Math.max(0, ...successors(graph, id).map(depth));
    const value = below + (segment.next.kind === "choice" ? 1 : 0);
    memo.set(id, value);
    return value;
  };
  return depth(graph.startSegmentId);
}

export function graphStats(graph: StoryGraph) {
  return {
    segments: graph.segments.length,
    choices: graph.choices.length,
    endings: graph.segments.filter((s) => s.next.kind === "end").length,
  };
}
