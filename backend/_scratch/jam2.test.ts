import assert from "node:assert/strict";
import { JamRooms, guestName, cleanChat, pushChat, cleanCursor, CHAT_KEEP, MAX_MEMBERS, type ChatLine } from "../src/lib/jamRoom.js";
const r = new JamRooms<number>();
const a = r.create()!, b = r.create(false)!;
assert.deepEqual(r.list(), [], "empty rooms are not listed");
r.join(a, 1, { id: 1, username: "x" }); r.join(b, 2, { id: 2, username: "y" });
assert.deepEqual(r.list().map((x) => x.code), [a], "unlisted rooms stay out of the list");
r.join(a, 3, { id: 0, username: "guest-1" });
assert.equal(r.list()[0].people, 2); assert.equal(r.list()[0].full, false);
for (let i = 10; i < 10 + MAX_MEMBERS; i++) r.join(a, i, { id: 0, username: `g${i}` });
assert.equal(r.list()[0].full, true);
assert.equal(guestName(["guest-0000"], () => 0).startsWith("guest-"), true);
assert.notEqual(guestName(["guest-0000"], () => 0), "guest-0000");
assert.match(guestName([], () => 0.5), /^guest-\d{4}$/);
assert.equal(cleanChat("  hi   there\n\u0007 "), "hi there"); assert.equal(cleanChat("   "), null); assert.equal(cleanChat(5), null); assert.equal(cleanChat("x".repeat(999))!.length, 300);
const chat: ChatLine[] = []; for (let i = 0; i < 60; i++) pushChat(chat, { by: "a", text: String(i), at: i });
assert.equal(chat.length, CHAT_KEEP); assert.equal(chat[0].text, "20");
assert.deepEqual(cleanCursor(0.5, 0.25), { x: 0.5, y: 0.25 }); assert.deepEqual(cleanCursor(9, -9), { x: 1.2, y: -0.2 });
assert.equal(cleanCursor(NaN, 1), null); assert.equal(cleanCursor("1", 1), null);
console.log("ok");
{
  // Jam grows: the limit is a property; list() reports it
  const g = new JamRooms<number>(); const c = g.create()!;
  for (let i = 1; i <= MAX_MEMBERS; i++) g.join(c, i, { id: 0, username: "u" + i });
  assert.equal(g.join(c, 99, { id: 0, username: "x" }), "full");
  g.limit = 8;
  assert.equal(g.join(c, 100, { id: 0, username: "y" }), "ok");
  assert.equal(g.join(c, 101, { id: 0, username: "z" }), "ok");
  assert.equal(g.join(c, 102, { id: 0, username: "w" }), "full");
  assert.deepEqual([g.list()[0].people, g.list()[0].max, g.list()[0].full], [8, 8, true]);
  g.limit = 6; // lowered again: nobody is thrown out, nobody new gets in
  assert.equal(g.rooms.get(c)!.members.size, 8); assert.equal(g.join(c, 103, { id: 0, username: "v" }), "full");
  console.log("jam grows ok");
}
