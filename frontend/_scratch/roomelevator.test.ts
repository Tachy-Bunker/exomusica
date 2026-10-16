// The elevator's geometry and the jumps on it. Pure: runs in node with the same physics the room uses.
import { elevatorSolids, ELEV } from "../src/lib/roomElevator";
import { groundAt, WireRuntime, emptyDoc, type RoomDoc } from "../src/lib/roomDoc";
import { makeCorridor } from "../src/lib/roomScene";
const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exit(1); } };
const STEP = 0.5, APEX = (4.2 * 4.2) / (2 * 11), WALK = 3.0, DT = 1 / 120, BODY = 1.7;

// a straight corridor 10 m long along x (a lead-in is just two points here)
const straight = makeCorridor([0, 0, 10, 0]);
for (const H of [1.7, 3.4]) for (const highFar of [true, false]) {
  const acts = elevatorSolids(straight, H, highFar);
  const doc: RoomDoc = { ...emptyDoc(), actors: acts }; const rt = new WireRuntime(doc, null, 0);
  const plats = acts.filter((a) => a.id.startsWith("elev-") && !a.id.includes("deck")).sort((p, q) => p.lift - q.lift);
  const deck = acts.filter((a) => a.id.includes("deck"));
  const n = Math.ceil(H / ELEV.RISE), tops = plats.map((a) => a.lift + a.h);
  ok(plats.length === n, `H ${H}: ${n} platforms (got ${plats.length})`);
  ok(Math.abs(tops[tops.length - 1] - H) < 1e-6, `H ${H}: the last platform is at the high floor (${tops[tops.length - 1]})`);
  for (let k = 0; k < tops.length; k++) {
    const rise = tops[k] - (k ? tops[k - 1] : 0);
    ok(rise > STEP + 0.04 && rise < APEX - 0.15, `H ${H}: rise ${k} is a jump, not a step nor too high (${rise.toFixed(3)} m, apex ${APEX.toFixed(2)})`);
  }
  // the deck is at the high floor and covers the high end (its far or near half)
  ok(deck.length >= 1 && deck.every((a) => Math.abs(a.lift) < 1e-9 && Math.abs(a.h - H) < 1e-9), `H ${H}: the deck is solid up to the high floor`);
  const hi = deck.reduce((m, a) => Math.max(m, a.x), -1e9), lo = deck.reduce((m, a) => Math.min(m, a.x), 1e9);
  ok(highFar ? lo > 5 : hi < 5, `H ${H}: the deck is on the ${highFar ? "far" : "near"} end (x ${lo.toFixed(2)}..${hi.toFixed(2)})`);
  // every platform is inside the corridor's width, and the deck stands on the floor it reaches
  for (const a of plats) ok(Math.abs(a.z) + a.d / 2 <= 1.05 + 1e-6, `${a.id} is inside the walls`);
  ok(groundAt(doc, rt, straight.pts[0] + 0, 0, 0) >= 0, "ground sample works");

  // every jump: stand on the ground before the first platform, then on each platform in turn, walk toward the next one at
  // walk speed and press jump once, at some moment; the feet must land on the next top
  const first = plats[0], ux0 = first.rot === undefined ? 1 : Math.cos(first.rot), uz0 = Math.sin(first.rot);
  const stands = [{ x: first.x - ux0 * 1.4, z: first.z - uz0 * 1.4, fy: 0, w: 1.5 }, ...plats.map((p) => ({ x: p.x, z: p.z, fy: p.lift + p.h, w: p.w }))];
  for (let j = 0; j + 1 < stands.length; j++) {
    const from = stands[j], to = plats[j], topTo = to.lift + to.h;
    const dist = Math.hypot(to.x - from.x, to.z - from.z), ux = (to.x - from.x) / dist, uz = (to.z - from.z) / dist;
    let landed = false;
    for (let lead = 0; lead <= 0.9 && !landed; lead += 0.02) {
      let x = from.x, z = from.z, fy = from.fy, vy = 0, jumped = false;
      const jumpAt = Math.max(0, (from.w / 2 - lead) / WALK);
      for (let t = 0; t < 2.0 && !landed; t += DT) {
        if (!jumped && t >= jumpAt) { jumped = true; vy = 4.2; }
        const g = groundAt(doc, rt, x, z, fy);
        if (vy > 0 || fy > g + 0.02) { vy -= 11 * DT; fy += vy * DT; if (fy <= g) { fy = g; vy = 0; } }
        else { fy = g; vy = 0; }
        x += ux * WALK * DT; z += uz * WALK * DT;
        if (jumped && vy <= 0 && Math.abs(fy - topTo) < 1e-3 && Math.abs(groundAt(doc, rt, x, z, fy) - topTo) < 1e-6) landed = true;
        if (jumped && fy < -0.5) break;
      }
    }
    ok(landed, `H ${H} ${highFar ? "far" : "near"}: a jump from step ${j} lands on step ${j + 1} (rise ${(topTo - from.fy).toFixed(2)} m)`);
  }
}
// a corridor too short for the climb gets no spiral (and no platform past its end); a corridor a little short is squeezed
const tiny = makeCorridor([0, 0, 6, 0]);
ok(elevatorSolids(makeCorridor([0, 0, 4, 0]), 1.7, true).length === 0, "a 4 m corridor is too short for a 1.7 m climb: no spiral");
ok(elevatorSolids(tiny, 1.7, true).filter((a) => a.id.startsWith("elev-") && !a.id.includes("deck")).length === 3, "a 6 m corridor holds a 1.7 m climb, squeezed");
ok(elevatorSolids(makeCorridor([0, 0, 9, 0]), 1.7, true).filter((a) => a.id.startsWith("elev-") && !a.id.includes("deck")).length === 3, "a 9 m corridor holds the 1.7 m climb");
console.log("roomelevator ok");
