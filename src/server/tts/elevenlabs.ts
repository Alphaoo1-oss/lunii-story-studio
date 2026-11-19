import { writeFile } from "node:fs/promises";
import { AppError } from "../errors";
import type { SettingsStore } from "../storage/settings";
import type { SynthesisItem, TtsProvider, VoiceInfo } from "./provider";

const API = "https://api.elevenlabs.io";
const MODEL = "eleven_multilingual_v2";

type Fetch = typeof fetch;

// Voix ElevenLabs (payantes) : une requête par texte, réponse MP3 44,1 kHz.
export class ElevenLabsTts implements TtsProvider {
  constructor(
    private readonly settings: SettingsStore,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async listVoices(): Promise<VoiceInfo[]> {
    const res = await this.request("/v2/voices?page_size=100", { method: "GET" });
    const body = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    return (body.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: Object.values(v.labels ?? {}).filter(Boolean).join(", ") || undefined,
      installed: true,
    }));
  }

  async synthesize(items: SynthesisItem[], voiceId: string, settings: Record<string, unknown>): Promise<void> {
    for (const item of items) {
      const res = await this.request(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: item.text,
          model_id: MODEL,
          ...(typeof settings.stability === "number" ? { voice_settings: { stability: settings.stability, similarity_boost: 0.75 } } : {}),
        }),
      });
      await writeFile(item.output, Buffer.from(await res.arrayBuffer()));
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const { elevenLabsApiKey } = await this.settings.getSettings();
    if (!elevenLabsApiKey) {
      throw new AppError("elevenlabs_key_missing", "Aucune clé ElevenLabs n'est enregistrée. Ajoutez-la dans les Réglages.");
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "xi-api-key": elevenLabsApiKey },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AppError("elevenlabs_network", "Impossible de joindre ElevenLabs. Vérifiez la connexion Internet.", 503);
    }
    if (res.ok) return res;
    const detail = await res.text().catch(() => "");
    if (/quota/i.test(detail) || res.status === 429) {
      throw new AppError("elevenlabs_quota", "Le quota ElevenLabs est épuisé ou la limite est atteinte. Réessayez plus tard.", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError("elevenlabs_auth", "La clé ElevenLabs est refusée. Vérifiez-la dans les Réglages.", 400);
    }
    if (res.status === 404) throw new AppError("elevenlabs_voice", "Cette voix ElevenLabs n'existe plus. Choisissez-en une autre.", 400);
    throw new AppError("elevenlabs_error", `ElevenLabs a répondu avec une erreur (${res.status}).`, 502);
  }
}
