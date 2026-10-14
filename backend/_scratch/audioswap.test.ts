import assert from "node:assert";
import { swapStudyAudio, studyAudioUrls } from "../src/lib/studyAudioSwap";
const A = "/uploads/messages/a.wav", B = "/uploads/messages/b.mp3";
const body = `# x\n\n@audio(${A})\n\ntext @audio(${A}) inline\n@audio(/uploads/messages/other.wav)\n`;
let r = swapStudyAudio(body, A, B);
assert.equal(r.blocks, 1); assert.ok(r.text.includes(`@audio(${B})`)); assert.ok(r.text.includes(`text @audio(${A}) inline`), "only whole-line blocks");
assert.ok(r.text.includes("other.wav"));
const note = `Sweep {clip:12.5-15.2 ${A} img=/uploads/messages/s.png} and {clip:1-2 /uploads/messages/other.wav}`;
r = swapStudyAudio(note, A, B);
assert.equal(r.clips, 1); assert.equal(r.text, `Sweep {clip:12.5-15.2 ${B}} and {clip:1-2 /uploads/messages/other.wav}`);
assert.equal(swapStudyAudio("nothing", A, B).text, "nothing");
assert.deepEqual(studyAudioUrls([note, "{clip:1-2 /z.wav}"]), [A, "/uploads/messages/other.wav", "/z.wav"]);
assert.deepEqual(studyAudioUrls([body, note]), [A, "/uploads/messages/other.wav"]);
// regex chars in url are literal
assert.equal(swapStudyAudio("@audio(/u/a+b.wav)", "/u/a+b.wav", "/u/c.wav").blocks, 1);
assert.equal(swapStudyAudio("@audio(/u/aab.wav)", "/u/a+b.wav", "/u/c.wav").blocks, 0);
console.log("ok");
