import { z } from "zod";
import { API_KEY_FIELDS, type Project, Settings, TextProvider } from "./model";

// Formes d'échange de l'API locale (specs/001-lunii-story-creator/contracts/http-api.md).

export type ApiError = { error: { code: string; message: string } };

export const KeyStatus = z.object({ configured: z.boolean(), last4: z.string() });
export type KeyStatus = z.infer<typeof KeyStatus>;

export type PublicSettings = Omit<Settings, (typeof API_KEY_FIELDS)[number]> & {
  keys: Record<(typeof API_KEY_FIELDS)[number], KeyStatus>;
  // Abonnement Claude possible sur ce poste (usage personnel uniquement).
  subscriptionAllowed?: boolean;
};

// Une clé vide ("") efface la clé ; une clé absente la laisse inchangée.
export const SettingsUpdate = z.object({
  anthropicApiKey: z.string().optional(),
  elevenLabsApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  textProvider: TextProvider.optional(),
  textModel: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

export const SERVICES = ["subscription", "anthropic", "elevenlabs", "gemini"] as const;
export const Service = z.enum(SERVICES);
export type Service = z.infer<typeof Service>;

export type ServiceTestResult = { ok: boolean; message: string };

export type ExportTargetKind = "project" | "segment" | "line" | "choice" | "option" | "cover" | "asset";

// "error" bloque l'export ; "warning" est signalé sans bloquer.
export type ExportIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  target: { kind: ExportTargetKind; id: string };
};

export type ExportCheck = { ok: boolean; issues: ExportIssue[] };

export type SizeEstimate = {
  segments: number;
  endings: number;
  minutesPerSegment: number;
  totalMinutes: number;
  warnings: string[];
};

// Projet renvoyé par l'API, avec ses états dérivés (validité du graphe, estimation de taille).
export type ClipState = "missing" | "stale" | "ok";

// État des audios du projet (FR-014) : par réplique, étape, option, et pour le titre.
export type AudioStatus = {
  lines: Record<string, ClipState>;
  segments: Record<string, ClipState>;
  options: Record<string, ClipState>;
  title: ClipState;
  // Textes à dire en voix de synthèse / à enregistrer soi-même / dont le personnage n'a pas de voix.
  toGenerate: number;
  toRecord: number;
  toAssign: number;
};

export type ProjectView = Project & {
  derived: {
    graphIssues: ExportIssue[];
    estimate: SizeEstimate;
    audio: AudioStatus | null;
    pictos: PictoTarget[];
  };
};

export type PictoStyle = { id: string; label: string; description: string };

// « default » : picto texte généré localement ; « stale » : illustration faite avec un autre
// style ou pour une option dont le libellé a changé.
export type PictoState = "default" | "ok" | "stale" | "imported";

// Couverture (« cover ») ou picto d'une option (« option:<id> »).
export type PictoTarget = { target: string; label: string; file: string | null; state: PictoState };

// Événements envoyés pendant la génération des pictos (flux text/event-stream).
export type PictoEvent =
  | { type: "progress"; done: number; total: number; label: string }
  | { type: "done"; generated: number }
  | { type: "error"; message: string };

export type VoiceSummary = { id: string; name: string; description?: string; installed?: boolean };

// Événements envoyés pendant la génération des voix (flux text/event-stream).
export type AudioEvent =
  | { type: "progress"; done: number; total: number; label: string }
  | { type: "done"; generated: number; recordedPending: number }
  | { type: "error"; message: string };

// Prompts à copier dans l'app Gemini pour créer les pictos à la main.
export type HandPrompts = { intro: string; items: { target: string; prompt: string }[] };

// Lunii branchée en USB (onglet « Ma Lunii »).
export type LuniiDevice = {
  root: string;
  generation: "V2" | "V3";
  firmware: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
};

// « official » : catalogue Lunii ; « custom » : histoire ajoutée (STUdio, Lunii QT…).
export type LuniiStoryOrigin = "official" | "custom" | "unknown";

export type LuniiStory = {
  uuid: string;
  folder: string;
  title: string | null;
  origin: LuniiStoryOrigin;
  // Inscrite dans l'index mais sans dossier sur la Lunii.
  missing: boolean;
  thumbnail: boolean;
};

export type LuniiView = { device: LuniiDevice | null; stories: LuniiStory[]; orphans: string[] };

export type LuniiTrashItem = { id: string; uuid: string; title: string | null; deletedAt: string; sizeBytes: number };

// Page « Premiers pas » : où en est l'installation, étape par étape.
export type SetupStepState = "ok" | "todo" | "optional";
export type SetupStep = {
  id: "claude" | "voices" | "pictos" | "family" | "story";
  title: string;
  state: SetupStepState;
  message: string;
  // Page de l'application où régler l'étape.
  link?: { label: string; to: string };
};
export type SetupStatus = { steps: SetupStep[]; ready: boolean };
