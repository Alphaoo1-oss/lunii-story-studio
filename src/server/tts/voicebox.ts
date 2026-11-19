import { writeFile } from "node:fs/promises";
import { AppError } from "../errors";
import type { SynthesisItem, TtsProvider, VoiceInfo } from "./provider";

// Voix HD locales via Voicebox (https://github.com/jamiepine/voicebox), lancé à part sur le
// poste : chaque personnage utilise un profil de voix (cloné, prédéfini ou créé par
// description), réutilisable d'une histoire à l'autre.

export const VOICEBOX_URL = process.env.VOICEBOX_URL ?? "http://127.0.0.1:17493";
// Une réplique peut demander du temps au premier chargement du modèle.
const GENERATION_TIMEOUT_MS = 5 * 60_000;

type Fetch = typeof fetch;
type Profile = { id: string; name: string; description?: string | null; language: string; voice_type?: string };
type Status = { status: string; error?: string | null };

const VOICE_TYPE: Record<string, string> = { cloned: "voix clonée", preset: "voix prédéfinie", designed: "voix créée par description" };

export class VoiceboxTts implements TtsProvider {
  constructor(
    private readonly baseUrl: string = VOICEBOX_URL,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async listVoices(): Promise<VoiceInfo[]> {
    const profiles = (await (await this.request("/profiles")).json()) as Profile[];
    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      description: [p.description, VOICE_TYPE[p.voice_type ?? ""], p.language !== "fr" ? `langue : ${p.language}` : null]
        .filter(Boolean)
        .join(", ") || undefined,
      installed: true,
    }));
  }

  async synthesize(items: SynthesisItem[], profileId: string, settings: Record<string, unknown>): Promise<void> {
    const done = items.some((i) => !i.fresh) ? await this.completedByText(profileId) : new Map<string, string>();
    for (const item of items) {
      // Déjà dit par ce profil (une génération interrompue, par exemple) : on reprend l'audio.
      const existing = item.fresh ? undefined : done.get(item.text);
      if (existing) {
        const audio = await this.request(`/audio/${encodeURIComponent(existing)}`);
        await writeFile(item.output, Buffer.from(await audio.arrayBuffer()));
        continue;
      }
      const generation = (await (
        await this.request("/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: profileId,
            text: item.text,
            language: "fr",
            normalize: true,
            ...(typeof settings.instruct === "string" && settings.instruct ? { instruct: settings.instruct } : {}),
            ...(typeof settings.seed === "number" ? { seed: settings.seed } : {}),
          }),
        })
      ).json()) as { id: string };
      await this.waitFor(generation.id);
      const audio = await this.request(`/audio/${encodeURIComponent(generation.id)}`);
      await writeFile(item.output, Buffer.from(await audio.arrayBuffer()));
    }
  }

  // Générations terminées de ce profil, par texte ; l'historique va de la plus récente à la plus
  // ancienne, la première rencontrée l'emporte.
  private async completedByText(profileId: string): Promise<Map<string, string>> {
    const byText = new Map<string, string>();
    // Voicebox refuse (erreur 500) une page de plus de 100 éléments.
    const PAGE = 100;
    for (let offset = 0; ; offset += PAGE) {
      const page = (await (
        await this.request(`/history?profile_id=${encodeURIComponent(profileId)}&limit=${PAGE}&offset=${offset}`)
      ).json()) as { items: { id: string; text: string; status: string; language: string; created_at: string }[]; total: number };
      for (const g of page.items) {
        if (g.status === "completed" && g.language === "fr" && !byText.has(g.text)) byText.set(g.text, g.id);
      }
      if (page.items.length < PAGE || offset + PAGE >= page.total) break;
    }
    return byText;
  }

  // Suit l'état de la génération (flux text/event-stream) jusqu'à « completed » ou « failed ».
  private async waitFor(generationId: string): Promise<void> {
    const res = await this.request(`/generate/${encodeURIComponent(generationId)}/status`, {
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
    const text = await res.text().catch(async () => {
      // Une génération bloquée occupe Voicebox : on l'annule pour libérer la file.
      await this.request(`/generate/${encodeURIComponent(generationId)}/cancel`, { method: "POST" }).catch(() => {});
      throw new AppError("voicebox_timeout", "Voicebox met trop de temps à répondre. Réessayez.", 504);
    });
    const events = text
      .split("\n\n")
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => JSON.parse(chunk.slice(6)) as Status);
    const last = events.at(-1);
    if (last?.status === "completed") return;
    if (last?.status === "not_found") throw new AppError("voicebox_error", "Voicebox a perdu la génération en cours. Réessayez.", 502);
    throw new AppError("voicebox_failed", `Voicebox n'a pas pu générer la réplique${last?.error ? ` : ${last.error}` : "."}`, 502);
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(60_000), ...init });
    } catch {
      throw new AppError("voicebox_offline", "Voicebox n'est pas lancé. Ouvrez l'application Voicebox, puis réessayez.", 503);
    }
    if (res.ok) return res;
    const detail = await res.text().catch(() => "");
    if (res.status === 404 && /profile/i.test(detail)) {
      throw new AppError("voicebox_profile", "Ce profil de voix n'existe plus dans Voicebox. Choisissez-en un autre.", 400);
    }
    throw new AppError("voicebox_error", `Voicebox a répondu avec une erreur (${res.status}).`, 502);
  }
}
