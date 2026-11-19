import type { SetupStatus, SetupStep } from "@shared/api";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app";

// Page « Premiers pas » : vérifie chaque service sans rien générer (aucun coût).
export async function setupRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/setup", async (): Promise<SetupStatus> => {
    const steps = await Promise.all([claudeStep(deps), voicesStep(deps), pictosStep(deps), familyStep(deps), storyStep(deps)]);
    return { steps, ready: steps.every((s) => s.state !== "todo") };
  });
}

const settingsLink = { label: "Ouvrir les Réglages", to: "/reglages" };

async function claudeStep({ settings, testers }: AppDeps): Promise<SetupStep> {
  const current = await settings.getSettings();
  const subscription = current.textProvider === "subscription";
  const result = await (subscription ? testers.subscription : testers.anthropic)(current).catch(() => ({
    ok: false,
    message: "La vérification a échoué.",
  }));
  return {
    id: "claude",
    title: "Écriture des histoires avec Claude",
    state: result.ok ? "ok" : "todo",
    message: result.ok
      ? `${result.message} Mode : ${subscription ? "abonnement Claude" : "clé API"}.`
      : `${result.message} Sans Claude, l'application ne peut ni proposer de scénarios ni écrire d'histoire.`,
    link: settingsLink,
  };
}

async function voicesStep({ voices, settings }: AppDeps): Promise<SetupStep> {
  const [voicebox, piper, current] = await Promise.all([
    voices.voicebox.listVoices().catch(() => null),
    voices.piper.listVoices().catch(() => []),
    settings.getSettings(),
  ]);
  const found: string[] = [];
  if (voicebox) found.push(`Voicebox (${voicebox.length} profil${voicebox.length > 1 ? "s" : ""})`);
  const piperCount = piper.filter((v) => v.installed).length;
  if (piperCount) found.push(`voix locales Piper (${piperCount})`);
  if (current.elevenLabsApiKey) found.push("ElevenLabs");
  return {
    id: "voices",
    title: "Voix des personnages",
    state: found.length ? "ok" : "optional",
    message: found.length
      ? `Disponibles : ${found.join(", ")}.${voicebox ? "" : " Voicebox n'est pas ouvert ou pas installé."}`
      : "Aucune voix de synthèse pour l'instant. Lancez Voicebox (recommandé), ou installez une voix locale à l'étape Voix d'une histoire. Vous pouvez aussi enregistrer les répliques vous-même.",
  };
}

async function pictosStep({ settings }: AppDeps): Promise<SetupStep> {
  const { geminiApiKey } = await settings.getSettings();
  return {
    id: "pictos",
    title: "Pictos (images sur l'écran de la Lunii)",
    state: geminiApiKey ? "ok" : "optional",
    message: geminiApiKey
      ? "Une clé Gemini est enregistrée : les pictos peuvent être dessinés automatiquement."
      : "Pas de clé Gemini : copiez les consignes dans l'application Gemini (gratuit), importez vos images, ou gardez les pictos par défaut.",
    link: geminiApiKey ? undefined : settingsLink,
  };
}

async function familyStep({ family }: AppDeps): Promise<SetupStep> {
  const members = await family.list();
  return {
    id: "family",
    title: "Fiche famille",
    state: members.length ? "ok" : "optional",
    message: members.length
      ? `${members.length} personne${members.length > 1 ? "s" : ""} : leur apparence et leur voix sont reprises dans chaque histoire.`
      : "Facultatif : décrivez l'enfant et ses proches pour qu'ils gardent la même apparence et la même voix d'une histoire à l'autre.",
    link: { label: "Ouvrir la fiche famille", to: "/famille" },
  };
}

async function storyStep({ projects }: AppDeps): Promise<SetupStep> {
  const list = await projects.list();
  const exported = list.some((p) => p.stage === "export");
  return {
    id: "story",
    title: "Première histoire",
    state: list.length ? "ok" : "todo",
    message: !list.length
      ? "Créez une histoire : décrivez une idée, choisissez un scénario, et l'application fait le reste."
      : exported
        ? "Au moins une histoire est prête à exporter vers la Lunii."
        : `${list.length} histoire${list.length > 1 ? "s" : ""} en cours.`,
    link: { label: "Mes histoires", to: "/" },
  };
}
