import type { ExportCheck, ExportIssue } from "@shared/api";
import type { ExportRecord, ProjectStage } from "@shared/model";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProject } from "../App";
import { ApiRequestError, api, errorMessage } from "../lib/client";

// Étape où corriger chaque problème signalé avant l'export.
function stageFor(issue: ExportIssue): ProjectStage {
  if (issue.code.includes("audio")) return "voices";
  if (issue.code.startsWith("image")) return "pictos";
  return "story";
}

const STAGE_LABEL: Record<ProjectStage, string> = {
  brief: "Idée",
  scenarios: "Scénarios",
  story: "Corriger dans l'histoire",
  voices: "Corriger dans les voix",
  pictos: "Corriger dans les pictos",
  export: "Export",
};

export function Export() {
  const { project, reload } = useProject();
  const [check, setCheck] = useState<ExportCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ExportRecord | null>(null);

  const runCheck = useCallback(async () => {
    try {
      setCheck(await api.get<ExportCheck>(`/api/projects/${project.id}/export/check`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [project.id]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  async function exportPack() {
    setBusy(true);
    setError(null);
    try {
      setLast(await api.post<ExportRecord>(`/api/projects/${project.id}/export`));
      await reload();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiRequestError && err.status === 422) {
        const issues = (err.body as { issues?: ExportIssue[] } | null)?.issues;
        if (issues) setCheck({ ok: false, issues });
      }
    } finally {
      setBusy(false);
    }
  }

  const errors = check?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = check?.issues.filter((i) => i.severity === "warning") ?? [];
  const download = (record: ExportRecord) => `/api/projects/${project.id}/exports/${encodeURIComponent(record.file.split("/").pop()!)}`;

  return (
    <section className="page narrow">
      <div className="card">
        <div className="card-head">
          <h2>Vérification</h2>
          <button className="ghost" onClick={runCheck}>
            Revérifier
          </button>
        </div>
        {!check && <p className="muted">Vérification en cours…</p>}
        {check?.ok && errors.length === 0 && <p className="success">L'histoire est complète : elle peut être exportée.</p>}
        {errors.length > 0 && (
          <>
            <p className="error">
              {errors.length === 1 ? "1 point bloque l'export :" : `${errors.length} points bloquent l'export :`}
            </p>
            <IssueList issues={errors} projectId={project.id} />
          </>
        )}
        {warnings.length > 0 && (
          <>
            <p className="muted">À vérifier (n'empêche pas l'export) :</p>
            <IssueList issues={warnings} projectId={project.id} />
          </>
        )}
      </div>

      <div className="card">
        <h2>Exporter le pack</h2>
        <p className="muted">
          Produit un fichier .zip au format STUdio. Les étapes sans picto recevront un picto simple avec leur titre.
        </p>
        <button disabled={busy || !check?.ok} onClick={exportPack}>
          {busy ? "Export en cours…" : "Exporter"}
        </button>
        {error && <p className="error">{error}</p>}
        {last && (
          <>
            <div className="stats">
              <div className="stat"><strong>{last.stats.segments}</strong>étapes</div>
              <div className="stat"><strong>{last.stats.choices}</strong>choix</div>
              <div className="stat"><strong>{last.stats.endings}</strong>fins</div>
              <div className="stat"><strong>{minutes(last.stats.totalMinutes)}</strong>d'audio</div>
            </div>
            <a href={download(last)} download>
              <button>Télécharger le pack</button>
            </a>
          </>
        )}
      </div>

      <div className="card">
        <h2>Mettre l'histoire sur la Lunii</h2>
        <ol className="steps">
          <li>Téléchargez le pack ci-dessus.</li>
          <li>Ouvrez STUdio ou Lunii QT et branchez la Lunii.</li>
          <li>Importez le fichier .zip dans la bibliothèque, puis transférez-le sur la Lunii.</li>
        </ol>
      </div>

      {project.exports.length > 0 && (
        <div className="card">
          <h2>Exports précédents</h2>
          <ul className="issues">
            {[...project.exports].reverse().map((record) => (
              <li key={record.file} className="row">
                <span>{new Date(record.createdAt).toLocaleString("fr-FR")}</span>
                <span className="muted">
                  {record.stats.segments} étapes · {record.stats.endings} fins · {minutes(record.stats.totalMinutes)}
                </span>
                <a href={download(record)} download>
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function IssueList({ issues, projectId }: { issues: ExportIssue[]; projectId: string }) {
  return (
    <ul className="issues">
      {issues.map((issue, i) => {
        const stage = stageFor(issue);
        return (
          <li key={`${issue.code}-${issue.target.id}-${i}`} className="row">
            <span>{issue.message}</span>
            <Link to={`/projets/${projectId}/${stage}?cible=${issue.target.kind}:${encodeURIComponent(issue.target.id)}`}>
              {STAGE_LABEL[stage]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function minutes(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min`;
}
