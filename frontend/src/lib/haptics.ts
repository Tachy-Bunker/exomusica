// Small taps on phones that can vibrate. Off for people who asked for less motion, and off if the person turned it off here.
const KEY = "exomusica_haptics";
export type Buzz = "tick" | "double" | "snap";
export const PATTERNS: Record<Buzz, number[]> = { tick: [8], double: [8, 70, 8], snap: [14] };

export function hapticsOn(): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return localStorage.getItem(KEY) !== "0";
  } catch { return false; }
}
export function setHaptics(on: boolean): void { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage blocked */ } }
export function buzz(kind: Buzz): void { if (hapticsOn()) { try { navigator.vibrate(PATTERNS[kind]); } catch { /* not allowed */ } } }
/** Does this device have a buzz to turn on or off? (So the switch is only shown where it does something.) */
export const canBuzz = (): boolean => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
