import "./winshim";
import { focusOf, freqOf, showFreq, fuzzyScore, searchEntities, nearestFreq, pushTrail, parseCommand, hrefOf, type Entity } from "../src/lib/atlas";
import { runCommand, helpText, suggest, type ActionCtx, type Out } from "../src/lib/actions";
import { addToList, POCKET_MAX } from "../src/lib/pocketStore";
import { hop } from "../src/lib/trace";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };

ok(JSON.stringify(focusOf("/study/Beating-Tones")) === JSON.stringify({ type: "study", id: "beating-tones" }), "focus: study (lower-cased)");
ok(focusOf("/branch/ambient")?.type === "branch" && focusOf("/album/x")?.type === "album" && focusOf("/wiki/start")?.type === "wiki" && focusOf("/news/a")?.type === "news" && focusOf("/topic/hall")?.type === "topic", "focus: other kinds");
ok(focusOf("/xenolab", "?tab=resources&item=7")?.type === "resource" && focusOf("/xenolab", "?tab=open&call=2")?.type === "call", "focus: resource + open call from the query");
ok(focusOf("/soundbay") === null && focusOf("/wiki") === null && focusOf("/xenolab", "?tab=resources") === null && focusOf("/xenolab", "?tab=resources&item=abc") === null, "focus: lists and bad ids are not things");
ok(focusOf("/study/a/b") === null, "focus: deeper paths are not things");

const f1 = freqOf("study", "beating-tones");
ok(f1 === freqOf("study", "Beating-Tones") && f1 >= 7.0 && f1 <= 7.3, `freq: stable, case-blind, inside its band (${showFreq(f1)})`);
ok(freqOf("branch", "x") >= 14 && freqOf("branch", "x") <= 14.35 && freqOf("news", "x") >= 28 && showFreq(7) === "7.000", "freq: bands + formatting");
ok(new Set(Array.from({ length: 40 }, (_, i) => freqOf("study", `s${i}`))).size > 30, "freq: spreads across the band");

ok(fuzzyScore("beat", "Beating tones in a cave") >= 80 - 20 && fuzzyScore("tones cave", "Beating tones in a cave") > 40, "fuzzy: prefix and all-words");
ok(fuzzyScore("btc", "Beating tones in a cave") === -1 || fuzzyScore("btc", "Beating tones in a cave") >= 0, "fuzzy: does not throw on odd input");
ok(fuzzyScore("zzz", "Beating") === -1 && fuzzyScore("", "x") === 0, "fuzzy: no match / empty");
ok(fuzzyScore("beating tones in a cave", "Beating tones in a cave") === 100, "fuzzy: exact");
ok(fuzzyScore("Béating", "beating") === 100, "fuzzy: accents folded");

const rows: Entity[] = [
  { type: "study", id: "beating-tones", title: "Beating tones in a cave", sub: "tachy" },
  { type: "study", id: "granular-ice", title: "Granular ice", sub: "ghost9" },
  { type: "branch", id: "ambient", title: "Ambient" },
  { type: "branch", id: "ambient-drones", title: "Ambient drones" },
  { type: "wiki", id: "gear", title: "Gear notes" },
];
ok(searchEntities(rows, "granular")[0].id === "granular-ice", "search: finds by title");
ok(searchEntities(rows, "ghost9")[0].id === "granular-ice", "search: finds by sub (author)");
ok(searchEntities(rows, "amb", 8, "branch").length === 2 && searchEntities(rows, "amb", 8, "study").length === 0, "search: type filter");
ok(nearestFreq(rows, freqOf("wiki", "gear"), 2)[0].e.id === "gear", "nearest: exact frequency first");
ok(pushTrail(pushTrail([], { type: "study", id: "a", title: "A", href: "/study/a" }), { type: "study", id: "a", title: "A", href: "/study/a" }).length === 1, "trail: no repeats");
const tr = Array.from({ length: 9 }, (_, i) => ({ type: "study" as const, id: `s${i}`, title: "", href: "" })).reduce((t, e) => pushTrail(t, e), [] as ReturnType<typeof pushTrail>);
ok(tr.length === 6 && tr[0].id === "s8", "trail: newest first, capped");

ok(parseCommand("go  Beating tones").verb === "go" && parseCommand("go  Beating tones").rest === "Beating tones", "parse: verb + rest");
ok(parseCommand("@old").verb === "@" && parseCommand("@old").rest === "old" && parseCommand("/help x").verb === "help" && parseCommand("  ").verb === "", "parse: @, slash, blank");

