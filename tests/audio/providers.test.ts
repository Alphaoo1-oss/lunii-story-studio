import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/server/errors";
import { SettingsStore } from "../../src/server/storage/settings";
import { ElevenLabsTts } from "../../src/server/tts/elevenlabs";
import { PIPER_VOICES, PiperTts } from "../../src/server/tts/piper";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

async function elevenLabs(handler: (url: string, init: RequestInit) => Response) {
  const settings = new SettingsStore(await tempDir(), { ELEVENLABS_API_KEY: "el-test-key" });
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { tts: new ElevenLabsTts(settings, fakeFetch), calls };
}

describe("ElevenLabsTts", () => {
  it("demande du MP3 44,1 kHz avec le modèle multilingue et la clé", async () => {
    const dir = await tempDir();
    const { tts, calls } = await elevenLabs(() => new Response(Buffer.from("ID3-mp3")));
    await tts.synthesize([{ text: "Bonjour", output: join(dir, "a.wav") }], "voice-1", {});
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128");
    expect((calls[0]!.init.headers as Record<string, string>)["xi-api-key"]).toBe("el-test-key");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ text: "Bonjour", model_id: "eleven_multilingual_v2" });
    expect(await readFile(join(dir, "a.wav"), "utf8")).toBe("ID3-mp3");
  });

  it("liste les voix avec leurs caractéristiques", async () => {
    const { tts } = await elevenLabs(() =>
      Response.json({ voices: [{ voice_id: "v1", name: "Charlotte", labels: { gender: "female", accent: "french" } }] }),
    );
    expect(await tts.listVoices()).toEqual([{ id: "v1", name: "Charlotte", description: "female, french", installed: true }]);
  });

  it("traduit le quota épuisé et la clé refusée", async () => {
    const quota = await elevenLabs(() => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 }));
    const err = await quota.tts.synthesize([{ text: "x", output: "x.wav" }], "v", {}).catch((e) => e);
    expect((err as AppError).code).toBe("elevenlabs_quota");
    const auth = await elevenLabs(() => new Response("invalid api key", { status: 401 }));
    expect(((await auth.tts.listVoices().catch((e) => e)) as AppError).code).toBe("elevenlabs_auth");
  });

  it("demande une clé quand aucune n'est enregistrée", async () => {
    const tts = new ElevenLabsTts(new SettingsStore(await tempDir(), {}));
    expect(((await tts.listVoices().catch((e) => e)) as AppError).code).toBe("elevenlabs_key_missing");
  });
});

describe("PiperTts", () => {
  it("propose des voix françaises, non installées tant que rien n'est téléchargé", async () => {
    const voices = await new PiperTts(await tempDir()).listVoices();
    expect(voices.map((v) => v.id)).toEqual(PIPER_VOICES.map((v) => v.id));
    expect(voices.every((v) => v.installed === false)).toBe(true);
  });

  it("explique comment télécharger une voix absente", async () => {
    const err = await new PiperTts(await tempDir()).synthesize([{ text: "x", output: "x.wav" }], "fr_FR-siwis-medium", {}).catch((e) => e);
    expect((err as AppError).code).toBe("piper_not_installed");
    expect((err as AppError).message).toMatch(/Siwis/);
  });
});
