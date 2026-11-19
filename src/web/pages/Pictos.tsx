import type { HandPrompts, PictoEvent, PictoState, PictoStyle, PictoTarget, ProjectView } from "@shared/api";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProject } from "../App";
import { LuniiScreen } from "../components/LuniiScreen";
import { api, errorMessage } from "../lib/client";

const STATE: Record<PictoState, { label: string; tone: string }> = {
  default: { label: "Picto par défaut", tone: "" },
  ok: { label: "Illustré", tone: "ok" },
  stale: { label: "À refaire", tone: "warn" },
  imported: { label: "Image importée", tone: "ok" },
};

// Mêmes couleurs que les pictos par défaut créés à l'export.
const DEFAULT_COLORS = ["#F4A259", "#5B8E7D", "#8CB369", "#BC4B51", "#6A8EAE", "#9B72AA"];

export function Pictos() {
  const { project, setProject, reload } = useProject();
  const navigate = useNavigate();
  const [styles, setStyles] = useState<PictoStyle[]>([]);
  const [style, setStyle] = useState<string | null>(project.visualStyle);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [prompts, setPrompts] = useState<HandPrompts | null>(null);
  // Picto qui recevra l'image collée (Ctrl+V), et ceux dont le prompt a été copié.
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!style || !project.graph) return;
    api
      .get<HandPrompts>(`/api/projects/${project.id}/pictos/prompts?style=${encodeURIComponent(style)}`)
      .then(setPrompts)
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
  }, [project.id, project.updatedAt, project.graph, style]);

  // Coller une image copiée depuis Gemini dans le picto sélectionné.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!selected) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void importFile(selected, file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  useEffect(() => {
    api
      .get<PictoStyle[]>("/api/styles")
      .then((list) => {
        setStyles(list);
        setStyle((s) => s ?? list[0]?.id ?? null);
      })
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
  }, []);

  if (!project.graph) {
    return (
      <section className="page narrow card">
        <p>
          Écrivez et validez d'abord l'<Link to={`/projets/${project.id}/story`}>histoire</Link>.
        </p>
      </section>
    );
  }
  const targets = project.derived.pictos;
  // Changer de style rend les illustrations existantes « à refaire ».
  const pending = targets.filter((t) => t.state === "default" || t.state === "stale" || (t.state === "ok" && style !== project.visualStyle));

  // Lance la génération et suit la progression envoyée par le serveur.
  async function generate(scope: "all" | { targets: string[] }) {
    if (!style) return;
    setRunning(true);
    setMessage(null);
    setProgress(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/pictos/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, scope }),
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
          const event = JSON.parse(chunk.slice(6)) as PictoEvent;
          if (event.type === "progress") {
            setProgress(event);
            void reload();
          }
          if (event.type === "error") setMessage({ ok: false, text: event.message });
          if (event.type === "done") {
            setMessage({ ok: true, text: `${event.generated} picto${event.generated > 1 ? "s" : ""} illustré${event.generated > 1 ? "s" : ""}.` });
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

  // Une image faite à partir du prompt copié est suivie comme une illustration de ce style.
  async function importFile(target: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const query = copied.has(target) && style ? `?style=${encodeURIComponent(style)}` : "";
    await act(() => api.put<ProjectView>(`/api/projects/${project.id}/pictos/${target}${query}`, form));
  }

  async function copy(text: string, what: string) {
    const ok = await navigator.clipboard.writeText(text).then(() => true, () => copyWithSelection(text));
    setMessage(
      ok
        ? { ok: true, text: `${what} copié. Collez-le dans Gemini.` }
        : { ok: false, text: "Le presse-papiers n'est pas accessible depuis ce navigateur." },
    );
  }

  async function act(change: () => Promise<ProjectView>) {
    setMessage(null);
    try {
      setProject(await change());
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  async function next() {
    await act(() => api.patch<ProjectView>(`/api/projects/${project.id}`, { stage: "export" }));
    navigate(`/projets/${project.id}/export`);
  }

  return (
    <section className="page">
      <div className="card">
        <h2>Le style des pictos</h2>
        <p className="muted">
          Un même style pour la couverture et toutes les options, pour que l'enfant s'y retrouve sur l'écran de la Lunii.
        </p>
        <div className="style-grid">
          {styles.map((s) => (
            <label key={s.id} className={`style-card${style === s.id ? " selected" : ""}`}>
              <input type="radio" name="style" checked={style === s.id} disabled={running} onChange={() => setStyle(s.id)} />
              <strong>{s.label}</strong>
              <span className="muted">{s.description}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Générer avec la clé Gemini</h2>
          <span className="muted">
            {pending.length} picto(s) à illustrer sur {targets.length}
          </span>
        </div>
        <button disabled={running || !style || pending.length === 0} onClick={() => generate("all")}>
          {running ? "Génération en cours…" : `Illustrer les pictos (${pending.length})`}
        </button>
        <p className="muted paid">Chaque image est facturée par Google (Gemini) sur votre clé.</p>
        {progress && running && (
          <div className="progress">
            <progress max={progress.total} value={progress.done} />
            <span className="muted">
              {progress.done}/{progress.total} — « {progress.label} »
            </span>
          </div>
        )}
        {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
      </div>

      <div className="card">
        <h2>Ou les créer à la main dans Gemini</h2>
        <p className="muted">Inclus dans votre abonnement Gemini, sans frais sur la clé.</p>
        <ol className="hand-steps">
          <li>
            Ouvrez une nouvelle conversation sur{" "}
            <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer">
              gemini.google.com
            </a>{" "}
            et envoyez le message d'ouverture, qui fixe le style et les personnages.{" "}
            <button className="ghost" disabled={!prompts} onClick={() => prompts && void copy(prompts.intro, "Message d'ouverture")}>
              Copier le message d'ouverture
            </button>
          </li>
          <li>
            Pour chaque picto ci-dessous, « Copier le prompt pour Gemini » et envoyez-le dans la même conversation : Gemini
            dessine le picto.
          </li>
          <li>
            Dans Gemini, clic droit sur l'image, « Copier l'image », puis revenez ici et faites <kbd>Ctrl</kbd>+<kbd>V</kbd> : l'image
            va dans le picto sélectionné (encadré). Vous pouvez aussi y glisser un fichier.
          </li>
        </ol>
      </div>

      <div className="card">
        <h2>Aperçu sur la Lunii</h2>
        <div className="picto-grid">
          {targets.map((t, i) => (
            <PictoCard
              key={t.target}
              projectId={project.id}
              target={t}
              color={i === 0 ? "#E2703A" : DEFAULT_COLORS[(i - 1) % DEFAULT_COLORS.length]!}
              busy={running}
              selected={selected === t.target}
              onSelect={() => setSelected(t.target)}
              onCopyPrompt={() => {
                const prompt = prompts?.items.find((p) => p.target === t.target)?.prompt;
                if (!prompt) return;
                setSelected(t.target);
                setCopied((c) => new Set(c).add(t.target));
                void copy(prompt, `Prompt « ${t.target === "cover" ? "Couverture" : t.label} »`);
              }}
              onRegenerate={() => generate({ targets: [t.target] })}
              onImport={(file) => importFile(t.target, file)}
              onReset={() => act(() => api.delete<ProjectView>(`/api/projects/${project.id}/pictos/${t.target}`))}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <button className="secondary" onClick={next}>
          Passer à l'export
        </button>
        <p className="muted">Les pictos non illustrés gardent le picto par défaut (le libellé sur fond coloré).</p>
      </div>
    </section>
  );
}

function PictoCard({
  projectId,
  target,
  color,
  busy,
  selected,
  onSelect,
  onCopyPrompt,
  onRegenerate,
  onImport,
  onReset,
}: {
  projectId: string;
  target: PictoTarget;
  color: string;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onCopyPrompt: () => void;
  onRegenerate: () => void;
  onImport: (file: File) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const state = STATE[target.state];
  const src = target.file && target.state !== "default" ? `/media/${projectId}/${target.file}` : null;
  return (
    <div
      className={`picto-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) {
          onSelect();
          void onImport(file);
        }
      }}
    >
      <button className="copy-prompt" onClick={(e) => (e.stopPropagation(), onCopyPrompt())}>
        Copier le prompt pour Gemini
      </button>
      <LuniiScreen src={src} label={target.label} color={color} />
      <div className="card-head">
        <strong>{target.target === "cover" ? "Couverture" : target.label}</strong>
        <span className={`badge ${state.tone}`}>{state.label}</span>
      </div>
      <div className="picto-actions">
        <button className="ghost" disabled={busy} onClick={onRegenerate}>
          {target.state === "default" ? "Illustrer (clé)" : "Refaire (clé)"}
        </button>
        <button className="ghost" disabled={busy} onClick={() => input.current?.click()}>
          Importer…
        </button>
        {target.state !== "default" && (
          <button className="ghost" disabled={busy} onClick={() => void onReset()}>
            Par défaut
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onImport(file);
          }}
        />
      </div>
    </div>
  );
}

// Copie de secours quand l'API du presse-papiers est refusée (navigateur intégré, par exemple).
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
