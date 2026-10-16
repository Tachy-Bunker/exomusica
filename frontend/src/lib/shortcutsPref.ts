// The letter shortcuts on desktop (C, B, X, M, G, E). A visitor who types letters into other apps can turn them off.
// Read once and kept in memory, so a keypress never touches storage.
const KEY = "exomusica_letter_shortcuts";
let on: boolean | null = null;

export function shortcutsOn(): boolean {
  if (on === null) {
    try { on = localStorage.getItem(KEY) !== "off"; } catch { on = true; }
  }
  return on;
}

export function setShortcutsOn(value: boolean): void {
  on = value;
  try { localStorage.setItem(KEY, value ? "on" : "off"); } catch { /* storage blocked: the choice lasts for this visit */ }
}
