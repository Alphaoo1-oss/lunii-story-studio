import { randomUUID } from "node:crypto";
import type { Project } from "@shared/model";
import { reachableSegments, successors } from "../story/validate";
import type { ActionNode, ControlSettings, StageNode, StoryPack } from "./types";

// Correspondance modèle → story.json (contracts/studio-pack.md, table « Correspondance »).

// Clés logiques des médias, résolues en noms d'assets par l'appelant :
// "cover", "title", "segment:<id>", "announce:<optionId>", "option-picto:<optionId>".
export type AssetResolver = (key: string) => string;

const COVER: ControlSettings = { wheel: true, ok: true, home: false, pause: false, autoplay: false };
const SEGMENT: ControlSettings = { wheel: false, ok: false, home: true, pause: true, autoplay: true };
const OPTION: ControlSettings = { wheel: true, ok: true, home: true, pause: false, autoplay: false };

const X_STEP = 300;
const Y_STEP = 160;

export function mapToStoryPack(project: Project, asset: AssetResolver): { pack: StoryPack; ids: Map<string, string> } {
  const graph = project.graph;
  if (!graph) throw new Error("Le projet n'a pas d'histoire.");

  // Identifiants des nœuds par clé logique : "cover", "seg:<id>", "opt:<id>", "action:…".
  const ids = new Map<string, string>();
  const id = (key: string) => {
    if (!ids.has(key)) ids.set(key, randomUUID());
    return ids.get(key)!;
  };
  const depth = segmentDepths(project);
  const rows = new Map<number, number>();
  const place = (column: number) => {
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { x: column * X_STEP, y: row * Y_STEP };
  };

  const stageNodes: StageNode[] = [];
  const actionNodes: ActionNode[] = [];
  const stage = (node: Omit<StageNode, "type" | "homeTransition">) =>
    stageNodes.push({ ...node, type: "stage", homeTransition: null });
  const singleAction = (key: string, name: string, target: string, column: number) => {
    if (!actionNodes.some((a) => a.id === ids.get(key))) {
      actionNodes.push({ id: id(key), name, options: [target], position: place(column) });
    }
    return { actionNode: id(key), optionIndex: 0 };
  };

  stage({
    uuid: id("cover"),
    name: "Couverture",
    squareOne: true,
    image: asset("cover"),
    audio: asset("title"),
    controlSettings: COVER,
    okTransition: singleAction("action:start", "Début", id(`seg:${graph.startSegmentId}`), 1),
    position: place(0),
  });

  for (const segment of graph.segments) {
    const column = 2 + 4 * (depth.get(segment.id) ?? 0);
    const next = segment.next;
    let okTransition: StageNode["okTransition"] = null;
    if (next.kind === "choice") {
      okTransition = { actionNode: id(`action:choice:${next.choiceId}`), optionIndex: 0 };
    } else if (next.kind === "segment") {
      okTransition = singleAction(`action:next:${segment.id}`, `Suite de ${segment.title}`, id(`seg:${next.segmentId}`), column + 1);
    }
    stage({
      uuid: id(`seg:${segment.id}`),
      name: segment.title,
      squareOne: false,
      image: null,
      audio: asset(`segment:${segment.id}`),
      controlSettings: SEGMENT,
      okTransition,
      position: place(column),
    });
  }

  for (const choice of graph.choices) {
    const parent = graph.segments.find((s) => s.next.kind === "choice" && s.next.choiceId === choice.id);
    const column = 3 + 4 * (parent ? (depth.get(parent.id) ?? 0) : 0);
    actionNodes.push({
      id: id(`action:choice:${choice.id}`),
      name: choice.prompt,
      options: choice.options.map((o) => id(`opt:${o.id}`)),
      position: place(column),
    });
    for (const option of choice.options) {
      stage({
        uuid: id(`opt:${option.id}`),
        name: option.label,
        squareOne: false,
        image: asset(`option-picto:${option.id}`),
        audio: asset(`announce:${option.id}`),
        controlSettings: OPTION,
        okTransition: singleAction(`action:go:${option.id}`, option.label, id(`seg:${option.targetSegmentId}`), column + 1),
        position: place(column + 0.5),
      });
    }
  }

  return {
    pack: {
      format: "v1",
      title: project.title,
      description: project.description,
      version: 1,
      nightModeAvailable: false,
      stageNodes,
      actionNodes,
    },
    ids,
  };
}

// Profondeur de chaque segment (plus long chemin depuis le départ) pour disposer le graphe en
// couches lisibles dans l'éditeur STUdio.
function segmentDepths(project: Project): Map<string, number> {
  const graph = project.graph!;
  const depth = new Map<string, number>([[graph.startSegmentId, 0]]);
  const reachable = reachableSegments(graph);
  // Graphe acyclique (validé avant export) : au plus |segments| relaxations.
  for (let pass = 0; pass < graph.segments.length; pass++) {
    let changed = false;
    for (const id of reachable) {
      const d = depth.get(id);
      if (d === undefined) continue;
      for (const next of successors(graph, id)) {
        if ((depth.get(next) ?? -1) < d + 1) {
          depth.set(next, d + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return depth;
}
