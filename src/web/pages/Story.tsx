import type { ProjectView } from "@shared/api";
import type { Character, ChoiceOption, Line, Segment, SizeSettings as Size } from "@shared/model";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useProject } from "../App";
import { SizeSettings } from "../components/SizeSettings";
import { StoryTree } from "../components/StoryTree";
import { useAutosave } from "../lib/autosave";
import { api, errorMessage } from "../lib/client";

export function Story() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(() => targetSegment(project, params.get("cible")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSize, setShowSize] = useState(false);

  const graph = project.graph;
  const issues = project.derived.graphIssues;
  const errors = issues.filter((i) => i.severity === "error");

  useEffect(() => {
    if (graph && !graph.segments.some((s) => s.id === selected)) setSelected(graph.startSegmentId);
  }, [graph, selected]);

  if (!project.selectedScenarioId) {
    return (
      <section className="page narrow card">
        <p>
          Choisissez d'abord un <Link to={`/projets/${project.id}/scenarios`}>scénario</Link>.
        </p>
      </section>
    );
  }

  async function generate() {
    if (graph && !window.confirm("Régénérer toute l'histoire remplacera le texte actuel et vos modifications. Continuer ?")) return;
    setBusy(true);
    setError(null);
    try {
      setProject(await api.post<ProjectView>(`/api/projects/${project.id}/story`));
      setShowSize(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setError(null);
    try {
      setProject(await api.patch<ProjectView>(`/api/projects/${project.id}`, { stage: "voices" }));
      navigate(`/projets/${project.id}/voices`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const sizePanel = (
    <div className="card">
      <h2>Taille de l'histoire</h2>
      <SizeEditor />
      <button disabled={busy} onClick={generate}>
        {busy ? "Claude écrit l'histoire…" : graph ? "Régénérer toute l'histoire" : "Écrire l'histoire"}
      </button>
      <p className="muted paid">Appelle Claude (payant). Comptez une à trois minutes selon la taille.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );

  if (!graph) return <section className="page narrow">{sizePanel}</section>;

  const segment = graph.segments.find((s) => s.id === selected) ?? graph.segments[0]!;

  return (
    <section className="page">
      <div className="story-layout">
        <div>
          <StoryTree graph={graph} issues={issues} selected={segment.id} onSelect={setSelected} />
          <Characters characters={project.characters} />
        </div>
        <SegmentEditor key={segment.id} segment={segment} />
      </div>

      <div className="card">
        {errors.length > 0 ? (
          <>
            <p className="error">À corriger avant de continuer :</p>
            <ul>{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
          </>
        ) : (
          <p className="success">L'histoire est complète : chaque branche mène à une fin.</p>
        )}
        {issues.filter((i) => i.severity === "warning").map((i, n) => (
          <p key={n} className="warn">{i.message}</p>
        ))}
        <div className="row">
          <button disabled={errors.length > 0} onClick={validate}>
            Valider l'histoire et passer aux voix
          </button>
          <button className="ghost" onClick={() => setShowSize((v) => !v)}>
            Changer la taille et tout régénérer
          </button>
        </div>
        {error && !showSize && <p className="error">{error}</p>}
      </div>
      {showSize && sizePanel}
    </section>
  );
}

function targetSegment(project: ProjectView, cible: string | null): string | null {
  if (!cible || !project.graph) return null;
  const [kind, id] = cible.split(":");
  if (kind === "segment") return id ?? null;
  if (kind === "line") return project.graph.segments.find((s) => s.lines.some((l) => l.id === id))?.id ?? null;
  if (kind === "option" || kind === "choice") {
    const choice = project.graph.choices.find((c) => c.id === id || c.options.some((o) => o.id === id));
    return project.graph.segments.find((s) => s.next.kind === "choice" && s.next.choiceId === choice?.id)?.id ?? null;
  }
  return null;
}

function SizeEditor() {
  const { project, setProject } = useProject();
  const [size, setSize] = useState<Size>(project.sizeSettings);
  const state = useAutosave(size, async (sizeSettings) =>
    setProject(await api.patch<ProjectView>(`/api/projects/${project.id}`, { sizeSettings })),
  );
  return (
    <>
      <SizeSettings value={size} onChange={setSize} />
      <p className="save-state muted">{state}</p>
    </>
  );
}

type DraftLine = Pick<Line, "id" | "characterId" | "text">;

function SegmentEditor({ segment }: { segment: Segment }) {
  const { project, setProject } = useProject();
  const [title, setTitle] = useState(segment.title);
  const [lines, setLines] = useState<DraftLine[]>(segment.lines.map(({ id, characterId, text }) => ({ id, characterId, text })));
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim() && lines.length > 0 && lines.every((l) => l.text.trim());
  const state = useAutosave({ title, lines }, async (value) => {
    if (!valid) throw new Error("une réplique ou le titre est vide");
    setProject(await api.patch<ProjectView>(`/api/projects/${project.id}/segments/${segment.id}`, value));
  });

  const choice = segment.next.kind === "choice"
    ? project.graph!.choices.find((c) => segment.next.kind === "choice" && c.id === segment.next.choiceId)
    : undefined;

  const update = (i: number, change: Partial<DraftLine>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...change } : l)));
  const narrator = project.characters.find((c) => c.isNarrator)?.id ?? project.characters[0]?.id ?? "";

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const view = await api.post<ProjectView>(`/api/projects/${project.id}/segments/${segment.id}/regenerate`, { instruction });
      const updated = view.graph!.segments.find((s) => s.id === segment.id)!;
      setLines(updated.lines.map(({ id, characterId, text }) => ({ id, characterId, text })));
      setProject(view);
      setInstruction("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card segment-editor">
      <label>
        Titre de l'étape
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {lines.map((line, i) => (
        <div key={line.id} className="line">
          <select value={line.characterId} onChange={(e) => update(i, { characterId: e.target.value })}>
            {project.characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <textarea rows={3} maxLength={1000} value={line.text} onChange={(e) => update(i, { text: e.target.value })} />
          <button className="ghost" title="Supprimer la réplique" disabled={lines.length === 1}
            onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="secondary"
        onClick={() => setLines((ls) => [...ls, { id: crypto.randomUUID(), characterId: narrator, text: "" }])}>
        Ajouter une réplique
      </button>
      <p className="save-state muted">{state}</p>

      {choice && (
        <div className="choice-box">
          <h3>Choix proposé à l'enfant</h3>
          {choice.options.map((o) => <OptionLabel key={o.id} option={o} />)}
        </div>
      )}
      {segment.next.kind === "end" && <p className="muted">Cette étape termine l'histoire.</p>}

      <div className="regen">
        <h3>Réécrire cette étape</h3>
        <div className="row">
          <input placeholder="Consigne facultative (ex. : plus drôle, ajouter un renard)" value={instruction}
            maxLength={1000} onChange={(e) => setInstruction(e.target.value)} />
          <button className="secondary" disabled={busy} onClick={regenerate}>
            {busy ? "Claude réécrit…" : "Régénérer cette étape"}
          </button>
        </div>
        <p className="muted paid">Appelle Claude (payant). Seule cette étape change.</p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function OptionLabel({ option }: { option: ChoiceOption }) {
  const { project, setProject } = useProject();
  const [label, setLabel] = useState(option.label);
  const target = project.graph!.segments.find((s) => s.id === option.targetSegmentId);
  const state = useAutosave(label, async (value) => {
    if (!value.trim()) throw new Error("le libellé est vide");
    setProject(await api.patch<ProjectView>(`/api/projects/${project.id}/options/${option.id}`, { label: value }));
  });
  return (
    <div className="row option-row">
      <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
      <span className="muted">→ {target?.title ?? "?"}</span>
      <span className="save-state muted">{state}</span>
    </div>
  );
}

function Characters({ characters }: { characters: Character[] }) {
  return (
    <div className="card">
      <h2>Personnages</h2>
      <p className="muted">
        Leur apparence et leur tenue servent aussi à dessiner les pictos. L'apparence physique des personnes de la{" "}
        <Link to="/famille">fiche famille</Link> y est aussi enregistrée.
      </p>
      {characters.filter((c) => !c.isNarrator).map((c) => <CharacterRow key={c.id} character={c} />)}
    </div>
  );
}

function CharacterRow({ character }: { character: Character }) {
  const { project, setProject } = useProject();
  const [fields, setFields] = useState({ appearance: character.appearance, description: character.description });
  const state = useAutosave(fields, async (value) => {
    const patch = {
      ...(value.appearance !== character.appearance && { appearance: value.appearance }),
      ...(value.description !== character.description && { description: value.description }),
    };
    if (Object.keys(patch).length === 0) return;
    setProject(await api.patch<ProjectView>(`/api/projects/${project.id}/characters/${character.id}`, patch));
  });
  return (
    <div className="character-row">
      <strong>
        {character.name}
        {character.age ? ` (${character.age} ans)` : ""}
      </strong>
      <label>
        Apparence physique
        <textarea rows={2} maxLength={1000} value={fields.appearance} onChange={(e) => setFields((f) => ({ ...f, appearance: e.target.value }))} />
      </label>
      <label>
        Tenue, déguisement et caractère dans cette histoire
        <textarea rows={2} maxLength={1000} value={fields.description} onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <span className="save-state muted">{state}</span>
    </div>
  );
}
