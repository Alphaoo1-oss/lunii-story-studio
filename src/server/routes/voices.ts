import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AudioEvent } from "@shared/api";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { toLuniiMp3 } from "../audio/ffmpeg";
import { AppError } from "../errors";
import { projectView } from "./projects";

const Source = z.enum(["voicebox", "piper", "elevenlabs"]);
const PreviewRequest = z.object({
  source: Source,
  voiceId: z.string().min(1),
  text: z.string().min(1).max(300).optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
});
const GenerateRequest = z.object({
  scope: z.union([z.literal("all"), z.object({ lineIds: z.array(z.string()).min(1) })]).default("all"),
});

const PREVIEW_TEXT = "Bonjour ! Installe-toi bien, je vais te raconter une belle histoire.";

// Routes US3 (contracts/http-api.md, « Voix »). Les appels ElevenLabs sont payants et ne partent
// que sur action de l'utilisateur.
export async function voiceRoutes(app: FastifyInstance, { projects, voices, audio, dataDir }: AppDeps) {
  app.get<{ Querystring: { source?: string } }>("/api/voices", async (req) => voices[Source.parse(req.query.source)].listVoices());

  app.post("/api/voices/piper/install", async (req) => {
    const { voiceId } = z.object({ voiceId: z.string().min(1) }).parse(req.body);
    await voices.piper.install(voiceId);
    return voices.piper.listVoices();
  });

  // Aperçu d'une voix, mis en cache pour ne pas refaire (ni repayer) le même extrait.
  app.post("/api/voices/preview", async (req, reply) => {
    const { source, voiceId, text = PREVIEW_TEXT, settings } = PreviewRequest.parse(req.body);
    const key = createHash("sha1").update(JSON.stringify([source, voiceId, text, settings])).digest("hex");
    const file = join(resolve(dataDir), "previews", `${key}.mp3`);
    if (!(await exists(file))) {
      const work = await mkdtemp(join(tmpdir(), "lss-preview-"));
      try {
        const raw = join(work, "preview.wav");
        await voices[source].synthesize([{ text, output: raw }], voiceId, settings);
        await mkdir(join(resolve(dataDir), "previews"), { recursive: true });
        await toLuniiMp3(raw, file);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
    return reply.type("audio/mpeg").send(await readFile(file));
  });

  // Génération avec progression en direct (text/event-stream).
  app.post<{ Params: { id: string } }>("/api/projects/:id/audio/generate", async (req, reply) => {
    const { scope } = GenerateRequest.parse(req.body ?? {});
    await projects.get(req.params.id);
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: AudioEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      const summary = await audio.generate(req.params.id, scope, (p) => send({ type: "progress", ...p }));
      send({ type: "done", ...summary });
    } catch (err) {
      send({ type: "error", message: err instanceof AppError ? err.message : "Une erreur inattendue a interrompu la génération. Les audios déjà produits sont conservés." });
    }
    reply.raw.end();
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/audio/assemble", async (req) =>
    projectView(await audio.assemble(req.params.id)),
  );
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
