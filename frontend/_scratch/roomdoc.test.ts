import { cleanDoc, WireRuntime, pushOut, insideBox, MAX_ACTORS, MAX_PER_ACTOR_TICK } from "../src/lib/roomDoc";
let n = 0; const ok = (c: unknown, m: string) => { n++; if (!c) { console.error("FAIL", m); process.exit(1); } };
const A = (id: string, kind: string, extra: object = {}) => ({ id, kind, x: 0, z: 0, ...extra });
// clean
ok(cleanDoc(null).actors.length === 0, "null ok");
const d = cleanDoc({ actors: [A("a", "solid", { w: 99999, color: "red" }), A("a", "solid"), A("b", "bogus"), A("t", "trigger", { x: 1e9 }), A("s", "solid", { sides: 1 })], wires: [
  { from: "t", ev: "enter", to: "a", msg: "hide" }, { from: "t", ev: "enter", to: "a", msg: "hide" }, { from: "t", ev: "nope", to: "a", msg: "hide" }, { from: "zz", ev: "enter", to: "a", msg: "hide" }, { from: "a", ev: "shown", to: "t", msg: "hide" }] });
ok(d.actors.length === 3, "dup/bogus dropped " + d.actors.length);
ok(d.actors[0].w === 60 && d.actors[0].color === "#7a8cff", "clamped");
ok(d.actors[1].x === 200, "range");
ok(d.actors[2].sides === 0, "sides 1 -> 0");
ok(d.wires.length === 1, "wires cleaned " + d.wires.length);
ok(cleanDoc({ actors: Array.from({ length: 500 }, (_, i) => A("x" + i, "solid")) }).actors.length === MAX_ACTORS, "cap");
// runtime: trigger hides a solid after 1 s, once
const doc = cleanDoc({ actors: [A("t", "trigger", { w: 2, d: 2 }), A("wall", "solid", { x: 5, w: 2, d: 2 })], wires: [{ from: "t", ev: "enter", to: "wall", msg: "hide", delay: 1, once: true }] });
const rt = new WireRuntime(doc); rt.start(0);
ok(rt.isOn("wall"), "wall on");
rt.probe(0, 0, 0); rt.tick(0.5); ok(rt.isOn("wall"), "not yet");
ok(rt.nextDue() === 1, "next due");
rt.tick(1.0); ok(!rt.isOn("wall") && rt.drain().join() === "wall", "hidden after delay");
rt.probe(9, 9, 2); rt.probe(0, 0, 3); rt.tick(5); ok(!rt.isOn("wall") && rt.pending === 0, "once: no second fire");
// toggle loop is capped
const loop = cleanDoc({ actors: [A("p", "solid"), A("q", "solid")], wires: [{ from: "p", ev: "shown", to: "q", msg: "toggle" }, { from: "p", ev: "hidden", to: "q", msg: "toggle" }, { from: "q", ev: "shown", to: "p", msg: "toggle" }, { from: "q", ev: "hidden", to: "p", msg: "toggle" }, { from: "p", ev: "start", to: "q", msg: "toggle" }] });
const r2 = new WireRuntime(loop); r2.start(0); const t0 = performance.now(); r2.tick(0); ok(performance.now() - t0 < 50, "loop returns fast"); ok(r2.pending === 0, "loop queue drained");
ok(MAX_PER_ACTOR_TICK === 8, "cap const");
// disable
const dis = cleanDoc({ actors: [A("t", "trigger", { w: 2, d: 2 }), A("l", "light")], wires: [{ from: "t", ev: "enter", to: "l", msg: "toggle" }] });
const r3 = new WireRuntime(dis); r3.enabled.set("t", false); r3.probe(0, 0, 0); r3.tick(0); ok(r3.isOn("l"), "disabled trigger silent");
r3.enabled.set("t", true); r3.probe(0, 0, 0); r3.tick(0); ok(!r3.isOn("l"), "enabled trigger fires");
// collision
const sol = cleanDoc({ actors: [A("w", "solid", { x: 0, z: 0, w: 2, d: 2 }), A("c", "solid", { x: 10, z: 0, w: 2, d: 2, sides: 6 })] });
const r4 = new WireRuntime(sol); const out = { x: 0, z: 0 };
ok(pushOut(sol, r4, 0.9, 0, 0.3, out) && Math.abs(out.x - 1.3) < 1e-6, "pushed out of box +x");
ok(!pushOut(sol, r4, 3, 0, 0.3, out), "outside is free");
ok(pushOut(sol, r4, 10.2, 0, 0.3, out) && Math.abs(Math.hypot(out.x - 10, out.z) - 1.3) < 1e-6, "pushed out of prism");
r4.on.set("w", false); ok(!pushOut(sol, r4, 0.5, 0, 0.3, out), "hidden solid does not collide");
ok(insideBox(cleanDoc({ actors: [A("r", "trigger", { w: 4, d: 1, rot: Math.PI / 2 })] }).actors[0], 0, 1.5), "rotated box");
console.log("roomdoc ok", n);
