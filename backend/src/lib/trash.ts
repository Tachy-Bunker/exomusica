export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export const trashCutoff = (now = Date.now()): Date => new Date(now - TRASH_DAYS * DAY);
export const daysLeft = (deletedAt: Date | number, now = Date.now()): number => Math.max(0, Math.ceil((+deletedAt + TRASH_DAYS * DAY - now) / DAY));
/** A message can come back only while it sits in the trash and the window hasn't run out. */
export const canRestore = (m: { isDeleted: boolean; deletedAt: Date | null }, now = Date.now()): boolean => m.isDeleted && !!m.deletedAt && +m.deletedAt > +trashCutoff(now);
