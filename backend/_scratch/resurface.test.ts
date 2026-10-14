import assert from "node:assert/strict";
import { dayKey, echoPick, pickFragment, seededIndex, type EchoRow } from "../src/lib/resurface.js";

const md = `# Title

Short.

This is a long enough paragraph about granular synthesis and the way grains overlap in time to form texture, which is the point.

| a | b |
|---|---|
| 1 | 2 |

- a list item that is long enough to be a paragraph but is a list so it must be skipped entirely here ok

@branch-index

![img](x.png)

Second prose paragraph that is also quite long enough to count as a readable passage from this page, with [a link](https://x.io) inside.`;
const seen = new Set<string>();
for (let i = 0; i < 40; i++) seen.add(pickFragment(md, () => i / 40)!);
assert.equal(seen.size, 2, "only the two prose paragraphs are ever picked");
assert.ok([...seen].every((t) => !t.includes("](") && t.length >= 60));
assert.ok([...seen].some((t) => t.includes("a link") && !t.includes("https")), "links are reduced to their text");
assert.equal(pickFragment("# only\n\n@branch-index\n\nshort"), null);
assert.equal(pickFragment(""), null);

assert.equal(dayKey(new Date("2026-10-14T23:59:59Z")), "2026-10-14");
assert.equal(seededIndex("2026-10-14", 1000), seededIndex("2026-10-14", 1000), "stable for a day");
assert.notEqual(seededIndex("2026-10-14", 1e6), seededIndex("2026-10-15", 1e6));
for (const n of [1, 2, 7]) for (let d = 1; d < 30; d++) { const i = seededIndex(`2026-10-${d}`, n); assert.ok(i >= 0 && i < n); }
assert.equal(seededIndex("x", 0), 0);

const row = (id: number, contentRaw: string, over: Partial<EchoRow> = {}): EchoRow => ({ id, contentRaw, createdAt: new Date("2025-03-09T10:00:00Z"), author: "ann", channelSlug: "art", channelName: "Art", ...over });
const long = "I keep coming back to how a single sine, slowly detuned against itself, can feel like a whole room breathing.";
const e = echoPick([row(1, "hi"), row(2, "/roll 20"), row(3, "https://example.com/very/long/link/only/here/please/ok/thanks"), row(4, long), row(5, long + " later")])!;
assert.equal(e.text, long); assert.equal(e.by, "ann");
assert.equal(e.href, "/topic/art?day=2025-03-09#m-4");
assert.equal(echoPick([row(1, "short"), row(2, "x".repeat(1300))]), null);
assert.equal(echoPick([row(1, "w ".repeat(300))]), null, "too long to show whole is skipped");
assert.equal(echoPick([]), null);
console.log("resurface ok");
