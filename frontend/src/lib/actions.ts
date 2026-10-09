// The action registry: everything the Master Terminal (and Ctrl+K) can do is declared here once. Each action says what it is called, what it does and who may run it.
// The runner is pure (it gets what it needs through `ctx`), so it is tested without a browser.
import { fuzzyScore, freqOf, showFreq, searchEntities, nearestFreq, peekOf, TYPE_LABEL, ENTITY_TYPES, type Entity, type EntityType, type Peek } from "./atlas";
import { operator } from "./operator";

export type Out =
  | { kind: "text"; text: string }
  | { kind: "error"; text: string }
  | { kind: "peek"; peek: Peek; note?: string }
  | { kind: "link"; to: string; text: string }
  | { kind: "clear" };

export interface ActionCtx {
  go: (to: string) => void;
  back: () => void;
  user: { username: string; isAdmin: boolean } | null;
  index: Entity[];
  focus: Entity | null;
  pocket: { items: { key: string; type: EntityType; id: string; title: string }[]; add: (e: Pick<Entity, "type" | "id" | "title">) => void; remove: (key: string) => void; clear: () => void };
  pathname: string;
  rand: () => number;
  lens?: { on: boolean; set: (v: boolean) => void };
}

export interface Action {
  id: string;
  verbs: string[];
  summary: string;
  usage: string;
  needs?: "auth" | "admin";
  run: (rest: string, ctx: ActionCtx) => Out[] | void;
}

export const PLACES: { names: string[]; to: string; label: string }[] = [
  { names: ["home", "explore", "exomusica"], to: "/", label: "Home" },
  { names: ["soundbay", "bay"], to: "/soundbay", label: "Soundbay" },
  { names: ["xenolab", "lab"], to: "/xenolab", label: "XenoLab" },
  { names: ["studies"], to: "/xenolab?tab=studies", label: "Studies" },
  { names: ["contribute"], to: "/xenolab?tab=contribute", label: "Contribute" },
  { names: ["resources", "samples"], to: "/xenolab?tab=resources", label: "Resources" },
  { names: ["analyze", "analyzer"], to: "/xenolab?tab=analyze", label: "Analyze" },
  { names: ["effects", "voicelab"], to: "/xenolab?tab=effects", label: "Effects" },
  { names: ["calls", "open-calls"], to: "/xenolab?tab=open", label: "Open calls" },
  { names: ["telemetry"], to: "/telemetry", label: "Telemetry" },
  { names: ["members"], to: "/members", label: "Members" },
  { names: ["log"], to: "/wiki", label: "Log" },
  { names: ["wiki"], to: "/wiki", label: "Wiki" },
  { names: ["news"], to: "/news", label: "News" },
  { names: ["topics", "discussion", "forum"], to: "/discussion", label: "Topics" },
  { names: ["messages", "pms"], to: "/pms", label: "Messages" },
  { names: ["hypotheses", "basket", "hyp"], to: "/hypotheses", label: "Hypotheses" },
  { names: ["draw", "draw one"], to: "/hypotheses/draw", label: "Draw a hypothesis" },
  { names: ["letters", "post", "mail"], to: "/letters", label: "Letters" },
  { names: ["rewards", "points"], to: "/rewards", label: "Rewards" },
  { names: ["account", "settings"], to: "/account", label: "Account" },
];

export const ADMIN_PAGES = ["join-requests", "branches", "channels", "users", "albums", "wiki", "all-tracks", "studies", "resources", "featured", "rewards", "submissions", "contributor-points", "blog", "emoji", "email-templates", "audit-log", "about", "fonts", "fx-settings", "newsletter", "discord-import", "storage", "discord-bridge", "collaborators", "embeds", "icon-library", "forum-map", "notifications", "guide-assets", "community-spotlight"];

const placeFor = (name: string) => PLACES.find((p) => p.names.includes(name.toLowerCase()));
const peeks = (rows: Entity[], note?: (e: Entity) => string | undefined): Out[] => rows.map((e) => ({ kind: "peek", peek: peekOf(e), note: note?.(e) }));
const asType = (w: string): EntityType | undefined => (ENTITY_TYPES as readonly string[]).includes(w.toLowerCase()) ? (w.toLowerCase() as EntityType) : undefined;

