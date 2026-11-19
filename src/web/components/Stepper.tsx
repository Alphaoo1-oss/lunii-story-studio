import { PROJECT_STAGES, type ProjectStage } from "@shared/model";
import { NavLink } from "react-router-dom";

const LABELS: Record<ProjectStage, string> = {
  brief: "Idée",
  scenarios: "Scénarios",
  story: "Histoire",
  voices: "Voix",
  pictos: "Pictos",
  export: "Export",
};

// Étapes du parcours ; on peut revenir à une étape déjà atteinte, pas sauter en avant.
export function Stepper({ projectId, stage }: { projectId: string; stage: ProjectStage }) {
  const reached = PROJECT_STAGES.indexOf(stage);
  return (
    <ol className="stepper" aria-label="Étapes de création">
      {PROJECT_STAGES.map((s, i) => (
        <li key={s} className={i <= reached ? "reached" : "locked"}>
          {i <= reached ? (
            <NavLink to={`/projets/${projectId}/${s}`}>
              <span className="step-num">{i + 1}</span> {LABELS[s]}
            </NavLink>
          ) : (
            <span>
              <span className="step-num">{i + 1}</span> {LABELS[s]}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
