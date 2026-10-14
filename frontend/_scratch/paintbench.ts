import { layoutHull } from "../src/lib/hullLayout.js";
import { buildRoom } from "../src/lib/roomWorld.js";
import { paintRoom } from "../src/lib/roomPaint.js";
import { facing, stepEye, type Eye } from "../src/lib/roomView.js";
class Ctx { fillStyle = ""; strokeStyle = ""; lineWidth = 1; font = ""; textAlign = ""; n = 0;
  beginPath() { this.n++; } moveTo() { this.n++; } lineTo() { this.n++; } closePath() {} fill() {} stroke() {} clip() {} save() {} restore() {} fillRect() {} strokeText() {} fillText() {} arc() {} ellipse() {} translate() {} drawImage() {} }
const hull = layoutHull([{ id: 1, parentId: null, slug: "a", name: "A", tracks: 5, albums: 2 }, ...[2, 3, 4, 5].map((i) => ({ id: i, parentId: 1, slug: "b" + i, name: "B" + i, tracks: 5, albums: 1 }))], { outer: false });
const w = buildRoom({ hull, slug: "a", name: "A", states: null, albums: [{ slug: "x", title: "X" }, { slug: "y", title: "Y" }, { slug: "z", title: "Z" }], channelSlug: "c" });
const ctx = new Ctx() as unknown as CanvasRenderingContext2D, others = [{ id: 1, name: "zoe", x: 2, z: 1, yaw: 0, tx: 2, tz: 1, tyaw: 0 }];
let e: Eye = { ...w.spawn, pitch: 0 };
const run = (n: number, withPaint: boolean, withLogic: boolean) => { global.gc!(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) { if (withLogic) { e = stepEye(w, e, { forward: 0.2, strafe: 0.3, turn: 0.4, look: 0, run: false }, 1 / 60).eye; facing(w, e); } if (withPaint) paintRoom(ctx, 800, 600, w, e, "#5fd3ee", null, others as never, null, null); }
  return (process.memoryUsage().heapUsed - h0) / n; };
run(200, true, false);
console.log("paint only      B/frame:", run(3000, true, false).toFixed(0));
console.log("logic only      B/frame:", run(3000, false, true).toFixed(0));
console.log("paint + logic   B/frame:", run(3000, true, true).toFixed(0));
