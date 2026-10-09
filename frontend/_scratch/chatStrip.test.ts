import assert from "node:assert/strict";
import { intensity, paintRows, scrollTopFor, catchUp, STRIP_ROWS } from "../src/lib/chatStrip.ts";
const M = (id: number, text: string, o: any = {}) => ({ id, channelId: 1, authorId: 2, authorUsername: "ghost", authorAvatarUrl: null, unixTimestamp: id, replyToId: null, replyPreview: null, contentRaw: text, attachments: [], isDeleted: false, editedAt: null, reactions: [], embeds: [], kind: "text", data: null, ...o }) as any;
assert.ok(intensity(M(1, "lol")) < intensity(M(2, "x".repeat(400))), "longer is louder");
assert.ok(intensity(M(1, "hi", { reactions: [{ emojiId: 1, emojiName: "a", usernames: ["a", "b"] }] })) > intensity(M(1, "hi")), "reactions add");
assert.ok(intensity(M(1, "q", { kind: "poll" })) >= 205, "structured is loud");
assert.equal(intensity(M(1, "gone", { isDeleted: true })), 8);
assert.ok(intensity(M(1, "x".repeat(100000), { attachments: [{}], reactions: [{ emojiId: 1, emojiName: "a", usernames: Array(50).fill("u") }] })) <= 255);
// painting: a tall message covers many rows, a loud one wins a shared row
const p = paintRows([{ top: 0, height: 100, value: 50, mine: false }, { top: 100, height: 100, value: 200, mine: true }], 200);
assert.equal(p.value[0], 50); assert.equal(p.value[STRIP_ROWS - 1], 200); assert.equal(p.mine[STRIP_ROWS - 1], 1); assert.equal(p.mine[0], 0);
assert.equal(paintRows([], 0).value.length, STRIP_ROWS);
const shared = paintRows([{ top: 0, height: 1, value: 40, mine: false }, { top: 0, height: 1, value: 120, mine: true }], 10000);
assert.equal(shared.value[0], 120);
assert.equal(scrollTopFor(0, 1000, 200), 0); assert.equal(scrollTopFor(1, 1000, 200), 800); assert.equal(scrollTopFor(0.5, 1000, 200), 400); assert.equal(scrollTopFor(5, 1000, 200), 800);
// catch-up
const many = Array.from({ length: 30 }, (_, i) => M(i + 1, i === 20 ? "this is the long important one ".repeat(10) : "ok", i === 25 ? { kind: "poll" } : i === 12 ? { reactions: [{ emojiId: 1, emojiName: "x", usernames: ["a", "b", "c"] }], authorUsername: "zed" } : {}));
const r = catchUp(many, 5, 99)!;
assert.equal(r.count, 25); assert.equal(r.firstId, 6); assert.equal(r.highlights.length, 3);
assert.deepEqual(r.highlights.map((m) => m.id), [13, 21, 26], "reacted, long, poll — in order");
assert.deepEqual(r.people.sort(), ["ghost", "zed"]);
assert.equal(catchUp(many, 25, 99), null, "fewer than 10 new: no reel");
assert.equal(catchUp(many.map((m) => ({ ...m, authorId: 7 })), 0, 7), null, "your own messages never count");
assert.equal(catchUp(many.map((m, i) => (i % 2 ? { ...m, isDeleted: true } : m)), 0, 99, 10)!.count, 15);
console.log("chatStrip: ok");
