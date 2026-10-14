// "Scan the core": a short guided look at what Exomusica is. This file is the testable part: the stops, the order, and what is remembered.
export interface Stop { id: string; sel: string; title: string; text: string }
/** In page order (top to bottom) so the tour only ever scrolls one way. Rewrite the words freely; a stop whose element is not on the page is skipped. */
export const STOPS: Stop[] = [
  { id: "hero", sel: '[data-tour="hero"]', title: "The core", text: "Exomusica is a collective working on sound that doesn't follow this world's usual rules: tracks, research and conversation in one place." },
  { id: "stats", sel: '[data-tour="stats"]', title: "The research", text: "Studies are the research side (XenoLab): papers, experiments and open questions anyone can read." },
  { id: "branches", sel: '[data-tour="branches"]', title: "Branches", text: "Branches are territories of sound. Each has its own albums, its own chat and its own people. Open one to step inside." },
  { id: "now", sel: '[data-tour="now"]', title: "Right now", text: "The live edge: conversations, new members, new work. This part changes by the hour." },
  { id: "join", sel: '[data-tour="join"]', title: "Come aboard", text: "That's the core. Joining lets you chat, publish studies and share music. What you scan is kept in your Field Log." },
];
export const stopKey = (id: string): string => `tour:${id}`;

/** The stops that exist on this page right now, in order. */
export function presentStops(exists: (sel: string) => boolean, stops: Stop[] = STOPS): Stop[] { return stops.filter((s) => exists(s.sel)); }
/** The step after `i`, or -1 when that was the last. */
export const nextStep = (i: number, count: number): number => (i + 1 < count ? i + 1 : -1);

export type TourState = "" | "done" | "skipped";
const KEY = "exomusica_tour";
export const readTour = (): TourState => { try { const v = localStorage.getItem(KEY); return v === "done" || v === "skipped" ? v : ""; } catch { return ""; } };
export const writeTour = (v: TourState): void => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
/** The invitation shows to visitors who have never answered it. Members are not nagged (they can replay it from their account). */
export const shouldInvite = (state: TourState, loggedIn: boolean, classic: boolean): boolean => state === "" && !loggedIn && !classic;
