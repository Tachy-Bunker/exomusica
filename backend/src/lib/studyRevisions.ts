import type { PrismaClient } from "@prisma/client";
import { decideRevisionAction, idsToPrune, type IncomingRevision } from "./studyRevisionRules.js";

/**
 * Records a snapshot of a study, folding rapid repeat saves together and
 * pruning old unlabelled snapshots past the cap. Callers treat this as
 * best-effort: a failure here must never block saving the study itself.
 */
export async function recordStudyRevision(db: PrismaClient, studyId: number, incoming: IncomingRevision): Promise<void> {
  const last = await db.studyRevision.findFirst({ where: { studyId }, orderBy: { createdAt: "desc" } });
  const action = decideRevisionAction(last, incoming, new Date());
  if (action === "skip") return;
  if (action === "update-last" && last) {
    await db.studyRevision.update({ where: { id: last.id }, data: { title: incoming.title, body: incoming.body, createdAt: new Date() } });
    return;
  }
  await db.studyRevision.create({
    data: { studyId, authorId: incoming.authorId, title: incoming.title, body: incoming.body, label: incoming.label ?? null },
  });
  const all = await db.studyRevision.findMany({ where: { studyId }, orderBy: { createdAt: "desc" }, select: { id: true, label: true } });
  const stale = idsToPrune(all);
  if (stale.length) await db.studyRevision.deleteMany({ where: { id: { in: stale } } });
}
