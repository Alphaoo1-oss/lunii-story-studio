import { describe, expect, it } from "vitest";
import { AppError } from "../../src/server/errors";
import { GeminiImages } from "../../src/server/images/gemini";
import { SettingsStore } from "../../src/server/storage/settings";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

async function gemini(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  const settings = new SettingsStore(await tempDir(), { GEMINI_API_KEY: "test-key" });
  return { images: new GeminiImages(settings, fetchImpl), calls };
}

describe("GeminiImages", () => {
  it("demande une image 4:3 au modèle des réglages, avec les références, et décode la réponse", async () => {
    const png = Buffer.from("PNGDATA");
    const { images, calls } = await gemini(() =>
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] }),
    );
    expect(await images.generate({ prompt: "un chat", references: [Buffer.from([0xff, 0xd8, 1])] })).toEqual(png);
    expect(calls[0]!.url).toMatch(/models\/gemini-nano-banana-2\.1:generateContent$/);
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.generationConfig).toEqual({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } });
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
    expect(body.contents[0].parts[1]).toEqual({ text: "un chat" });
  });

  it("traduit le refus de sécurité, le quota et la clé refusée", async () => {
    const refused = await gemini(() => Response.json({ promptFeedback: { blockReason: "SAFETY" } }));
    expect(((await refused.images.generate({ prompt: "x" }).catch((e) => e)) as AppError).code).toBe("gemini_refused");
    const quota = await gemini(() => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }));
    expect(((await quota.images.generate({ prompt: "x" }).catch((e) => e)) as AppError).code).toBe("gemini_quota");
    const free = await gemini(
      () => new Response('{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: x"}}', { status: 429 }),
    );
    expect(((await free.images.generate({ prompt: "x" }).catch((e) => e)) as AppError).code).toBe("gemini_billing");
    const key = await gemini(() => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }));
    expect(((await key.images.generate({ prompt: "x" }).catch((e) => e)) as AppError).code).toBe("gemini_auth");
  });
});
