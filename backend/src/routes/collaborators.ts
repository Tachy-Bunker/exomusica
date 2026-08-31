import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function collaboratorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/collaborators", async () => {
    return prisma.collaborator.findMany({
      select: { id: true, name: true, role: true, bio: true, pictureUrl: true, links: true },
      orderBy: { name: "asc" },
    });
  });
}
