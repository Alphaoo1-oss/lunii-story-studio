import { AppError } from "../errors";
import type { SettingsStore } from "../storage/settings";
import type { ImageProvider, ImageRequest } from "./provider";

// Pictos illustrés via Gemini Nano Banana (research.md R9), API REST generateContent : pas de
// SDK à installer. Format 4:3, recadré ensuite en 320×240.
const API = "https://generativelanguage.googleapis.com/v1beta";

type Fetch = typeof fetch;
type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Response_ = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export class GeminiImages implements ImageProvider {
  constructor(
    private readonly settings: SettingsStore,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async generate({ prompt, references = [] }: ImageRequest): Promise<Buffer> {
    const { geminiApiKey, imageModel } = await this.settings.getSettings();
    if (!geminiApiKey) {
      throw new AppError("gemini_key_missing", "Aucune clé Gemini n'est enregistrée. Ajoutez-la dans les Réglages.");
    }
    const parts: Part[] = [
      ...references.map((r) => ({ inlineData: { mimeType: mimeOf(r), data: r.toString("base64") } })),
      { text: prompt },
    ];
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/models/${encodeURIComponent(imageModel)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new AppError("gemini_network", "Impossible de joindre Gemini. Vérifiez la connexion Internet.", 503);
    }
    if (!res.ok) throw translate(res.status, await res.text().catch(() => ""), imageModel);

    const body = (await res.json()) as Response_;
    const image = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (image) return Buffer.from(image.data, "base64");
    const reason = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "";
    if (/SAFETY|PROHIBITED|BLOCK/i.test(reason)) {
      throw new AppError("gemini_refused", "Gemini a refusé de dessiner ce picto. Reformulez l'option ou importez une image.", 422);
    }
    throw new AppError("gemini_no_image", "Gemini n'a renvoyé aucune image. Réessayez.", 502);
  }
}

function translate(status: number, detail: string, model: string): AppError {
  // L'offre gratuite ne donne droit à aucune image (limite 0) : il faut activer la facturation.
  if (status === 429 && /free_tier/i.test(detail) && /limit: 0\b/.test(detail)) {
    return new AppError(
      "gemini_billing",
      "Votre clé Gemini est sur l'offre gratuite, qui ne permet pas de générer d'images. Activez la facturation du projet dans Google AI Studio, puis réessayez.",
      402,
    );
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(detail)) {
    return new AppError("gemini_quota", "Le quota Gemini est atteint. Réessayez plus tard ou vérifiez la facturation.", 429);
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(detail)) {
    return new AppError("gemini_auth", "La clé Gemini est refusée. Vérifiez-la dans les Réglages.", 400);
  }
  if (status === 404) return new AppError("gemini_model", `Le modèle d'images « ${model} » n'existe pas. Changez-le dans les Réglages.`, 400);
  return new AppError("gemini_error", `Gemini a répondu avec une erreur (${status}).`, 502);
}

function mimeOf(image: Buffer): string {
  return image[0] === 0xff && image[1] === 0xd8 ? "image/jpeg" : "image/png";
}
