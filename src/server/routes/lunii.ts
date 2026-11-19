import { readFile } from "node:fs/promises";
import type { LuniiView } from "@shared/api";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app";
import { AppError } from "../errors";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// Onglet « Ma Lunii » : histoires installées, ordre sur la molette, suppression restaurable.
export async function luniiRoutes(app: FastifyInstance, { lunii }: AppDeps) {
  app.get("/api/lunii", async (): Promise<LuniiView> => (await lunii.service.stories()) ?? { device: null, stories: [], orphans: [] });

  app.get("/api/lunii/sizes", async () => lunii.service.sizes());

  app.put("/api/lunii/order", async (req) => {
    const { uuids } = z.object({ uuids: z.array(Uuid).min(1) }).parse(req.body);
    await lunii.service.reorder(uuids.map((u) => u.toLowerCase()));
    return (await lunii.service.stories())!;
  });

  app.delete<{ Params: { uuid: string } }>("/api/lunii/stories/:uuid", async (req) => {
    await lunii.service.remove(Uuid.parse(req.params.uuid).toLowerCase());
    return (await lunii.service.stories())!;
  });

  app.get("/api/lunii/trash", async () => lunii.service.trash());

  app.post<{ Params: { id: string } }>("/api/lunii/trash/:id/restore", async (req) => {
    await lunii.service.restore(req.params.id);
    return (await lunii.service.stories())!;
  });

  // Vignette gardée par Lunii QT dans son cache.
  app.get<{ Params: { uuid: string } }>("/api/lunii/thumbnails/:uuid", async (req, reply) => {
    const image = await readFile(lunii.catalog.thumbnailPath(Uuid.parse(req.params.uuid))).catch(() => null);
    if (!image) throw new AppError("not_found", "Vignette introuvable.", 404);
    return reply.type("image/png").header("Cache-Control", "max-age=86400").send(image);
  });
}
