import assert from "node:assert/strict";
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
(globalThis as any).matchMedia = (q: string) => ({ matches: false });
(globalThis as any).document = { documentElement: { classList: { toggle() {} } } };
const { roomsFirst, setRoomsFirst, roomHref } = await import("../src/lib/roomFirst");
const { branchHref } = await import("../src/lib/branchLinks");
assert.equal(roomsFirst(), true); assert.equal(branchHref("core"), "/branch/core/room");
setRoomsFirst(false); assert.equal(roomsFirst(), false); assert.equal(branchHref("a b"), "/soundbay?open=a%20b");
setRoomsFirst(true); assert.equal(roomsFirst(), true);
store.clear(); store.set("exomusica_classic", "1"); // classic mode chosen: pages, unless the room choice says otherwise
const again = await import("../src/lib/roomFirst?x=1").catch(() => null); void again;
assert.equal(roomHref("x y"), "/branch/x%20y/room");
// atlas knows a room is its branch
const { focusOf } = await import("../src/lib/atlas"); assert.deepEqual(focusOf("/branch/Core/room"), { type: "branch", id: "core" }); assert.equal(focusOf("/branch/core/room/x"), null);
console.log("roomfirst ok");
