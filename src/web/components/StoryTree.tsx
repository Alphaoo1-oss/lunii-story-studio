import type { ExportIssue } from "@shared/api";
import type { StoryGraph } from "@shared/model";

// Arbre de l'histoire, présenté par niveaux (profondeur depuis le début). Les étapes avec un
// problème de structure sont mises en évidence.
export function StoryTree({
  graph,
  issues,
  selected,
  onSelect,
}: {
  graph: StoryGraph;
  issues: ExportIssue[];
  selected: string | null;
  onSelect: (segmentId: string) => void;
}) {
  const levels = byDepth(graph);
  const title = (id: string) => graph.segments.find((s) => s.id === id)?.title ?? "étape introuvable";
  const flagged = new Set(
    issues.filter((i) => i.severity === "error").flatMap((i) => {
      if (i.target.kind === "segment") return [i.target.id];
      if (i.target.kind === "option") {
        const choice = graph.choices.find((c) => c.options.some((o) => o.id === i.target.id));
        return graph.segments.filter((s) => s.next.kind === "choice" && s.next.choiceId === choice?.id).map((s) => s.id);
      }
      return [];
    }),
  );

  return (
    <div className="story-tree">
      {levels.map((ids, depth) => (
        <div key={depth} className="tree-level">
          <div className="tree-level-label">{depth === 0 ? "Début" : `Après ${depth} choix ou étape${depth > 1 ? "s" : ""}`}</div>
          {ids.map((id) => {
            const segment = graph.segments.find((s) => s.id === id)!;
            const next = segment.next;
            const choice = next.kind === "choice" ? graph.choices.find((c) => c.id === next.choiceId) : undefined;
            return (
              <button
                key={id}
                className={`tree-node ${selected === id ? "selected" : ""} ${flagged.has(id) ? "flagged" : ""}`}
                onClick={() => onSelect(id)}
              >
                <strong>{segment.title}</strong>
                {next.kind === "end" && <span className="badge ok">Fin</span>}
                {next.kind === "segment" && <span className="muted">→ {title(next.segmentId)}</span>}
                {choice && (
                  <span className="muted">
                    ? {choice.options.map((o) => `${o.label} → ${title(o.targetSegmentId)}`).join(" · ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      {unreached(graph, levels).length > 0 && (
        <div className="tree-level">
          <div className="tree-level-label error">Étapes jamais atteintes</div>
          {unreached(graph, levels).map((id) => (
            <button key={id} className="tree-node flagged" onClick={() => onSelect(id)}>
              <strong>{title(id)}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function successors(graph: StoryGraph, id: string): string[] {
  const next = graph.segments.find((s) => s.id === id)?.next;
  if (!next) return [];
  if (next.kind === "segment") return [next.segmentId];
  if (next.kind === "choice") return graph.choices.find((c) => c.id === next.choiceId)?.options.map((o) => o.targetSegmentId) ?? [];
  return [];
}

// Plus long chemin depuis le départ (borné pour rester sûr même si le graphe a une boucle).
function byDepth(graph: StoryGraph): string[][] {
  const depth = new Map<string, number>();
  if (!graph.segments.some((s) => s.id === graph.startSegmentId)) return [];
  depth.set(graph.startSegmentId, 0);
  for (let pass = 0; pass < graph.segments.length; pass++) {
    let changed = false;
    for (const [id, d] of [...depth]) {
      for (const next of successors(graph, id)) {
        if (!graph.segments.some((s) => s.id === next)) continue;
        if ((depth.get(next) ?? -1) < d + 1 && d + 1 < graph.segments.length) {
          depth.set(next, d + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const levels: string[][] = [];
  for (const s of graph.segments) {
    const d = depth.get(s.id);
    if (d !== undefined) (levels[d] ??= []).push(s.id);
  }
  return levels.filter(Boolean);
}

function unreached(graph: StoryGraph, levels: string[][]): string[] {
  const seen = new Set(levels.flat());
  return graph.segments.map((s) => s.id).filter((id) => !seen.has(id));
}
