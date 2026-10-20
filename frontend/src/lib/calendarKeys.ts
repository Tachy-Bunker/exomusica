// Keys on the calendar page (fix419, idea 8). Pure: which arrow moves how many days, and whether a key belongs to a field that takes it.
// The page does the moving; this only says what a key means.

/** Days moved by each arrow: left and right by one day, up and down by a week. */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** The days an arrow key moves the picked day by, or null when the key is not an arrow. */
export function dayStepOf(key: string): number | null {
  return Object.prototype.hasOwnProperty.call(STEPS, key) ? STEPS[key] : null;
}

/** A key pressed in a field that takes text or a choice is that field's, not the page's. */
export function isTyping(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes((el.tagName ?? "").toUpperCase());
}
