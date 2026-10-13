// A one-line bus so any part of the app can say "that was a moment" without importing the audio code (which would loop back through the stores).
export type JingleEvent = "firstScan" | "firstListen" | "firstReply" | "sectionDone";
export const JINGLE_LABEL: Record<JingleEvent, string> = { firstScan: "First scan (Probe mode)", firstListen: "First track heard to the end", firstReply: "First reply in a chat", sectionDone: "First Field Log section completed" };
export const JINGLE_EVENTS = Object.keys(JINGLE_LABEL) as JingleEvent[];
export const fireJingle = (event: JingleEvent): void => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("exo:jingle", { detail: event })); };
