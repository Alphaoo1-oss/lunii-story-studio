import type { ExportCheck, ExportIssue } from "@shared/api";
import type { Project } from "@shared/model";
import type { ProjectStore } from "../storage/projects";
import { clipState, lineState, narrator, segmentAudioState, spokenTextHash } from "../story/state";
import { validateGraph } from "../story/validate";
import { checkMedia, mediaRefs } from "./assets";

// Vérification avant export (FR-019) : liste précise de ce qui manque ou bloque.
export async function checkProject(store: ProjectStore, project: Project): Promise<ExportCheck> {
  const graph = project.graph;
  if (!graph) {
    return done([err("no_story", "Le projet n'a pas encore d'histoire.", "project", project.id)]);
  }

  const issues: ExportIssue[] = [...validateGraph(graph, project.sizeSettings)];
  const reader = narrator(project);

  const title = clipState(project.titleAudio, spokenTextHash(project.title, reader));
  if (title === "missing") issues.push(err("title_audio_missing", "Le titre de l'histoire n'a pas encore d'audio.", "project", project.id));
  if (title === "stale") issues.push(err("title_audio_stale", "Le titre a changé : son audio est à refaire.", "project", project.id));

  for (const segment of graph.segments) {
    for (const line of segment.lines) {
      const state = lineState(line, project.characters);
      const who = project.characters.find((c) => c.id === line.characterId)?.name ?? "?";
      if (state === "missing") {
        issues.push(err("line_audio_missing", `Une réplique de ${who} dans « ${segment.title} » n'a pas d'audio.`, "line", line.id));
      } else if (state === "stale") {
        issues.push(err("line_audio_stale", `Une réplique de ${who} dans « ${segment.title} » a changé : son audio est à refaire.`, "line", line.id));
      }
    }
    const state = segmentAudioState(segment, project.characters);
    if (state === "missing") {
      issues.push(err("segment_audio_missing", `L'étape « ${segment.title} » n'a pas encore d'audio.`, "segment", segment.id));
    } else if (state === "stale") {
      issues.push(err("segment_audio_stale", `L'audio de l'étape « ${segment.title} » est à refaire.`, "segment", segment.id));
    }
  }

  for (const choice of graph.choices) {
    for (const option of choice.options) {
      const state = clipState(option.announceAudio, spokenTextHash(option.label, reader));
      if (state === "missing") {
        issues.push(err("option_audio_missing", `L'option « ${option.label} » n'a pas d'annonce audio.`, "option", option.id));
      } else if (state === "stale") {
        issues.push(err("option_audio_stale", `Le libellé de l'option « ${option.label} » a changé : son annonce est à refaire.`, "option", option.id));
      }
    }
  }

  for (const ref of mediaRefs(project)) {
    const issue = await checkMedia(store, project, ref);
    if (issue) issues.push(issue);
  }

  return done(issues);
}

function err(code: string, message: string, kind: ExportIssue["target"]["kind"], id: string): ExportIssue {
  return { code, severity: "error", message, target: { kind, id } };
}

function done(issues: ExportIssue[]): ExportCheck {
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
