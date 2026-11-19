import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { VoiceAssignment } from "@shared/model";
import { z } from "zod";
import type { AppDeps } from "../app";

const FamilyUpdate = z.object({
  members: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(40),
      aliases: z.array(z.string().trim().min(1).max(40)).default([]),
      appearance: z.string().max(1000).default(""),
      voice: VoiceAssignment.nullable().default(null),
      livesAtHome: z.boolean().default(false),
    }),
  ),
});

// Fiche famille, commune à toutes les histoires.
export async function familyRoutes(app: FastifyInstance, { family }: AppDeps) {
  app.get("/api/family", async () => family.list());

  app.put("/api/family", async (req) => {
    const { members } = FamilyUpdate.parse(req.body);
    return family.save(members.map((m) => ({ ...m, id: m.id ?? randomUUID() })));
  });
}
