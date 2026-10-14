/** Counts requests in flight so the door knows when a page has finished loading. */
let n = 0;
export const loadBegin = (): void => { n++; };
export const loadEnd = (): void => { n = Math.max(0, n - 1); };
export const inflight = (): number => n;
