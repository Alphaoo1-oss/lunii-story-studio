import type { AudioEvent, ProjectView, VoiceSummary } from "@shared/api";
import type { Character, VoiceAssignment, VoiceSource } from "@shared/model";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProject } from "../App";
import { AudioPlayer, StateBadge } from "../components/AudioPlayer";
import { api, errorMessage } from "../lib/client";

type Synthetic = "voicebox" | "piper" | "elevenlabs";
type VoiceLists = Partial<Record<Synthetic, VoiceSummary[] | string>>;

const SOURCE_LABEL: Record<VoiceSource, string> = {
  recorded: "Ma voix (je l'enregistre)",
  voicebox: "Voicebox (mes profils de voix HD)",
  piper: "Voix locale (gratuite)",
  elevenlabs: "ElevenLabs (payant, plus expressif)",
};

export function Voices() {
  const { project, setProject, reload } = useProject();
  const navigate = useNavigate();
  const [lists, setLists] = useState<VoiceLists>({});
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadVoices = useCallback(async (source: Synthetic) => {
    try {
      const voices = await api.get<VoiceSummary[]>(`/api/voices?source=${source}`);
      setLists((l) => ({ ...l, [source]: voices }));
    } catch (err) {
      setLists((l) => ({ ...l, [source]: errorMessage(err) }));
    }
  }, []);

  useEffect(() => {
    void loadVoices("piper");
    if (project.characters.some((c) => c.voice?.source === "elevenlabs")) void loadVoices("elevenlabs");
    if (project.characters.some((c) => c.voice?.source === "voicebox")) void loadVoices("voicebox");
  }, [loadVoices, project.characters]);

  if (!project.graph || !project.derived.audio) {
    return (
      <section className="page narrow card">
        <p>
          Écrivez et validez d'abord l'<Link to={`/projets/${project.id}/story`}>histoire</Link>.
        </p>
      </section>
    );
  }
  const status = project.derived.audio;
  const usesElevenLabs = project.characters.some((c) => c.voice?.source === "elevenlabs");
  const voiceless = project.characters.filter((c) => !c.voice);

  // Lance la génération et suit la progression envoyée par le serveur.
  async function generate(scope: "all" | { lineIds: string[] }) {
    setRunning(true);
    setMessage(null);
    setProgress(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/audio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error?.message ?? `Erreur ${res.status}.`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6)) as AudioEvent;
          if (event.type === "progress") setProgress(event);
          if (event.type === "error") setMessage({ ok: false, text: event.message });
          if (event.type === "done") {
            const parts = [`${event.generated} audio${event.generated > 1 ? "s" : ""} généré${event.generated > 1 ? "s" : ""}.`];
            if (event.recordedPending) parts.push(`${event.recordedPending} texte(s) restent à enregistrer avec votre voix.`);
            setMessage({ ok: true, text: parts.join(" ") });
          }
        }
      }
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setRunning(false);
      await reload();
    }
  }

  async function next() {
    try {
      setProject(await api.patch<ProjectView>(`/api/projects/${project.id}`, { stage: "pictos" }));
      navigate(`/projets/${project.id}/pictos`);
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  const characterOf = (id: string) => project.characters.find((c) => c.id === id);

  return (
    <section className="page">
      <div className="card">
        <h2>Les voix des personnages</h2>
        <p className="muted">
          Choisissez pour chacun sa voix. Vous pouvez mélanger : par exemple le narrateur avec votre voix et les
          personnages en voix locale.
        </p>
        <div className="voice-grid">
          {project.characters.map((c) => (
            <CharacterVoice key={c.id} character={c} lists={lists} onNeedList={loadVoices} onListChange={setLists} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Générer les voix</h2>
          <span className="muted">
            {status.toGenerate} texte(s) à générer · {status.toRecord} à enregistrer
            {status.toAssign > 0 ? ` · ${status.toAssign} sans voix` : ""}
          </span>
        </div>
        {voiceless.length > 0 && <p className="warn">Voix à choisir : {voiceless.map((c) => c.name).join(", ")}.</p>}
        <button disabled={running || status.toGenerate === 0 || voiceless.length > 0} onClick={() => generate("all")}>
          {running ? "Génération en cours…" : `Générer les voix (${status.toGenerate})`}
        </button>
        {usesElevenLabs && <p className="muted paid">Les répliques en voix ElevenLabs sont facturées par ElevenLabs.</p>}
        {progress && running && (
          <div className="progress">
            <progress max={progress.total} value={progress.done} />
            <span className="muted">
              {progress.done}/{progress.total} — « {progress.label} »
            </span>
          </div>
        )}
        {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
        {status.toRecord > 0 && (
          <p className="muted">
            Les textes en « Ma voix » s'enregistreront à l'étape d'enregistrement (bientôt disponible).
          </p>
        )}
      </div>

      <div className="card">
        <h2>Titre et annonces des choix</h2>
        <div className="audio-row">
          <span>Titre : « {project.title} »</span>
          <StateBadge state={status.title} recorded={characterOf("narrateur")?.voice?.source === "recorded"} />
          <AudioPlayer projectId={project.id} clip={project.titleAudio} />
        </div>
        {project.graph.choices.flatMap((c) => c.options).map((o) => (
          <div key={o.id} className="audio-row">
            <span>Option : « {o.label} »</span>
            <StateBadge state={status.options[o.id]!} recorded={characterOf("narrateur")?.voice?.source === "recorded"} />
            <AudioPlayer projectId={project.id} clip={o.announceAudio} />
          </div>
        ))}
      </div>

      {project.graph.segments.map((segment) => (
        <div key={segment.id} className="card">
          <div className="card-head">
            <h2>{segment.title}</h2>
            <StateBadge state={status.segments[segment.id]!} />
          </div>
          <AudioPlayer projectId={project.id} clip={segment.audio} />
          {segment.lines.map((line) => {
            const character = characterOf(line.characterId);
            const recorded = character?.voice?.source === "recorded";
            return (
              <div key={line.id} className="audio-row line-row">
                <strong>{character?.name}</strong>
                <span className="line-text">{line.text}</span>
                <StateBadge state={status.lines[line.id]!} recorded={recorded} />
                <AudioPlayer projectId={project.id} clip={line.audio} />
                {character?.voice && !recorded && (
                  <button className="ghost" disabled={running} title="Refaire cette réplique" onClick={() => generate({ lineIds: [line.id] })}>
                    Refaire
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="card">
        <button className="secondary" onClick={next}>
          Passer aux pictos
        </button>
        {(status.toGenerate > 0 || status.toRecord > 0) && (
          <p className="muted">Vous pourrez revenir terminer les voix avant l'export.</p>
        )}
      </div>
    </section>
  );
}

function CharacterVoice({
  character,
  lists,
  onNeedList,
  onListChange,
}: {
  character: Character;
  lists: VoiceLists;
  onNeedList: (source: Synthetic) => Promise<void>;
  onListChange: (fn: (l: VoiceLists) => VoiceLists) => void;
}) {
  const { project, setProject } = useProject();
  const [busy, setBusy] = useState<"install" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voice = character.voice;
  const source = voice?.source;
  const list = source && source !== "recorded" ? lists[source] : undefined;
  const voices = Array.isArray(list) ? list : [];
  const selected = voices.find((v) => v.id === voice?.voiceId);

  async function assign(next: VoiceAssignment | null) {
    setError(null);
    try {
      setProject(await api.patch<ProjectView>(`/api/projects/${project.id}/characters/${character.id}`, { voice: next }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function changeSource(next: VoiceSource) {
    if (next === "recorded") return assign({ source: "recorded", voiceId: null, settings: {} });
    if (!lists[next]) await onNeedList(next);
    // Une voix de synthèse n'est attribuée qu'une fois choisie dans la liste.
    await assign(null);
    setPending(next);
  }

  const [pending, setPending] = useState<Synthetic | null>(null);
  const shownSource: VoiceSource | "" = pending ?? source ?? "";
  const shownList = shownSource && shownSource !== "recorded" ? lists[shownSource] : undefined;

  async function install() {
    if (!voice?.voiceId) return;
    setBusy("install");
    setError(null);
    try {
      const updated = await api.post<VoiceSummary[]>("/api/voices/piper/install", { voiceId: voice.voiceId });
      onListChange((l) => ({ ...l, piper: updated }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!voice?.voiceId || source === "recorded" || !source) return;
    setBusy("preview");
    setError(null);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, voiceId: voice.voiceId, settings: voice.settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `Erreur ${res.status}.`);
      const url = URL.createObjectURL(await res.blob());
      await new Audio(url).play();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="voice-card">
      <strong>{character.name}</strong>
      <select value={shownSource} onChange={(e) => changeSource(e.target.value as VoiceSource)}>
        <option value="" disabled>
          Choisir…
        </option>
        {(Object.keys(SOURCE_LABEL) as VoiceSource[]).map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABEL[s]}
          </option>
        ))}
      </select>
      {shownSource && shownSource !== "recorded" && (
        <>
          {typeof shownList === "string" && <p className="error">{shownList}</p>}
          {Array.isArray(shownList) && (
            <select
              value={voice?.voiceId ?? ""}
              onChange={(e) => {
                setPending(null);
                void assign({ source: shownSource, voiceId: e.target.value, settings: {} });
              }}
            >
              <option value="" disabled>
                Choisir une voix…
              </option>
              {shownList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.description ? ` (${v.description})` : ""}
                  {v.installed === false ? " — à télécharger" : ""}
                </option>
              ))}
            </select>
          )}
          {shownSource === "voicebox" && (
            <>
              {Array.isArray(shownList) && shownList.length === 0 && (
                <p className="muted">Aucun profil pour l'instant : créez-en un dans Voicebox (par enregistrement ou par description).</p>
              )}
              <button className="ghost" onClick={() => void onNeedList("voicebox")}>
                ↻ Actualiser mes profils
              </button>
            </>
          )}
        </>
      )}
      {source === "piper" && selected && selected.installed === false && (
        <button className="secondary" disabled={busy !== null} onClick={install}>
          {busy === "install" ? "Téléchargement…" : "Télécharger cette voix (~60 Mo)"}
        </button>
      )}
      {source && source !== "recorded" && voice?.voiceId && (selected?.installed ?? true) && (
        <button className="ghost" disabled={busy !== null} onClick={preview}>
          {busy === "preview" ? "…" : "▶ Écouter un aperçu"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
