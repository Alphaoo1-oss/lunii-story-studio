import type { VoiceSummary } from "@shared/api";
import type { FamilyMember } from "@shared/model";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/client";

const VOICE_SOURCE: Record<string, string> = {
  voicebox: "Voicebox",
  piper: "voix locale",
  elevenlabs: "ElevenLabs",
  recorded: "voix enregistrée",
};

// Fiche famille : apparence et voix des vraies personnes, reprises dans chaque nouvelle histoire.
export function Family() {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [voiceNames, setVoiceNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api
      .get<FamilyMember[]>("/api/family")
      .then(setMembers)
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
    // Noms des profils Voicebox, pour afficher la voix de chacun (facultatif).
    api
      .get<VoiceSummary[]>("/api/voices?source=voicebox")
      .then((voices) => setVoiceNames(Object.fromEntries(voices.map((v) => [v.id, v.name]))))
      .catch(() => {});
  }, []);

  function change(index: number, patch: Partial<FamilyMember>) {
    setMembers((list) => list!.map((m, i) => (i === index ? { ...m, ...patch } : m)));
    setDirty(true);
    setMessage(null);
  }

  function add() {
    setMembers((list) => [...list!, { id: "", name: "", aliases: [], appearance: "", voice: null, livesAtHome: false }]);
    setDirty(true);
  }

  function remove(index: number) {
    const member = members![index]!;
    if (member.name && !window.confirm(`Retirer ${member.name} de la fiche famille ?`)) return;
    setMembers((list) => list!.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function save() {
    try {
      const kept = members!
        .filter((m) => m.name.trim())
        .map(({ id, ...m }) => ({ ...(id && { id }), ...m, aliases: m.aliases.map((a) => a.trim()).filter(Boolean) }));
      setMembers(await api.put<FamilyMember[]>("/api/family", { members: kept }));
      setDirty(false);
      setMessage({ ok: true, text: "Fiche famille enregistrée." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  if (!members) return <p className="muted">{message?.text ?? "Chargement…"}</p>;

  return (
    <section className="page narrow">
      <div className="card-head">
        <h1>Famille</h1>
        <button disabled={!dirty} onClick={save}>
          Enregistrer
        </button>
      </div>
      <p className="muted">
        Chaque nouvelle histoire reprend l'apparence et la voix des personnes de cette liste quand elles y apparaissent.
        Décrivez seulement leur physique : le déguisement ou la tenue change d'une histoire à l'autre. Une apparence ou
        une voix modifiée dans une histoire est aussi enregistrée ici.
      </p>

      {members.length === 0 && <p className="muted">Personne pour l'instant.</p>}
      {members.map((m, i) => (
        <div className="card" key={m.id || `new-${i}`}>
          <div className="family-names">
            <label>
              Prénom
              <input value={m.name} maxLength={40} onChange={(e) => change(i, { name: e.target.value })} />
            </label>
            <label>
              Autres noms dans les histoires (séparés par des virgules)
              <input
                value={m.aliases.join(", ")}
                placeholder="Maman, Mamie…"
                onChange={(e) => change(i, { aliases: e.target.value.split(",").map((a) => a.trimStart()) })}
              />
            </label>
          </div>
          <label>
            Apparence physique
            <textarea rows={3} maxLength={1000} value={m.appearance} onChange={(e) => change(i, { appearance: e.target.value })} />
          </label>
          <label className="inline">
            <input type="checkbox" checked={m.livesAtHome} onChange={(e) => change(i, { livesAtHome: e.target.checked })} />
            Habite à la maison
          </label>
          <div className="row">
            <span className="muted">
              Voix :{" "}
              {m.voice
                ? `${(m.voice.voiceId && voiceNames[m.voice.voiceId]) || m.voice.voiceId || ""} (${VOICE_SOURCE[m.voice.source]})`
                : "pas encore choisie (elle sera retenue dès qu'elle est choisie à l'étape Voix)"}
            </span>
            {m.voice && (
              <button className="ghost" onClick={() => change(i, { voice: null })}>
                Oublier la voix
              </button>
            )}
            <button className="ghost danger" onClick={() => remove(i)}>
              Retirer
            </button>
          </div>
        </div>
      ))}
      <button className="secondary" onClick={add}>
        Ajouter une personne
      </button>
      {message && (
        <p className={message.ok ? "success" : "error"} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
