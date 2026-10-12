import { entityOfHref, entityFromDrop } from "../src/lib/dropEntity";
let n = 0; const ok = (c: boolean, m: string) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else { n++; console.log("ok  ", m); } };
const O = "https://x.test";
ok(entityOfHref("/study/Ice-1", O)!.type === "study" && entityOfHref("/study/Ice-1", O)!.id === "ice-1", "study path");
ok(entityOfHref("/soundbay?open=Drift", O)!.type === "branch" && entityOfHref("/soundbay?open=Drift", O)!.id === "drift", "branch via soundbay");
ok(entityOfHref("https://evil.test/study/x", O) === null, "other sites are not carried");
ok(entityOfHref("/pms/ana", O) === null && entityOfHref("/account", O) === null && entityOfHref("/admin/signal", O) === null, "private pages are not things");
ok(entityOfHref("/xenolab?tab=resources&item=7", O)!.type === "resource", "resource");
ok(entityFromDrop("[Ice](https://x.test/study/ice-1)", O)!.title === "Ice", "markdown link carries the title");
ok(entityFromDrop("https://x.test/wiki/start", O)!.title === "start", "bare url falls back to the id");
ok(entityFromDrop("hello", O) === null, "text is nothing");
console.log(n, "passed");
{
  const { entitiesInText } = await import("../src/lib/dropEntity");
  const o = "https://x.test";
  const r = entitiesInText("hear [My Branch](/soundbay?open=drone) and https://x.test/study/abc, also https://evil.test/study/zzz and [me](/pms)", o);
  const okk = (c: boolean, m: string) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
  okk(r.length === 2 && r[0].id === "drone" && r[0].title === "My Branch", "message links: titled link first");
  okk(r[1].type === "study" && !r.some((x) => x.id === "zzz" || x.id === "pms"), "message links: bare site link kept, other sites and private pages are not");
  okk(entitiesInText("nothing here", o).length === 0, "message links: none");
}
