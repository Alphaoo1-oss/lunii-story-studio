import { Service, SettingsUpdate } from "@shared/api";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app";

export async function settingsRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/settings", () => deps.settings.getPublicSettings());

  app.put("/api/settings", (req) => deps.settings.update(SettingsUpdate.parse(req.body)));

  app.post("/api/settings/test/:service", async (req) => {
    const service = Service.parse((req.params as { service: string }).service);
    return deps.testers[service](await deps.settings.getSettings());
  });
}
