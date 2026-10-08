export type Section = "soundbay" | "xenolab" | "telemetry" | "log";

/** Which header section a page belongs to, so the header can show where you are. */
const RULES: [Section, RegExp][] = [
  ["soundbay", /^\/(soundbay|listen|branch|album|community-album|playlist|collaborator|my-music)(\/|$)/],
  ["xenolab", /^\/(xenolab|research|studies|study|lab|sample-bank|challenges|rewards|hypotheses|hypothesis)(\/|$)/],
  ["telemetry", /^\/(telemetry|conversations|discussion|topic|cult|contribute|submit|members|u|pms)(\/|$)/],
  ["log", /^\/(log|wiki|news)(\/|$)/],
];

export function sectionOf(pathname: string): Section | null {
  for (const [section, re] of RULES) if (re.test(pathname)) return section;
  return null;
}
