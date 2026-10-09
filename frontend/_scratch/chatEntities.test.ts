import assert from "node:assert/strict";
import { entityTrigger, entityHits, entityOfPath } from "../src/lib/chatEntities.ts";
import { spliceAt } from "../src/lib/chatInsert.ts";
import { freqOf } from "../src/lib/atlas.ts";

const T = (v: string, c = v.length) => entityTrigger(v, c);
assert.deepEqual(T("see #gran"), { kind: "name", query: "gran", start: 4 });
assert.deepEqual(T("#beating tones"), { kind: "name", query: "beating tones", start: 0 });
assert.equal(T("## heading"), null);
assert.equal(T("issue #12"), null);              // plain numbers are not names
assert.equal(T("no trigger here"), null);
assert.equal(T("a#b"), null);                    // must start a word
assert.deepEqual(T("tune ~7.15"), { kind: "freq", query: "7.15", start: 5 });
assert.equal(T("~"), null);
assert.equal(T("hi #gran", 3), null);             // cursor before the trigger
const idx = [{ type: "study" as const, id: "granular-ice", title: "Granular ice" }, { type: "branch" as const, id: "b2", title: "Full Branch" }, { type: "wiki" as const, id: "start", title: "Start here" }];
assert.equal(entityHits(idx, T("#gran")!)[0].id, "granular-ice");
assert.equal(entityHits(idx, T("#zzzz")!).length, 0);
const f = freqOf("study", "granular-ice");
assert.equal(entityHits(idx, { kind: "freq", query: String(f), start: 0 })[0].id, "granular-ice");
assert.equal(entityHits(idx, { kind: "freq", query: "7", start: 0 }).length, 0); // too short to mean anything
assert.deepEqual(entityOfPath("/study/granular-ice"), { type: "study", id: "granular-ice", freq: f });
assert.equal(entityOfPath("/members"), null);
assert.equal(entityOfPath("/study/granular-ice?tab=x")?.id, "granular-ice");
// splicing
assert.deepEqual(spliceAt("see #gran", 4, 9, "[X](u)"), { value: "see [X](u) ", cursor: 11 });
assert.deepEqual(spliceAt("hi", 2, 2, "L"), { value: "hi L ", cursor: 5 });
assert.equal(spliceAt("a b", 2, 2, "L").value, "a L b".replace("L b", "L b")); // space before and after
assert.equal(spliceAt("", 0, 0, "L").value, "L ");
console.log("chatEntities: ok");
