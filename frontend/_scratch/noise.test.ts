import { perlin1 } from "../src/lib/noise";
import { flyPosition } from "../src/lib/fireflies";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
let max=0, jump=0, prev=perlin1(0);
for (let i=1;i<5000;i++){ const v=perlin1(i*0.01); max=Math.max(max,Math.abs(v)); jump=Math.max(jump,Math.abs(v-prev)); prev=v; }
ok(max<=1 && max>0.3, "noise within -1..1 and moves: "+max.toFixed(2));
ok(jump<0.1, "noise is smooth (max step "+jump.toFixed(3)+")");
const a=flyPosition(1,3), b=flyPosition(2,3);
ok(a.x!==b.x || a.y!==b.y, "flies differ");
ok(flyPosition(1,3).x===a.x, "deterministic");
const d=Math.hypot(flyPosition(1,3.1).x-a.x, flyPosition(1,3.1).y-a.y);
ok(d<0.2, "slow drift: moves "+d.toFixed(3)+" in 0.1s");
