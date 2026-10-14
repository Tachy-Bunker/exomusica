import assert from "node:assert/strict";
import { isWaveProfile, WAVE_BINS } from "../src/lib/waveProfile.js";
const good = Buffer.alloc(WAVE_BINS * 2, 7).toString("base64");
assert.ok(isWaveProfile(good));
assert.ok(!isWaveProfile(Buffer.alloc(WAVE_BINS * 2 - 3, 7).toString("base64")));
assert.ok(!isWaveProfile(good.slice(0, -4) + "!!!!"));
assert.ok(!isWaveProfile(null) && !isWaveProfile(5) && !isWaveProfile(""));
console.log("waveprofile ok");
