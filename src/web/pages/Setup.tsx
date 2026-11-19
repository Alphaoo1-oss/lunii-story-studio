import type { SetupStatus, SetupStepState } from "@shared/api";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/client";

const BADGE: Record<SetupStepState, { label: string; className: string }> = {
  ok: { label: "Prêt", className: "badge ok" },
  todo: { label: "À faire", className: "badge warn" },
  optional: { label: "Facultatif", className: "badge" },
};

// Premiers pas : ce qui est prêt et ce qui manque, vérifié sans rien générer.
export function Setup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.get<SetupStatus>("/api/setup"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <section className="page narrow">
      <div className="card-head">
        <h1>Premiers pas</h1>
        <button className="secondary" disabled={busy} onClick={check}>
          {busy ? "Vérification…" : "Vérifier à nouveau"}
        </button>
      </div>
      <p className="muted">
        Ce qui est prêt et ce qui reste à régler pour créer des histoires. Rien n'est généré ni payé pendant la
        vérification. Dans le dossier de l'application, <code>docs/demarrage-rapide.md</code> résume l'installation en une
        page et <code>docs/guide.md</code> détaille tout.
      </p>
      {error && <p className="error">{error}</p>}
      {!status && !error && <p className="muted">Vérification en cours (quelques secondes)…</p>}
      {status && (
        <>
          <p className={status.ready ? "success" : "warn"} role="status">
            {status.ready
              ? "Tout l'essentiel est prêt : vous pouvez créer une histoire."
              : "Encore une ou deux choses à régler avant de créer une histoire."}
          </p>
          <ol className="setup-steps">
            {status.steps.map((step) => (
              <li key={step.id} className="card setup-step">
                <div className="card-head">
                  <h2>{step.title}</h2>
                  <span className={BADGE[step.state].className}>{BADGE[step.state].label}</span>
                </div>
                <p>{step.message}</p>
                {step.link && (
                  <Link to={step.link.to} className="setup-link">
                    {step.link.label} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <div className="card">
            <h2>Mettre l'histoire sur la Lunii</h2>
            <p>
              À la fin, l'application exporte un fichier <code>.zip</code>. Installez{" "}
              <a href="https://github.com/marian-m12l/studio" target="_blank" rel="noreferrer">
                STUdio
              </a>{" "}
              (ou Lunii QT) sur l'ordinateur, importez-y ce fichier, puis transférez l'histoire sur la Lunii.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
