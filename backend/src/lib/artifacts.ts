// Twelve Artifacts: the owner's slots joined with the reveal rule. Database side; the rules are in artifactsCore.ts.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getSiteStats } from "./siteStats.js";
import { getMilestones } from "./milestones.js";
import { ARTIFACT_COUNT, artifactThresholds, motifFromSeed, TEMP_ARTIFACTS, type ArtifactBody } from "./artifactsCore.js";

export interface SlotState {
  slot: number; threshold: number; revealed: boolean;
  kind: string | null; key: string | null; title: string | null; text: string | null; imageUrl: string | null; notes: number[] | null;
  /** What a visitor sees: the owner's text, or the temporary one where the owner has not written it. */
  shownTitle: string; shownText: string; shownNotes: number[]; temp: boolean;
}
export interface ArtifactsState { open: boolean; scans: number; target: number; slots: SlotState[] }

const TTL = 60_000;
let cached: { at: number; p: Promise<ArtifactsState> } | null = null;
export function forgetArtifacts(): void { cached = null; }

async function compute(): Promise<ArtifactsState> {
  const [m, stats, rows] = await Promise.all([
    getMilestones().then((ms) => ms.find((x) => x.key === "m-artifacts")),
    getSiteStats(),
    prisma.artifactSlot.findMany(),
  ]);
  const open = !!m?.enabled;
  const target = m?.target ?? 10000;
  const scans = stats.totals.SCANS;
  const thresholds = artifactThresholds(target);
  const by = new Map(rows.map((r) => [r.slot, r]));
  const slots: SlotState[] = [];
  for (let k = 1; k <= ARTIFACT_COUNT; k++) {
    const row = by.get(k) ?? null;
    const revealed = open && scans >= thresholds[k - 1];
    // Remember when each slot was first revealed; forget it if the target was raised past where we stand (as milestones do). Writes only on change.
    if (revealed && !row?.revealedAt) await prisma.artifactSlot.upsert({ where: { slot: k }, create: { slot: k, revealedAt: new Date() }, update: { revealedAt: new Date() } }).catch(() => undefined);
    else if (!revealed && row?.revealedAt) await prisma.artifactSlot.update({ where: { slot: k }, data: { revealedAt: null } }).catch(() => undefined);
    const tmp = TEMP_ARTIFACTS[k - 1];
    const ownNotes = Array.isArray(row?.notes) && row.notes.length === 4 ? (row.notes as number[]) : null;
    slots.push({
      slot: k, threshold: thresholds[k - 1], revealed,
      kind: row?.kind ?? null, key: row?.key ?? null, title: row?.title ?? null, text: row?.text ?? null, imageUrl: row?.imageUrl ?? null, notes: ownNotes,
      shownTitle: row?.title ?? tmp.title, shownText: row?.text ?? tmp.text,
      shownNotes: ownNotes ?? motifFromSeed(row?.key ?? `slot:${k}`),
      temp: !row?.title || !row?.text,
    });
  }
  return { open, scans, target, slots };
}

/** Computed once a minute however many readers ask. */
export function getArtifacts(): Promise<ArtifactsState> {
  if (!cached || Date.now() - cached.at > TTL) {
    const p = compute();
    cached = { at: Date.now(), p };
    p.catch(() => { if (cached?.p === p) cached = null; });
  }
  return cached.p;
}

/** Visitors see a slot's content only once it is revealed: an unrevealed slot says only when it will open. */
export const publicArtifacts = (s: ArtifactsState) => ({
  open: s.open, scans: s.scans, target: s.target,
  slots: s.slots.map((x) => (x.revealed
    ? { slot: x.slot, threshold: x.threshold, revealed: true, title: x.shownTitle, text: x.shownText, imageUrl: x.imageUrl, notes: x.shownNotes }
    : { slot: x.slot, threshold: x.threshold, revealed: false })),
});

/** Saves the owner's text, sound and key for one slot. The picture is kept; it has its own upload. */
export async function saveSlot(slot: number, body: ArtifactBody): Promise<void> {
  const data = { kind: body.kind, key: body.key, title: body.title, text: body.text, notes: body.notes === null ? Prisma.DbNull : body.notes };
  await prisma.artifactSlot.upsert({ where: { slot }, create: { slot, ...data }, update: data });
  forgetArtifacts();
}

export async function setSlotImage(slot: number, imageUrl: string | null): Promise<void> {
  await prisma.artifactSlot.upsert({ where: { slot }, create: { slot, imageUrl }, update: { imageUrl } });
  forgetArtifacts();
}

