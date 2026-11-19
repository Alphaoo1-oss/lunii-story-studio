import type { ClipState } from "@shared/api";
import type { AudioClip } from "@shared/model";

const STATE_LABEL: Record<ClipState, string> = { ok: "Prêt", stale: "À refaire", missing: "Manquant" };
const STATE_CLASS: Record<ClipState, string> = { ok: "ok", stale: "warn", missing: "error" };

export function StateBadge({ state, recorded }: { state: ClipState; recorded?: boolean }) {
  const label = state !== "ok" && recorded ? (state === "missing" ? "À enregistrer" : "À réenregistrer") : STATE_LABEL[state];
  return <span className={`badge ${STATE_CLASS[state]}`}>{label}</span>;
}

// Lecteur compact d'un audio du projet.
export function AudioPlayer({ projectId, clip }: { projectId: string; clip: AudioClip | null }) {
  if (!clip) return null;
  // Le nom du fichier change à chaque nouvelle prise : pas de cache périmé.
  return <audio className="player" controls preload="none" src={`/media/${projectId}/${clip.file}`} />;
}
