/** Truncate a Date to its UTC calendar date, for Message.dayKey. */
export function toDayKey(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isToday(dayKey: Date): boolean {
  return toDayKey(new Date()).getTime() === dayKey.getTime();
}
