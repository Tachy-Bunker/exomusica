// Probe mode, the testable part: which things can be probed, what they are called, and how the readout reads. No DOM state in here.
export type ProbeKind = "lore" | "track" | "person" | "point" | "mod";
export type ProbeColors = Record<"lore" | "track" | "person" | "mod", string>;
export const DEFAULT_COLORS: ProbeColors = { lore: "#ff9d3c", track: "#ff4d4d", person: "#4da3ff", mod: "#ff3df0" };
export const KIND_LABEL: Record<ProbeKind, string> = { lore: "Lore", track: "Track", person: "Person", point: "Scan point", mod: "Flag" };

/** What carries a bracket. Everything is found with one selector per colour, so the page never walks its own elements. */
export const SELECTORS: Record<"lore" | "track" | "person" | "mod", string> = {
  track: 'a[href^="/album/"], a[href^="/community-album/"], [data-probe="track"]',
  person: 'a[href^="/u/"], .mention:not([title="Not yet resolved"]), [data-probe="person"]',
  lore: 'a[href^="/wiki/"], a[href^="/study/"], a[href^="/branch/"], [data-probe="lore"], .probe-point',
  mod: '[data-probe="mod"]',
};
/** Links pasted as full addresses of this site (https://this.site/album/x) are the same things as /album/x, so each link rule gets an address-qualified twin. */
export function withOrigin(sel: string, origin: string): string {
  if (!origin) return sel;
  const twins = sel.split(", ").filter((p) => p.startsWith('a[href^="/')).map((p) => p.replace('a[href^="/', `a[href^="${origin}/`));
  return twins.length ? sel + ", " + twins.join(", ") : sel;
}
export const selectorsFor = (origin: string): Record<keyof ProbeColors, string> => ({ lore: withOrigin(SELECTORS.lore, origin), track: withOrigin(SELECTORS.track, origin), person: withOrigin(SELECTORS.person, origin), mod: SELECTORS.mod });
export const allSelector = (origin: string): string => Object.values(selectorsFor(origin)).join(", ");
export const ALL_SELECTOR = allSelector("");

export function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export interface Target { kind: ProbeKind; key: string; label: string; fetch: string | null; note?: string }

/** A site address (path only) -> what it is. Anything that is not a page of ours returns null. */
export function targetOfPath(path: string): Target | null {
  const m = /^\/(album|community-album|study|wiki|branch|u)\/([^/?#]+)/.exec(path);
  if (!m) return null;
  const slug = decodeURIComponent(m[2]);
  switch (m[1]) {
    case "album": return { kind: "track", key: `album:${slug}`, label: slug, fetch: `/api/albums/${encodeURIComponent(slug)}` };
    case "community-album": return { kind: "track", key: `calbum:${slug}`, label: slug, fetch: `/api/community-albums/${encodeURIComponent(slug)}` };
    case "study": return { kind: "lore", key: `study:${slug}`, label: slug, fetch: `/api/studies/${encodeURIComponent(slug)}` };
    case "wiki": return { kind: "lore", key: `wiki:${slug}`, label: slug, fetch: `/api/wiki/${encodeURIComponent(slug)}` };
    case "branch": return { kind: "lore", key: `branch:${slug}`, label: slug, fetch: `/api/branches/${encodeURIComponent(slug)}` };
    default: return { kind: "person", key: `user:${slug}`, label: `@${slug}`, fetch: `/api/users/${encodeURIComponent(slug)}/glance` };
  }
}

export function targetOfMention(text: string): Target | null {
  const m = /^@([\w.-]{1,32})$/.exec(text.trim());
  return m ? { kind: "person", key: `user:${m[1]}`, label: `@${m[1]}`, fetch: `/api/users/${encodeURIComponent(m[1])}/glance` } : null;
}

export function targetOfPoint(words: string, note: string, pagePath: string): Target {
  return { kind: "point", key: `point:${hashStr(pagePath + "|" + words.trim().toLowerCase())}`, label: words.trim(), fetch: null, note };
}

const plain = (md: string, max: number): string => {
  const t = md.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~|{}-]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The lines of the readout for what the server (or the author) said. Missing fields are left out, never shown as "undefined". */
export function readoutOf(t: Target, d: unknown): { title: string; lines: string[] } {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (t.kind === "point" || (t.fetch === null && t.note)) return { title: t.label, lines: t.note ? [t.note] : [] };
  const lines: string[] = [];
  if (t.key.startsWith("album:") || t.key.startsWith("calbum:")) {
    const tracks: { durationSeconds?: number | null }[] = Array.isArray(o.tracks) ? o.tracks : [];
    const total = tracks.reduce((s, x) => s + (x.durationSeconds ?? 0), 0);
    if (o.composer) lines.push(String(o.composer));
    if (tracks.length) lines.push(`${tracks.length} track${tracks.length > 1 ? "s" : ""}${total > 0 ? ` · ${mmss(total)}` : ""}`);
    if (o.branch?.name) lines.push(`in ${o.branch.name}`);
    return { title: o.title ?? t.label, lines };
  }
  if (t.key.startsWith("study:")) {
    if (o.owner?.username) lines.push(`by ${o.owner.username}${o.status === "COMPLETE" ? " · complete" : o.status ? " · in progress" : ""}`);
    if (Array.isArray(o.branches) && o.branches.length) lines.push(`about ${o.branches.map((b: { name: string }) => b.name).join(", ")}`);
    if (o.body) lines.push(plain(String(o.body), 140));
    return { title: o.title ?? t.label, lines };
  }
  if (t.key.startsWith("wiki:")) { if (o.contentMarkdown) lines.push(plain(String(o.contentMarkdown), 160)); return { title: o.title ?? t.label, lines }; }
  if (t.key.startsWith("branch:")) { if (o.description) lines.push(String(o.description).slice(0, 160)); return { title: o.name ?? t.label, lines }; }
  if (t.key.startsWith("user:")) {
    if (o.bio) lines.push(String(o.bio));
    if (o.study?.title) lines.push(`studying: ${o.study.title}`);
    if (o.track?.title) lines.push(`latest track: ${o.track.title}`);
    if (lines.length === 0) lines.push("No public traces yet.");
    return { title: t.label, lines };
  }
  return { title: t.label, lines };
}

/** The next/previous index in a list, wrapping round; -1 (nothing chosen yet) steps to the first or the last. */
export function stepIndex(count: number, current: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : count - 1;
  return (current + dir + count) % count;
}

/** The stylesheet for the brackets, built from the selectors above and the chosen colours. It exists only while the mode is on. */
/** One definition of how a bracket looks: the live page and the admin preview both come from it, so the preview cannot drift. */
export const bracketStyle = (color: string): Record<string, string> => ({ outline: `2px solid ${color}`, outlineOffset: "2px", borderRadius: "3px", boxShadow: `0 0 10px color-mix(in srgb, ${color} 55%, transparent)`, cursor: "crosshair" });
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
export function probeCss(c: ProbeColors, admin: boolean, origin = ""): string {
  const sels = selectorsFor(origin);
  const rule = (kind: keyof ProbeColors) => `body.probe :is(${sels[kind]}){${Object.entries(bracketStyle(`var(--probe-${kind},${c[kind]})`)).map(([k, v]) => `${kebab(k)}:${v}`).join(";")}}`;
  return [rule("lore"), rule("track"), rule("person"), admin ? rule("mod") : "", "body.probe .probe-cur{outline-width:3px!important;outline-style:dashed!important}"].join("\n");
}
