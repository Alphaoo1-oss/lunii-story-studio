import { basename } from "node:path";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app";
import { notFound } from "../errors";
import { checkProject } from "../pack/check";
import { exportProject } from "../pack/export";

type ProjectParams = { id: string };

export async function exportRoutes(app: FastifyInstance, { projects }: AppDeps) {
  app.get<{ Params: ProjectParams }>("/api/projects/:id/export/check", async (req) =>
    checkProject(projects, await projects.get(req.params.id)),
  );

  app.post<{ Params: ProjectParams }>("/api/projects/:id/export", (req) => exportProject(projects, req.params.id));

  app.get<{ Params: ProjectParams & { file: string } }>("/api/projects/:id/exports/:file", async (req, reply) => {
    const project = await projects.get(req.params.id);
    const record = project.exports.find((e) => basename(e.file) === req.params.file);
    if (!record) throw notFound("Export");
    return reply
      .header("Content-Disposition", `attachment; filename="${basename(record.file)}"`)
      .type("application/zip")
      .sendFile(record.file, projects.dir(project.id));
  });
}
