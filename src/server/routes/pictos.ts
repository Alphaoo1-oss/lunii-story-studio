import type { PictoEvent } from "@shared/api";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { AppError } from "../errors";
import { handPrompts } from "../images/pictos";
import { PICTO_STYLES, styleById } from "../images/styles";
import { projectView } from "./projects";

const GenerateRequest = z.object({
  style: z.string().min(1),
  scope: z.union([z.literal("all"), z.object({ targets: z.array(z.string()).min(1) })]).default("all"),
});

// Routes US5 (contracts/http-api.md, « Pictos »). Les appels Gemini sont payants et ne partent
// que sur action de l'utilisateur.
export async function pictoRoutes(app: FastifyInstance, { projects, pictos }: AppDeps) {
  app.get("/api/styles", async () => PICTO_STYLES.map(({ id, label, description }) => ({ id, label, description })));

  // Génération avec progression en direct (text/event-stream).
  app.post<{ Params: { id: string } }>("/api/projects/:id/pictos/generate", async (req, reply) => {
    const { style, scope } = GenerateRequest.parse(req.body ?? {});
    await projects.get(req.params.id);
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: PictoEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      const summary = await pictos.generate(req.params.id, style, scope, (p) => send({ type: "progress", ...p }));
      send({ type: "done", ...summary });
    } catch (err) {
      send({ type: "error", message: err instanceof AppError ? err.message : "Une erreur inattendue a interrompu la génération. Les pictos déjà produits sont conservés." });
    }
    reply.raw.end();
  });

  // Prompts à copier pour créer les pictos à la main dans l'app Gemini (inclus dans l'abonnement).
  app.get<{ Params: { id: string }; Querystring: { style?: string } }>("/api/projects/:id/pictos/prompts", async (req) => {
    const style = styleById(req.query.style ?? "");
    if (!style) throw new AppError("unknown_style", "Ce style de pictos n'existe pas.");
    return handPrompts(await projects.get(req.params.id), style.prompt);
  });

  // Import d'une image (multipart, champ « file ») à la place du picto ; « ?style= » quand elle
  // a été faite à partir du prompt de l'application.
  app.put<{ Params: { id: string; target: string }; Querystring: { style?: string } }>("/api/projects/:id/pictos/:target", async (req) => {
    const file = await req.file();
    if (!file) throw new AppError("no_file", "Aucune image reçue.");
    return projectView(await pictos.importImage(req.params.id, req.params.target, await file.toBuffer(), req.query.style));
  });

  app.delete<{ Params: { id: string; target: string } }>("/api/projects/:id/pictos/:target", async (req) =>
    projectView(await pictos.reset(req.params.id, req.params.target)),
  );
}
