import { AppError } from "../../src/server/errors";
import type { SynthesisItem, TtsProvider, VoiceInfo } from "../../src/server/tts/provider";
import { tone } from "./media";

// Doublure de voix de synthèse : produit une courte tonalité par texte et garde les appels.
export class FakeTts implements TtsProvider {
  readonly calls: { text: string; voiceId: string }[] = [];

  constructor(private readonly options: { failAt?: number } = {}) {}

  readonly installed: string[] = [];

  async install(voiceId: string): Promise<void> {
    this.installed.push(voiceId);
  }

  async listVoices(): Promise<VoiceInfo[]> {
    return [{ id: "fake-voice", name: "Voix factice", installed: true }];
  }

  async synthesize(items: SynthesisItem[], voiceId: string): Promise<void> {
    for (const item of items) {
      if (this.options.failAt !== undefined && this.calls.length === this.options.failAt) {
        throw new AppError("tts_quota", "Le quota de la voix de synthèse est épuisé.", 429);
      }
      this.calls.push({ text: item.text, voiceId });
      await tone(item.output, { seconds: 0.3, frequency: 300 + 50 * this.calls.length });
    }
  }
}
