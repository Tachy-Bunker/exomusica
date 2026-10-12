import { fmtClock, parsePin, pinsByTarget } from "../src/lib/voicePins";
let n = 0; const ok = (c: boolean, m: string) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else { n++; console.log("ok  ", m); } };
ok(fmtClock(7.9) === "0:07" && fmtClock(75) === "1:15" && fmtClock(-3) === "0:00", "clock");
ok(JSON.stringify(parsePin("@0:07 that low thump")) === '{"at":7,"text":"that low thump"}' && parsePin("@1:05")!.at === 65, "pin: parsed with and without words");
ok(parsePin("hello @0:07") === null && parsePin("@0:7 x") === null && parsePin("@0:75 x") === null, "pin: only at the start, proper seconds");
const p = pinsByTarget([{ id: 5, authorUsername: "a", contentRaw: "@0:20 b", replyPreview: { id: 1 } }, { id: 6, authorUsername: "b", contentRaw: "@0:05 a", replyPreview: { id: 1 } }, { id: 7, authorUsername: "c", contentRaw: "@0:09 x", replyPreview: { id: 2 }, isDeleted: true }, { id: 8, authorUsername: "c", contentRaw: "plain", replyPreview: { id: 1 } }]);
ok(p[1].length === 2 && p[1][0].at === 5 && !p[2], "pins: grouped by target, sorted, deleted and plain replies ignored");
console.log(n + " passed");