/** Goes straight to the one clear match; otherwise lists the candidates to click. */
function goOrList(q: string, ctx: ActionCtx): Out[] | void {
  const place = placeFor(q);
  if (place) { ctx.go(place.to); return [{ kind: "text", text: `→ ${place.label}` }]; }
  const found = searchEntities(ctx.index, q, 6);
  if (found.length === 0) return [{ kind: "error", text: operator.nothing(q) }];
  const top = fuzzyScore(q, found[0].title);
  const rival = found[1] ? fuzzyScore(q, found[1].title) : -1;
  if (found.length === 1 || (top >= 80 && rival < 80)) { ctx.go(peekOf(found[0]).href); return [{ kind: "text", text: `→ ${found[0].title}` }]; }
  return [{ kind: "text", text: `${found.length} close matches:` }, ...peeks(found)];
}

export const ACTIONS: Action[] = [
  { id: "go", verbs: ["go", "goto", "open", "cd"], summary: "Jump to a place or a thing by name.", usage: "go <name>   e.g. go beating tones, go soundbay", run: (rest, ctx) => (rest ? goOrList(rest, ctx) : [{ kind: "text", text: "Go where? Give a name, e.g. go soundbay." }]) },
  {
    id: "find", verbs: ["find", "search", "ls"], summary: "List what matches, without going anywhere.", usage: "find <words>   (or: find study <words>)",
    run: (rest, ctx) => {
      const [first, ...tail] = rest.split(/\s+/);
      const type = first ? asType(first) : undefined;
      const q = type ? tail.join(" ") : rest;
      const found = type && !q ? ctx.index.filter((e) => e.type === type).slice(0, 8) : searchEntities(ctx.index, q, 8, type);
      return found.length ? peeks(found) : [{ kind: "error", text: operator.nothing(q || rest) }];
    },
  },
  {
    id: "tune", verbs: ["tune", "freq"], summary: "Tune to a frequency; every thing has one.", usage: "tune 14.250",
    run: (rest, ctx) => {
      const f = Number(rest.replace(",", "."));
      if (!rest || !Number.isFinite(f)) return [{ kind: "text", text: "Give a frequency, e.g. tune 14.250 (each kind of thing lives in its own band)." }];
      const near = nearestFreq(ctx.index, f, 5);
      if (!near.length) return [{ kind: "error", text: operator.quiet }];
      if (Math.abs(near[0].f - f) <= 0.0005) { ctx.go(peekOf(near[0].e).href); return [{ kind: "text", text: `${operator.tuned(showFreq(near[0].f))} ${near[0].e.title}` }]; }
      return [{ kind: "text", text: `Nothing exactly there. Nearest to ${showFreq(f)}:` }, ...peeks(near.map((n) => n.e), (e) => showFreq(freqOf(e.type, e.id)))];
    },
  },
  {
    id: "random", verbs: ["random", "surprise", "dx"], summary: "Go somewhere you did not pick.", usage: "random [branch|study|album|wiki|news|topic|resource]",
    run: (rest, ctx) => {
      const type = rest ? asType(rest) : undefined;
      const pool = type ? ctx.index.filter((e) => e.type === type) : ctx.index.filter((e) => e.type !== "call");
      if (!pool.length) return [{ kind: "error", text: operator.quiet }];
      const e = pool[Math.floor(ctx.rand() * pool.length)];
      ctx.go(peekOf(e).href);
      return [{ kind: "text", text: `→ ${TYPE_LABEL[e.type]}: ${e.title}` }];
    },
  },
  { id: "back", verbs: ["back", "b"], summary: "Step back.", usage: "back", run: (_r, ctx) => { ctx.back(); } },
  {
    id: "where", verbs: ["where", "pwd"], summary: "Where you are, and its frequency.", usage: "where",
    run: (_r, ctx) => (ctx.focus ? [{ kind: "text", text: `${showFreq(freqOf(ctx.focus.type, ctx.focus.id))}  ${TYPE_LABEL[ctx.focus.type]}: ${ctx.focus.title}` }] : [{ kind: "text", text: ctx.pathname }]),
  },
  {
    id: "take", verbs: ["take", "grab", "pick"], summary: "Put this page, or something you name, in your pocket.", usage: "take   |   take <name>",
    run: (rest, ctx) => {
      const e = rest ? searchEntities(ctx.index, rest, 1)[0] : ctx.focus;
      if (!e) return [{ kind: "error", text: rest ? operator.nothing(rest) : "Nothing here to pick up." }];
      ctx.pocket.add(e);
      return [{ kind: "text", text: `In your pocket: ${e.title}` }];
    },
  },
  {
    id: "pocket", verbs: ["pocket", "inv", "i"], summary: "Show what you are carrying.", usage: "pocket",
    run: (_r, ctx) => (ctx.pocket.items.length ? peeks(ctx.pocket.items.map((p) => ({ type: p.type, id: p.id, title: p.title }))) : [{ kind: "text", text: operator.pocketEmpty }]),
  },
  {
    id: "drop", verbs: ["drop", "leave"], summary: "Take something out of the pocket (a number from `pocket`, a name, or all).", usage: "drop <name>   |   drop all",
    run: (rest, ctx) => {
      if (rest.toLowerCase() === "all") { ctx.pocket.clear(); return [{ kind: "text", text: "Pocket emptied." }]; }
      const n = Number(rest);
      const item = Number.isInteger(n) && n >= 1 ? ctx.pocket.items[n - 1] : ctx.pocket.items.find((p) => fuzzyScore(rest, p.title) >= 40);
      if (!item) return [{ kind: "error", text: rest ? operator.nothing(rest) : "Drop what? Give a name or number." }];
      ctx.pocket.remove(item.key);
      return [{ kind: "text", text: `Dropped: ${item.title}` }];
    },
  },
  { id: "new", verbs: ["new", "start"], summary: "Start something.", usage: "new study", run: (rest, ctx) => { if (/^stud/i.test(rest)) { ctx.go("/xenolab?tab=studies"); return [{ kind: "text", text: "→ Studies (the start form is at the bottom)" }]; } return [{ kind: "text", text: "Usage: new study" }]; } },
  { id: "who", verbs: ["@", "who", "u"], summary: "Open a member's page.", usage: "@name", run: (rest, ctx) => { const n = rest.replace(/^@/, "").trim(); if (!n) return [{ kind: "text", text: "Usage: @name" }]; ctx.go(`/u/${encodeURIComponent(n)}`); return [{ kind: "text", text: `→ @${n}` }]; } },
  { id: "pm", verbs: ["pm", "dm", "msg"], summary: "Write to a member.", usage: "pm <name>", needs: "auth", run: (rest, ctx) => { const n = rest.replace(/^@/, "").trim(); ctx.go(n ? `/pms/${encodeURIComponent(n)}` : "/pms"); return [{ kind: "text", text: n ? `→ messages with ${n}` : "→ Messages" }]; } },
  {
    id: "admin", verbs: ["admin"], summary: "Jump to an admin page.", usage: "admin <page>   e.g. admin feat", needs: "admin",
    run: (rest, ctx) => {
      if (!rest) return [{ kind: "text", text: `Pages: ${ADMIN_PAGES.join(", ")}` }];
      const best = ADMIN_PAGES.map((p) => ({ p, s: fuzzyScore(rest, p.replace(/-/g, " ")) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
      if (!best) return [{ kind: "error", text: operator.nothing(rest) }];
      ctx.go(`/admin/${best.p}`);
      return [{ kind: "text", text: `→ admin/${best.p}` }];
    },
  },
  {
    id: "lens", verbs: ["lens", "trace"], summary: "Turn the Trace lens on or off (shows marks left on a place).", usage: "lens [on|off]",
    run: (rest, ctx) => {
      if (!ctx.lens) return [{ kind: "error", text: operator.unknown("lens") }];
      const v = rest.trim().toLowerCase();
      const next = v === "on" ? true : v === "off" ? false : !ctx.lens.on;
      ctx.lens.set(next);
      return [{ kind: "text", text: next ? "Trace lens on. Marks left on a place now show." : "Trace lens off." }];
    },
  },
  {
    id: "mark", verbs: ["mark"], summary: "Leave a drawn mark on the place you are at.", usage: "mark", needs: "auth",
    run: (_r, ctx) => {
      if (!ctx.focus) return [{ kind: "error", text: "Marks are left on a specific thing: go to a study, a branch, a page first." }];
      ctx.go(`/letters?at=${encodeURIComponent(`${ctx.focus.type}:${ctx.focus.id}`)}`);
      return [{ kind: "text", text: "→ the sheet" }];
    },
  },
  { id: "clear", verbs: ["clear", "cls"], summary: "Clear the screen.", usage: "clear", run: () => [{ kind: "clear" }] },
];

const byVerb = new Map<string, Action>();
for (const a of ACTIONS) for (const v of a.verbs) byVerb.set(v, a);
export const allVerbs = (): string[] => [...byVerb.keys()];

export function helpText(rest: string, ctx: Pick<ActionCtx, "user">): Out[] {
  const can = (a: Action) => !(a.needs === "admin" && !ctx.user?.isAdmin) && !(a.needs === "auth" && !ctx.user);
  if (rest) {
    const a = byVerb.get(rest.toLowerCase());
    return a ? [{ kind: "text", text: `${a.usage}\n${a.summary}` }] : [{ kind: "error", text: operator.unknown(rest) }];
  }
  return [
    { kind: "text", text: "Just type a name to go there. Commands:" },
    ...ACTIONS.filter(can).map((a): Out => ({ kind: "text", text: `${a.verbs[0].padEnd(8)} ${a.summary}` })),
    { kind: "text", text: "Places: " + PLACES.map((p) => p.names[0]).join(", ") },
  ];
}

/** Runs one line of input. Returns what to print. */
export function runCommand(input: string, parsed: { verb: string; rest: string }, ctx: ActionCtx): Out[] {
  const { verb, rest } = parsed;
  if (!verb) return [];
  if (verb === "?" || verb === "help" || verb === "h") return helpText(rest, ctx);
  const action = byVerb.get(verb);
  if (action) {
    if (action.needs === "admin" && !ctx.user?.isAdmin) return [{ kind: "error", text: operator.needAdmin }];
    if (action.needs === "auth" && !ctx.user) return [{ kind: "error", text: operator.needLogin }];
    return action.run(rest, ctx) ?? [];
  }
  // Not a command: treat the whole line as a name to go to ("beating tones", "soundbay").
  return goOrList(input.trim(), ctx) ?? [];
}

export type Suggestion = { kind: "place"; label: string; to: string } | { kind: "entity"; entity: Entity };
const SEARCHY = new Set(["go", "goto", "open", "cd", "find", "search", "ls", "take", "grab", "pick"]);

/** What to offer while someone is typing: places whose name starts like the input, then things that match it. */
export function suggest(input: string, parsed: { verb: string; rest: string }, index: Entity[], limit = 6): Suggestion[] {
  const t = input.trim();
  if (!t || t.startsWith("@")) return [];
  const known = byVerb.has(parsed.verb) || parsed.verb === "?" || parsed.verb === "help";
  if (known && !(SEARCHY.has(parsed.verb) && parsed.rest)) return [];
  const q = known ? parsed.rest : t;
  const out: Suggestion[] = [];
  if (!known) for (const p of PLACES) if (p.names.some((n) => n.startsWith(q.toLowerCase())) && q.length >= 2) out.push({ kind: "place", label: p.label, to: p.to });
  for (const e of searchEntities(index, q, limit)) out.push({ kind: "entity", entity: e });
  return out.slice(0, limit);
}
