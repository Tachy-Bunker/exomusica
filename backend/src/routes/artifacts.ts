import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { saveSiteImage } from "../lib/storage.js";
import { cleanArtifactBody, ARTIFACT_COUNT } from "../lib/artifactsCore.js";
import { forgetArtifacts, getArtifacts, publicArtifacts, saveSlot, setSlotImage, type SlotState } from "../lib/artifacts.js";

const slotNumber = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= ARTIFACT_COUNT ? n : null;
};
const adminSlot = (s: SlotState) => ({
  slot: s.slot, threshold: s.threshold, revealed: s.revealed, kind: s.kind, key: s.key, title: s.title, text: s.text, imageUrl: s.imageUrl,
  notes: s.notes, shownTitle: s.shownTitle, shownText: s.shownText, temp: s.temp,
});
const slotOr404 = async (slot: number) => (await getArtifacts()).slots.find((x) => x.slot === slot) ?? null;

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  // Public: the twelve slots. Only revealed slots carry their content.
  app.get("/api/artifacts", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=60");
    return publicArtifacts(await getArtifacts());
  });

  app.get("/api/admin/artifacts", { preHandler: requireAdmin }, async () => (await getArtifacts()).slots.map(adminSlot));

  // Replaces the slot's text, sound and key. The picture is kept; it has its own upload below.
  app.put<{ Params: { slot: string }; Body: Record<string, unknown> }>("/api/admin/artifacts/:slot", { preHandler: requireAdmin }, async (req, reply) => {
    const slot = slotNumber(req.params.slot);
    if (!slot) return reply.code(404).send({ error: "no such artifact slot" });
    const cleaned = cleanArtifactBody(req.body ?? {});
    if (!cleaned.ok) return reply.code(400).send({ error: cleaned.error });
    await saveSlot(slot, cleaned.value);
    return adminSlot((await slotOr404(slot))!);
  });

  app.post<{ Params: { slot: string } }>("/api/admin/artifacts/:slot/image", { preHandler: requireAdmin }, async (req, reply) => {
    const slot = slotNumber(req.params.slot);
    if (!slot) return reply.code(404).send({ error: "no such artifact slot" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    const buffer = await file.toBuffer();
    try {
      const { url } = await saveSiteImage(file.filename, file.mimetype, buffer, "artifacts");
      await setSlotImage(slot, url);
      return adminSlot((await slotOr404(slot))!);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });

  app.delete<{ Params: { slot: string } }>("/api/admin/artifacts/:slot/image", { preHandler: requireAdmin }, async (req, reply) => {
    const slot = slotNumber(req.params.slot);
    if (!slot) return reply.code(404).send({ error: "no such artifact slot" });
    await setSlotImage(slot, null);
    forgetArtifacts();
    return adminSlot((await slotOr404(slot))!);
  });
}
