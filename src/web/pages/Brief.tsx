import type { ProjectView } from "@shared/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../App";
import { useAutosave } from "../lib/autosave";
import { api, errorMessage } from "../lib/client";

const AGES = [2, 3, 4, 5, 6, 7, 8, 9, 10];

export function Brief() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();
  const [brief, setBrief] = useState(project.brief);
  const [listenerAge, setListenerAge] = useState(project.listenerAge);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveState = useAutosave(
    { brief, listenerAge },
    async (value) => setProject(await api.patch<ProjectView>(`/api/projects/${project.id}`, value)),
  );

  async function propose() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/projects/${project.id}`, { brief, listenerAge });
      setProject(await api.post<ProjectView>(`/api/projects/${project.id}/scenarios`));
      navigate(`/projets/${project.id}/scenarios`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page narrow">
      <div className="card">
        <h2>Décrivez l'histoire</h2>
        <p className="muted">
          Personnages (prénoms, âges, caractère), thème, ambiance, éléments à inclure… Plus c'est précis, plus les scénarios
          vous ressembleront.
        </p>
        <textarea
          rows={7}
          maxLength={4000}
          placeholder="Ex. : Léo, 6 ans, et sa sœur Mia, 4 ans. Une aventure d'Halloween pas trop effrayante, avec un chat noir et beaucoup de bonbons."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <label className="inline">
          Âge de l'enfant qui écoute
          <select value={listenerAge} onChange={(e) => setListenerAge(Number(e.target.value))}>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a} ans
              </option>
            ))}
          </select>
        </label>
        <p className="save-state muted">{saveState}</p>
      </div>

      <div className="card">
        <button disabled={busy || !brief.trim()} onClick={propose}>
          {busy ? "Claude imagine 4 histoires…" : "Proposer 4 scénarios"}
        </button>
        <p className="muted paid">Appelle Claude (payant). Comptez environ une minute.</p>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
