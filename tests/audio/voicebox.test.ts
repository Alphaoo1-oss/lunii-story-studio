import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/server/errors";
import { VoiceboxTts } from "../../src/server/tts/voicebox";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();
const BASE = "http://voicebox.test";

// Faux Voicebox : répond selon le chemin et garde les requêtes reçues.
function fakeVoicebox(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const path = url.slice(BASE.length);
    calls.push({ path, init });
    const route = Object.entries(routes).find(([pattern]) => new RegExp(`^${pattern}$`).test(path));
    if (!route) return new Response("not found", { status: 404 });
    return route[1](init);
  }) as unknown as typeof fetch;
  return { tts: new VoiceboxTts(BASE, fetchImpl), calls };
}

const sse = (...events: object[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));

describe("VoiceboxTts", () => {
  it("liste les profils de voix avec leur type", async () => {
    const { tts } = fakeVoicebox({
      "/profiles": () =>
        Response.json([
          { id: "p1", name: "Mamie Rose", description: "douce et chaleureuse", language: "fr", voice_type: "designed" },
          { id: "p2", name: "Papa", description: null, language: "fr", voice_type: "cloned" },
        ]),
    });
    expect(await tts.listVoices()).toEqual([
      { id: "p1", name: "Mamie Rose", description: "douce et chaleureuse, voix créée par description", installed: true },
      { id: "p2", name: "Papa", description: "voix clonée", installed: true },
    ]);
  });

  it("génère en français, attend la fin puis récupère l'audio", async () => {
    const dir = await tempDir();
    const { tts, calls } = fakeVoicebox({
      "/history.*": () => Response.json({ items: [], total: 0 }),
      "/generate": () => Response.json({ id: "g1", status: "generating" }),
      "/generate/g1/status": () => sse({ id: "g1", status: "generating" }, { id: "g1", status: "completed", duration: 1.2 }),
      "/audio/g1": () => new Response(Buffer.from("RIFF-wav")),
    });
    await tts.synthesize([{ text: "Bienvenue, mes petits trésors !", output: join(dir, "a.wav") }], "p1", { seed: 7 });
    expect(JSON.parse(calls.find((c) => c.path === "/generate")!.init.body as string)).toEqual({
      profile_id: "p1",
      text: "Bienvenue, mes petits trésors !",
      language: "fr",
      normalize: true,
      seed: 7,
    });
    expect(calls.map((c) => c.path)).toEqual([
      "/history?profile_id=p1&limit=100&offset=0",
      "/generate",
      "/generate/g1/status",
      "/audio/g1",
    ]);
    expect(await readFile(join(dir, "a.wav"), "utf8")).toBe("RIFF-wav");
  });

  it("explique quand Voicebox n'est pas lancé", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await new VoiceboxTts(BASE, offline).listVoices().catch((e) => e);
    expect((err as AppError).code).toBe("voicebox_offline");
    expect((err as AppError).message).toMatch(/Ouvrez l'application Voicebox/);
  });

  it("remonte l'échec d'une génération et un profil supprimé", async () => {
    const failed = fakeVoicebox({
      "/history.*": () => Response.json({ items: [], total: 0 }),
      "/generate": () => Response.json({ id: "g2" }),
      "/generate/g2/status": () => sse({ id: "g2", status: "failed", error: "CUDA out of memory" }),
    });
    const err = await failed.tts.synthesize([{ text: "x", output: "x.wav" }], "p1", {}).catch((e) => e);
    expect((err as AppError).message).toMatch(/CUDA out of memory/);

    const gone = fakeVoicebox({ "/history.*": () => Response.json({ items: [], total: 0 }), "/generate": () => new Response('{"detail":"Profile not found"}', { status: 404 }) });
    expect(((await gone.tts.synthesize([{ text: "x", output: "x.wav" }], "p9", {}).catch((e) => e)) as AppError).code).toBe(
      "voicebox_profile",
    );
  });

  it("reprend un texte déjà généré par ce profil, sauf si une nouvelle prise est demandée", async () => {
    const dir = await tempDir();
    const { tts, calls } = fakeVoicebox({
      "/history.*": () =>
        Response.json({
          items: [
            { id: "new", text: "Bonsoir !", status: "completed", language: "fr", created_at: "2026-10-28T13:00:00" },
            { id: "old", text: "Bonsoir !", status: "completed", language: "fr", created_at: "2026-10-28T12:00:00" },
            { id: "busy", text: "En cours", status: "generating", language: "fr", created_at: "2026-10-28T13:01:00" },
          ],
          total: 3,
        }),
      "/audio/new": () => new Response(Buffer.from("RIFF-cache")),
      "/generate": () => Response.json({ id: "g3" }),
      "/generate/g3/status": () => sse({ id: "g3", status: "completed" }),
      "/audio/g3": () => new Response(Buffer.from("RIFF-neuf")),
    });
    await tts.synthesize([{ text: "Bonsoir !", output: join(dir, "a.wav") }], "p1", {});
    expect(await readFile(join(dir, "a.wav"), "utf8")).toBe("RIFF-cache");
    expect(calls.some((c) => c.path === "/generate")).toBe(false);

    await tts.synthesize([{ text: "Bonsoir !", output: join(dir, "b.wav"), fresh: true }], "p1", {});
    expect(await readFile(join(dir, "b.wav"), "utf8")).toBe("RIFF-neuf");
  });
});
