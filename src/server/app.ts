import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { Service } from "@shared/api";
import type { TextGenerator } from "./ai/generator";
import type { AudioService } from "./audio/generate";
import type { PictoService } from "./images/pictos";
import type { LuniiCatalog } from "./lunii/catalog";
import type { LuniiService } from "./lunii/device";
import type { TtsProvider } from "./tts/provider";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { exportRoutes } from "./routes/export";
import { familyRoutes } from "./routes/family";
import { luniiRoutes } from "./routes/lunii";
import { pictoRoutes } from "./routes/pictos";
import { projectRoutes } from "./routes/projects";
import { settingsRoutes } from "./routes/settings";
import { setupRoutes } from "./routes/setup";
import { storyRoutes } from "./routes/story";
import { voiceRoutes } from "./routes/voices";
import type { ServiceTester } from "./services/testers";
import type { FamilyStore } from "./storage/family";
import type { ProjectStore } from "./storage/projects";
import type { SettingsStore } from "./storage/settings";

export type AppDeps = {
  projects: ProjectStore;
  family: FamilyStore;
  settings: SettingsStore;
  testers: Record<Service, ServiceTester>;
  text: TextGenerator;
  voices: { voicebox: TtsProvider; piper: TtsProvider & { install(voiceId: string): Promise<void> }; elevenlabs: TtsProvider };
  audio: AudioService;
  pictos: PictoService;
  lunii: { service: LuniiService; catalog: LuniiCatalog };
  dataDir: string;
  webDir?: string;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message }, ...err.details });
    }
    if (err instanceof ZodError) {
      const detail = err.issues.map((i) => `${i.path.join(".") || "valeur"} : ${i.message}`).join(" ; ");
      return reply.status(400).send({ error: { code: "invalid_request", message: `Données invalides (${detail}).` } });
    }
    app.log.error(err);
    return reply
      .status(500)
      .send({ error: { code: "internal", message: "Une erreur inattendue est survenue. Le travail en cours est conservé." } });
  });

  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

  // Médias des projets, en lecture seule.
  await app.register(fastifyStatic, { root: deps.projects.root, prefix: "/media/", index: false });

  await settingsRoutes(app, deps);
  await setupRoutes(app, deps);
  await projectRoutes(app, deps);
  await familyRoutes(app, deps);
  await storyRoutes(app, deps);
  await voiceRoutes(app, deps);
  await pictoRoutes(app, deps);
  await exportRoutes(app, deps);
  await luniiRoutes(app, deps);

  // Interface buildée (production) ; en développement, Vite la sert lui-même.
  if (deps.webDir && existsSync(deps.webDir)) {
    const webDir = resolve(deps.webDir);
    await app.register(fastifyStatic, { root: webDir, prefix: "/", wildcard: false, decorateReply: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/media/")) {
        return reply.status(404).send({ error: { code: "not_found", message: "Ressource introuvable." } });
      }
      return reply.sendFile("index.html", webDir);
    });
  }

  return app;
}
