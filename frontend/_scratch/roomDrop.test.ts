import { parseDropped, roomFromDrop } from "../src/lib/roomDrop";
let n = 0; const ok = (c: boolean, m: string) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else { n++; console.log("ok  ", m); } };
ok(parseDropped("[The Hall](https://x.test/topic/Hall)")!.id === "hall" && parseDropped("[The Hall](https://x.test/topic/Hall)")!.title === "The Hall", "topic link");
ok(parseDropped("[Ice](https://x.test/study/ice-1)") === null, "a study is not a room");
ok(parseDropped("https://x.test/branch/drift")!.kind === "branch", "bare url works");
ok(parseDropped("nonsense") === null, "garbage");
(async () => {
  const br = async () => [{ slug: "drift", name: "Drift", channel: { slug: "drift-chat" } }, { slug: "mute", name: "Mute", channel: null }];
  const r = await roomFromDrop("[Drift](https://x/branch/drift)", br);
  ok(r?.slug === "drift-chat" && r.branchSlug === "drift" && r.name === "Drift", "a branch resolves to its chat");
  ok((await roomFromDrop("[M](https://x/branch/mute)", br)) === null, "a branch without chat is nothing");
  ok((await roomFromDrop("[T](https://x/topic/den)", br))!.slug === "den", "a topic is its own room");
  console.log(n, "passed");
})();
