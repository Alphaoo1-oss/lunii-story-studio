import type { PublicSettings, Service, ServiceTestResult, SettingsUpdate } from "@shared/api";
import type { ApiKeyField, TextProvider } from "@shared/model";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/client";

const SERVICES: { service: Service; field: ApiKeyField; name: string; usage: string; required: boolean }[] = [
  { service: "anthropic", field: "anthropicApiKey", name: "Anthropic (clé API)", usage: "Écrit les scénarios et les histoires (payant, facturé par Anthropic sur votre compte).", required: false },
  { service: "elevenlabs", field: "elevenLabsApiKey", name: "ElevenLabs", usage: "Voix de synthèse expressives (payant).", required: false },
  { service: "gemini", field: "geminiApiKey", name: "Google Gemini (Nano Banana)", usage: "Génère les pictos illustrés (payant).", required: false },
];

export function Settings() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ApiKeyField, string>>>({});
  const [models, setModels] = useState({ textModel: "", imageModel: "" });
  const [tests, setTests] = useState<Partial<Record<Service, ServiceTestResult | "pending">>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .get<PublicSettings>("/api/settings")
      .then((s) => {
        setSettings(s);
        setModels({ textModel: s.textModel, imageModel: s.imageModel });
      })
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
  }, []);

  async function save(update: SettingsUpdate) {
    try {
      const s = await api.put<PublicSettings>("/api/settings", update);
      setSettings(s);
      setDrafts({});
      setMessage({ ok: true, text: "Réglages enregistrés." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  async function test(service: Service) {
    setTests((t) => ({ ...t, [service]: "pending" }));
    try {
      const result = await api.post<ServiceTestResult>(`/api/settings/test/${service}`);
      setTests((t) => ({ ...t, [service]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [service]: { ok: false, message: errorMessage(err) } }));
    }
  }

  if (!settings) return <p className="muted">{message?.text ?? "Chargement…"}</p>;

  return (
    <section className="page narrow">
      <h1>Réglages</h1>
      <p className="muted">
        Les clés restent sur cet ordinateur. Une fois enregistrées, elles ne sont plus jamais affichées.
      </p>

      <div className="card">
        <div className="card-head">
          <h2>Écriture des histoires</h2>
        </div>
        {settings.subscriptionAllowed ? (
          <>
            <label className="radio">
              <input type="radio" name="provider" checked={settings.textProvider === "subscription"}
                onChange={() => save({ textProvider: "subscription" as TextProvider })} />
              Mon abonnement Claude (usage personnel uniquement)
            </label>
            <label className="radio">
              <input type="radio" name="provider" checked={settings.textProvider === "api"}
                onChange={() => save({ textProvider: "api" as TextProvider })} />
              Une clé API Anthropic
            </label>
          </>
        ) : (
          <p className="muted">
            Les histoires sont écrites par Claude avec <strong>votre propre clé API Anthropic</strong>, à créer sur{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>{" "}
            puis à enregistrer ci-dessous. Chaque génération est facturée sur votre compte Anthropic.
          </p>
        )}
        {settings.textProvider === "subscription" && (
          <>
            <p className="muted">
              Les générations comptent dans les limites de votre abonnement. À faire une seule fois : lancez
              <code> npm run claude:login </code> dans un terminal, dans le dossier du projet, et connectez-vous (sous
              Windows, si PowerShell bloque npm : <code>npm.cmd run claude:login</code>).
            </p>
            <button className="secondary" disabled={tests.subscription === "pending"} onClick={() => test("subscription")}>
              {tests.subscription === "pending" ? "Vérification…" : "Vérifier la connexion"}
            </button>
            {tests.subscription && tests.subscription !== "pending" && (
              <p className={tests.subscription.ok ? "success" : "error"}>{tests.subscription.message}</p>
            )}
          </>
        )}
      </div>

      {SERVICES.map(({ service, field, name, usage, required }) => {
        const status = settings.keys[field];
        const result = tests[service];
        return (
          <div className="card" key={service}>
            <div className="card-head">
              <h2>{name}</h2>
              <span className={`badge ${status.configured ? "ok" : required || (service === "anthropic" && settings.textProvider === "api") ? "warn" : ""}`}>
                {status.configured ? `Clé enregistrée (…${status.last4})` : required || (service === "anthropic" && settings.textProvider === "api") ? "Clé requise" : "Facultatif"}
              </span>
            </div>
            <p className="muted">{usage}</p>
            <div className="row">
              <input
                type="password"
                autoComplete="off"
                placeholder={status.configured ? "Remplacer la clé" : "Coller la clé ici"}
                value={drafts[field] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [field]: e.target.value }))}
              />
              <button disabled={!drafts[field]} onClick={() => save({ [field]: drafts[field] })}>
                Enregistrer
              </button>
              <button className="secondary" disabled={!status.configured || result === "pending"} onClick={() => test(service)}>
                {result === "pending" ? "Test…" : "Tester"}
              </button>
              {status.configured && (
                <button className="ghost" onClick={() => save({ [field]: "" })}>
                  Effacer
                </button>
              )}
            </div>
            {result && result !== "pending" && <p className={result.ok ? "success" : "error"}>{result.message}</p>}
          </div>
        );
      })}

      <div className="card">
        <h2>Modèles</h2>
        <label>
          Modèle pour écrire les histoires
          <input value={models.textModel} onChange={(e) => setModels((m) => ({ ...m, textModel: e.target.value }))} />
        </label>
        <label>
          Modèle pour les pictos
          <input value={models.imageModel} onChange={(e) => setModels((m) => ({ ...m, imageModel: e.target.value }))} />
        </label>
        <button onClick={() => save(models)}>Enregistrer les modèles</button>
      </div>

      {message && <p className={message.ok ? "success" : "error"} role="status">{message.text}</p>}
    </section>
  );
}
