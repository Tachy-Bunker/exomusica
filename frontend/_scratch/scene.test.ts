import assert from "node:assert/strict";
import { layoutHull, type HullNode } from "../src/lib/hullLayout.js";
import { roomStates, type ChartBranch } from "../src/lib/chart.js";
import { buildRoom, type RoomWorld } from "../src/lib/roomWorld.js";
import { buildLink, flipLink, resolveMove, eyeSpace, crossed, inRoom, nearestOnPath, makeCorridor, CORR_HW, LEAD } from "../src/lib/roomScene.js";
const N = (id: number, parentId: number | null, over: Partial<HullNode> = {}): HullNode => ({ id, parentId, slug: `b${id}`, name: `B${id}`, tracks: id * 3, albums: 1, ...over });
const nodes = [N(1, null), ...Array.from({ length: 9 }, (_, i) => N(i + 2, 1)), N(20, 2), N(21, 2), N(22, 20), N(23, 5), N(24, 5), N(25, 5)];
const hull = layoutHull(nodes, { outer: false });
const chart: ChartBranch[] = nodes.map((n) => ({ id: n.id, slug: n.slug!, name: n.name, parentId: n.parentId }));
const states = roomStates(chart, new Set(nodes.map((n) => n.slug!)));
const worlds = new Map<string, RoomWorld>();
for (const r of hull.rooms) worlds.set(r.slug!, buildRoom({ hull, slug: r.slug!, name: r.name, states, albums: [], channelSlug: null }));
let links = 0, maxBends = 0, longest = 0, shortest = 1e9;
for (const l of hull.links) {
  const a = worlds.get(hull.rooms.find((r) => r.id === l.from)!.slug!)!, b = worlds.get(hull.rooms.find((r) => r.id === l.to)!.slug!)!;
  for (const [cur, nxt] of [[a, b], [b, a]] as const) {
    const door = cur.doors.find((d) => d.toSlug === nxt.slug)!; assert.ok(door, `door ${cur.slug}->${nxt.slug}`);
    const L = buildLink(cur, door, nxt, 1)!; assert.ok(L, "link"); links++;
    const p = L.c.pts, n = L.c.n;
    // starts on this door, ends on the far door
    assert.ok(Math.hypot(p[0] - door.x, p[1] - door.z) < 1e-6, "starts at the door");
    assert.ok(Math.hypot(p[n * 2 - 2] - (L.offx + L.back.x), p[n * 2 - 1] - (L.offz + L.back.z)) < 1e-6, "ends at the far door");
    // same corridor from either end
    const M = buildLink(nxt, nxt.doors.find((d) => d.toSlug === cur.slug)!, cur, 1)!;
    assert.equal(M.c.n, n); for (let i = 0; i < n; i++) { assert.ok(Math.abs(M.c.pts[i * 2] - (p[(n - 1 - i) * 2] - L.offx)) < 1e-6 && Math.abs(M.c.pts[i * 2 + 1] - (p[(n - 1 - i) * 2 + 1] - L.offz)) < 1e-6, "mirror"); }
    // the middle of the corridor is outside both rooms
    for (let s = 0; s < n - 1; s++) for (let t = 0.0; t <= 1.0001; t += 0.05) {
      const x = p[s * 2] + (p[s * 2 + 2] - p[s * 2]) * t, z = p[s * 2 + 1] + (p[s * 2 + 3] - p[s * 2 + 1]) * t;
      if (Math.hypot(x - door.x, z - door.z) < 0.8 || Math.hypot(x - (L.offx + L.back.x), z - (L.offz + L.back.z)) < 0.8) continue; // at the thresholds
      assert.ok(!inRoom(cur, x, z, -0.0) || Math.hypot(x - door.x, z - door.z) < LEAD + 0.5 && false, `corridor inside ${cur.slug}? ${x.toFixed(1)},${z.toFixed(1)}`);
      assert.ok(!inRoom(nxt, x - L.offx, z - L.offz, 0), `corridor inside ${nxt.slug}`);
    }
    maxBends = Math.max(maxBends, n - 4); longest = Math.max(longest, L.c.len); shortest = Math.min(shortest, L.c.len);
    // walk it: along the middle line, every step is accepted untouched; at the end we have crossed
    let x = door.x - door.nx * 1.2, z = door.z - door.nz * 1.2, crossedAt = -1, moved = 0;
    const pts: number[] = [x, z]; for (let i = 0; i < n; i++) pts.push(p[i * 2], p[i * 2 + 1]); pts.push(L.offx + L.back.x - L.back.nx * 1.5, L.offz + L.back.z - L.back.nz * 1.5);
    for (let i = 0; i < pts.length - 2; i += 2) {
      const dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1], len = Math.hypot(dx, dz), steps = Math.ceil(len / 0.1);
      for (let s = 1; s <= steps; s++) {
        const nx = pts[i] + (dx * s) / steps, nz = pts[i + 1] + (dz * s) / steps, r = resolveMove(cur, L, nx, nz);
        assert.ok(Math.hypot(r.x - nx, r.z - nz) < 1e-6, `walking the middle of ${cur.slug}->${nxt.slug} is blocked at ${nx.toFixed(2)},${nz.toFixed(2)}`);
        x = r.x; z = r.z; moved++; if (crossedAt < 0 && crossed(L, x, z)) crossedAt = moved;
      }
    }
    assert.ok(crossedAt > 0, "crossed into the far room");
    // the eye is in the corridor in the middle, in the room at the start
    const mid = nearestOnPath(L.c, 0, 0); void mid;
    const half = L.c.len / 2; let acc = 0, mx = 0, mz = 0; for (let s = 0; s < n - 1; s++) { const sl = L.c.cum[s + 1] - L.c.cum[s]; if (acc + sl >= half) { const t = (half - acc) / sl; mx = p[s * 2] + (p[s * 2 + 2] - p[s * 2]) * t; mz = p[s * 2 + 1] + (p[s * 2 + 3] - p[s * 2 + 1]) * t; break; } acc += sl; }
    assert.equal(eyeSpace(cur, L, mx, mz), "corridor"); assert.equal(eyeSpace(cur, L, 0, 0), "cur");
    // shut door: the wall holds
    const S = { ...L, open: 0 }; const wx = door.x + door.nx * 0.5, wz = door.z + door.nz * 0.5, r0 = resolveMove(cur, S, wx, wz);
    assert.ok(Math.hypot(r0.x - wx, r0.z - wz) > 0.4, "a shut door is a wall");
    // flipping twice is the identity
    const FF = flipLink(flipLink(L, cur), nxt); assert.ok(FF.c.pts.every((v, i) => Math.abs(v - L.c.pts[i]) < 1e-9) && Math.abs(FF.offx - L.offx) < 1e-9);
    // the walls of the corridor are CORR_HW from the line
    for (let i = 0; i < n; i++) { const d = Math.hypot(L.c.left[i * 2] - p[i * 2], L.c.left[i * 2 + 1] - p[i * 2 + 1]); assert.ok(d >= CORR_HW - 1e-6 && d <= CORR_HW / 0.45 + 1e-6, "mitre"); }
  }
}
// the hand-off is seamless: a step taken from the far room's side lands on the same physical point as from this side
{
  const a = worlds.get("b1")!, b = worlds.get("b2")!, door = a.doors.find((d) => d.toSlug === "b2")!, L = buildLink(a, door, b, 1)!, F = flipLink(L, a);
  let n = 0;
  for (let t = 0; t < 400; t++) {
    const x = door.x + (Math.cos(t * 0.37) * 6), z = door.z + door.nz * (t % 40) * 0.5 + Math.sin(t * 0.91) * 3;
    const r1 = resolveMove(a, L, x, z), r2 = resolveMove(b, F, x - L.offx, z - L.offz);
    // both worlds describe the same union of room, corridor and room; they agree wherever the point is in the corridor or the far room
    if (inRoom(b, x - L.offx, z - L.offz, 0.5) || nearestOnPath(L.c, x, z).d < CORR_HW - 0.3) { assert.ok(Math.hypot(r1.x - L.offx - r2.x, r1.z - L.offz - r2.z) < 1e-6, "same place from both sides"); n++; }
  }
  assert.ok(n > 20, `compared ${n} points`);
}
// a lone straight corridor
const c = makeCorridor([0, 0, 10, 0]); assert.equal(c.n, 2); assert.ok(Math.abs(c.len - 10) < 1e-9 && Math.abs(c.left[1] - CORR_HW) < 1e-9 && Math.abs(c.right[1] + CORR_HW) < 1e-9);
// a corner is mitred: the outer wall point is further out than the inner one
const k = makeCorridor([0, 0, 10, 0, 10, 10]); assert.ok(Math.abs(Math.hypot(k.left[2] - 10, k.left[3]) - CORR_HW * Math.SQRT2) < 1e-6);
console.log(`scene ok: ${links} links, most points ${maxBends + 4}, corridor ${shortest.toFixed(1)}..${longest.toFixed(1)} m`);
