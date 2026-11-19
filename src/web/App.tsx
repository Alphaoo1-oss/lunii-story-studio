import type { ProjectView } from "@shared/api";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Stepper } from "./components/Stepper";
import { api, errorMessage } from "./lib/client";
import { savedTheme, setTheme, type ThemeChoice } from "./lib/theme";
import { Brief } from "./pages/Brief";
import { Export } from "./pages/Export";
import { Family } from "./pages/Family";
import { MyLunii } from "./pages/MyLunii";
import { Pictos } from "./pages/Pictos";
import { Scenarios } from "./pages/Scenarios";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { Story } from "./pages/Story";
import { Voices } from "./pages/Voices";

const STAGE_LABEL: Record<string, string> = {
  brief: "Idée",
  scenarios: "Scénarios",
  story: "Histoire",
  voices: "Voix",
  pictos: "Pictos",
  export: "Export",
};

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
            <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
            <path d="M3 6v13" />
            <path d="M12 6v13" />
            <path d="M21 6v13" />
          </svg>
          Lunii Story Studio
        </Link>
        <nav>
          <NavLink to="/" end>
            Mes histoires
          </NavLink>
          <NavLink to="/premiers-pas">Premiers pas</NavLink>
          <NavLink to="/famille">Famille</NavLink>
          <NavLink to="/lunii">Ma Lunii</NavLink>
          <NavLink to="/reglages">Réglages</NavLink>
          <ThemeSelect />
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reglages" element={<Settings />} />
          <Route path="/premiers-pas" element={<Setup />} />
          <Route path="/famille" element={<Family />} />
          <Route path="/lunii" element={<MyLunii />} />
          <Route path="/projets/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="brief" replace />} />
            <Route path="brief" element={<Brief />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="story" element={<Story />} />
            <Route path="voices" element={<Voices />} />
            <Route path="pictos" element={<Pictos />} />
            <Route path="export" element={<Export />} />
          </Route>
          <Route path="*" element={<p>Cette page n'existe pas.</p>} />
        </Routes>
      </main>
    </div>
  );
}

function ThemeSelect() {
  const [choice, setChoice] = useState<ThemeChoice>(savedTheme);
  return (
    <select
      className="theme-select"
      aria-label="Thème de l'interface"
      value={choice}
      onChange={(e) => {
        const next = e.target.value as ThemeChoice;
        setChoice(next);
        setTheme(next);
      }}
    >
      <option value="auto">Thème : auto</option>
      <option value="light">Clair</option>
      <option value="dark">Sombre</option>
    </select>
  );
}

function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ProjectView[]>("/api/projects")
      .then(setProjects)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const [busy, setBusy] = useState(false);

  async function save(change: () => Promise<ProjectView[]>) {
    setBusy(true);
    setError(null);
    try {
      setProjects(await change());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Déplace une histoire d'un cran et enregistre aussitôt le nouvel ordre.
  function move(index: number, delta: number) {
    if (!projects) return;
    const ids = projects.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    void save(() => api.put<ProjectView[]>("/api/projects/order", { ids }));
  }

  function remove(project: ProjectView) {
    const question = `Supprimer « ${project.title} » ?\n\nL'histoire est déplacée dans le dossier « corbeille » des données de l'application.`;
    if (!window.confirm(question)) return;
    void save(() => api.delete<ProjectView[]>(`/api/projects/${project.id}`));
  }

  async function create() {
    try {
      const project = await api.post<ProjectView>("/api/projects");
      navigate(`/projets/${project.id}/brief`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="page narrow">
      <div className="card-head">
        <h1>Mes histoires</h1>
        <button onClick={create}>Nouvelle histoire</button>
      </div>
      {error && <p className="error">{error}</p>}
      {projects?.length === 0 && (
        <div className="card empty-shelf">
          <h2>Votre première histoire vous attend</h2>
          <p className="muted">
            Décrivez une idée, choisissez un scénario, et l'histoire se construit avec vos personnages. Première fois ?
            Commencez par les <Link to="/premiers-pas">Premiers pas</Link> : ils vérifient que tout est prêt.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="secondary" onClick={() => navigate("/premiers-pas")}>
              Premiers pas
            </button>
            <button onClick={create}>Nouvelle histoire</button>
          </div>
        </div>
      )}
      {projects?.map((p, i) => (
        <div key={p.id} className="card project-card">
          <Link to={`/projets/${p.id}/${p.stage}`} className="project-link">
            <Cover project={p} index={i} />
            <span>
              <strong>{p.title}</strong>
              <span className={`project-stage${p.stage === "export" ? " ready" : ""}`}>
                {STAGE_LABEL[p.stage]} · modifiée le {new Date(p.updatedAt).toLocaleDateString("fr-FR")}
              </span>
            </span>
          </Link>
          <div className="project-actions">
            <button className="ghost" title="Monter" disabled={busy || i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="ghost" title="Descendre" disabled={busy || i === projects.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="ghost danger" disabled={busy} onClick={() => remove(p)}>
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

// Couverture de l'histoire : son picto s'il existe, sinon l'initiale du titre sur une couleur douce.
function Cover({ project, index }: { project: ProjectView; index: number }) {
  const cover = project.derived.pictos.find((t) => t.target === "cover");
  const src = cover?.file && cover.state !== "default" ? `/media/${project.id}/${cover.file}` : null;
  return (
    <span className={`project-cover tone-${index % 3}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : project.title.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

type ProjectContextValue = {
  project: ProjectView;
  setProject: (project: ProjectView) => void;
  reload: () => Promise<void>;
};
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProject doit être utilisé dans un projet.");
  return value;
}

function ProjectLayout() {
  const { projectId } = useParams();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProject(await api.get<ProjectView>(`/api/projects/${projectId}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <p className="error">{error}</p>;
  if (!project) return <p className="muted">Chargement…</p>;
  return (
    <ProjectContext.Provider value={{ project, setProject, reload }}>
      <div className="project-head">
        <h1>{project.title}</h1>
        <Stepper projectId={project.id} stage={project.stage} />
      </div>
      <Outlet />
    </ProjectContext.Provider>
  );
}
