import type { ProjectView } from "@shared/api";
import type { Scenario } from "@shared/model";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProject } from "../App";
import { api, errorMessage } from "../lib/client";

export function Scenarios() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();
  const [extraHint, setExtraHint] = useState("");
  const [busy, setBusy] = useState<"more" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const batches = project.scenarioBatches;
  const latest = batches.at(-1) ?? [];
  const older = batches.slice(0, -1).flat();

  async function more() {
    setBusy("more");
    setError(null);
    try {
      setProject(await api.post<ProjectView>(`/api/projects/${project.id}/scenarios`, { extraHint }));
      setExtraHint("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function choose(scenario: Scenario) {
    if (project.graph && project.selectedScenarioId !== scenario.id) {
      const ok = window.confirm("Choisir un autre scénario remplacera l'histoire déjà écrite. Continuer ?");
      if (!ok) return;
    }
    if (project.graph && project.selectedScenarioId === scenario.id) {
      navigate(`/projets/${project.id}/story`);
      return;
    }
    setBusy(scenario.id);
    setError(null);
    try {
      setProject(await api.post<ProjectView>(`/api/projects/${project.id}/scenarios/${scenario.id}/select`));
      navigate(`/projets/${project.id}/story`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (batches.length === 0) {
    return (
      <section className="page narrow card">
        <p>
          Aucun scénario pour l'instant. <Link to={`/projets/${project.id}/brief`}>Décrivez l'histoire</Link> puis demandez des
          propositions.
        </p>
      </section>
    );
  }

  const card = (s: Scenario) => (
    <article key={s.id} className={`card scenario ${project.selectedScenarioId === s.id ? "selected" : ""}`}>
      <h2>{s.title}</h2>
      <p>{s.summary}</p>
      <p className="muted">
        <strong>Personnages :</strong> {s.characters.map((c) => `${c.name}${c.age ? ` (${c.age} ans)` : ""}`).join(", ")}
      </p>
      {s.choiceIdeas.length > 0 && (
        <ul className="muted">
          {s.choiceIdeas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      )}
      <button disabled={busy !== null} onClick={() => choose(s)}>
        {busy === s.id ? "…" : project.selectedScenarioId === s.id ? "Scénario retenu" : "Choisir ce scénario"}
      </button>
    </article>
  );

  return (
    <section className="page">
      {project.assumptions.length > 0 && (
        <div className="card note">
          <strong>Claude a fait quelques suppositions :</strong>
          <ul>
            {project.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid">{latest.map(card)}</div>

      <div className="card">
        <h2>Aucun ne convient ?</h2>
        <div className="row">
          <input
            placeholder="Précision facultative (ex. : avec un chat noir)"
            value={extraHint}
            maxLength={1000}
            onChange={(e) => setExtraHint(e.target.value)}
          />
          <button className="secondary" disabled={busy !== null} onClick={more}>
            {busy === "more" ? "Claude imagine 4 histoires…" : "Autres propositions"}
          </button>
        </div>
        <p className="muted paid">Appelle Claude (payant).</p>
        {error && <p className="error">{error}</p>}
      </div>

      {older.length > 0 && (
        <div>
          <button className="ghost" onClick={() => setShowOlder((v) => !v)}>
            {showOlder ? "Masquer" : "Revoir"} les propositions précédentes ({older.length})
          </button>
          {showOlder && <div className="grid">{older.map(card)}</div>}
        </div>
      )}
    </section>
  );
}
