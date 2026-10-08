import { gainForLoudness } from "../src/lib/replayGain";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
ok(Math.abs(gainForLoudness(-8, -1) - -3) < 1e-9, "louder than -11 is turned down to it");
ok(Math.abs(gainForLoudness(-11, -1)) < 1e-9, "exactly -11 stays");
ok(Math.abs(gainForLoudness(-16, -6) - 5) < 1e-9, "quiet with headroom is boosted fully");
ok(Math.abs(gainForLoudness(-20, -3) - 2.7) < 1e-9, "quiet but peaky is boosted only to the peak: " + gainForLoudness(-20, -3));
ok(gainForLoudness(-20, 0) === 0, "peak at full scale gets no boost");
ok(gainForLoudness(-60, -40) <= 24, "capped");