// ---- the runner
const gone: string[] = [];
let pocket: { key: string; type: Entity["type"]; id: string; title: string }[] = [];
const ctx = (user: ActionCtx["user"] = { username: "tachy", isAdmin: false }, focus: Entity | null = null): ActionCtx => ({
  go: (to) => gone.push(to), back: () => gone.push("<back>"), user, index: rows, focus, pathname: "/x", rand: () => 0.99,
  pocket: { get items() { return pocket; }, add: (e) => { pocket = addToList(pocket as never, e); }, remove: (k) => { pocket = pocket.filter((p) => p.key !== k); }, clear: () => { pocket = []; } },
});
const run = (s: string, c = ctx()): Out[] => runCommand(s, parseCommand(s), c);
const txt = (o: Out[]) => o.map((x) => ("text" in x ? x.text : x.kind)).join("|");

run("beating tones in a cave"); ok(gone.pop() === "/study/beating-tones", "run: a bare exact name goes there");
run("go soundbay"); ok(gone.pop() === "/soundbay", "run: places by name");
run("soundbay"); ok(gone.pop() === "/soundbay", "run: bare place");
let o = run("go amb"); ok(gone.length === 0 && o.filter((x) => x.kind === "peek").length === 2, "run: ambiguous names list instead of guessing");
o = run("go nonsense"); ok(o[0].kind === "error" && gone.length === 0, "run: no match is an error");
o = run("find study"); ok(o.filter((x) => x.kind === "peek").length === 2, "run: find <type> lists that kind");
run("tune " + showFreq(freqOf("wiki", "gear"))); ok(gone.pop() === hrefOf("wiki", "gear"), "run: tune goes to an exact frequency");
o = run("tune 15.1"); ok(gone.length === 0 && o.filter((x) => x.kind === "peek").length === 5, "run: tune near lists the nearest");
o = run("tune x"); ok(o[0].kind === "text", "run: tune needs a number");
run("random study"); ok(gone.pop()!.startsWith("/study/"), "run: random of a type");
run("take", ctx(undefined, rows[0])); ok(pocket.length === 1, "run: take picks up the current page");
run("take ambient"); ok(pocket.length === 2 && pocket[0].id === "ambient", "run: take by name");
o = run("pocket"); ok(o.filter((x) => x.kind === "peek").length === 2, "run: pocket lists");
run("drop 1"); ok(pocket.length === 1, "run: drop by number");
run("drop all"); ok(pocket.length === 0 && txt(run("pocket")).includes("empty"), "run: drop all");
o = run("take", ctx()); ok(o[0].kind === "error", "run: take with nothing here");
run("@old"); ok(gone.pop() === "/u/old", "run: @name");
o = run("pm old", ctx(null)); ok(o[0].kind === "error" && gone.length === 0, "run: pm needs login");
run("pm old"); ok(gone.pop() === "/pms/old", "run: pm");
o = run("admin feat"); ok(o[0].kind === "error", "run: admin is operators only");
run("admin feat", ctx({ username: "t", isAdmin: true })); ok(gone.pop() === "/admin/featured", "run: admin page by fuzzy name");
run("back"); ok(gone.pop() === "<back>", "run: back");
ok(run("clear")[0].kind === "clear", "run: clear");
ok(helpText("", { user: null }).length > 5 && !txt(helpText("", { user: null })).includes("Jump to an admin page") && txt(helpText("", { user: { username: "a", isAdmin: true } }).slice(0)).includes("Jump to an admin page"), "help: hides what you cannot run");
ok(txt(helpText("tune", { user: null })).includes("tune 14.250"), "help: one command");

ok(addToList(Array.from({ length: POCKET_MAX }, (_, i) => ({ key: `study:s${i}`, type: "study" as const, id: `s${i}`, title: "", href: "" })), { type: "wiki", id: "w", title: "W" }).length === POCKET_MAX, "pocket: capped");

ok(hop(null, "a:b", 1000) === null && hop({ key: "a:b", at: 0 }, "a:b", 10) === null && hop({ key: "a:b", at: 0 }, "c:d", 10 * 60_000) === null, "trace: no hop from nowhere, to itself, or after a long gap");
ok(JSON.stringify(hop({ key: "study:a", at: 0 }, "branch:b", 1000)) === JSON.stringify(["study:a", "branch:b"]), "trace: a recent hop");
const sg = (s: string) => suggest(s, parseCommand(s), rows);
ok(sg("").length === 0 && sg("@ol").length === 0, "suggest: nothing for empty or @");
ok(sg("gran").some((x) => x.kind === "entity" && x.entity.id === "granular-ice"), "suggest: entities while typing a bare name");
ok(sg("sound").some((x) => x.kind === "place" && x.to === "/soundbay"), "suggest: places by prefix");
ok(sg("go gran").length > 0 && sg("pocket").length === 0 && sg("tune 14").length === 0, "suggest: only search-like commands get entity suggestions");
process.exit(fails ? 1 : 0);
