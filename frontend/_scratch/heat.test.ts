import { heatOf, buildHeatMap, pathOfHref } from "../src/lib/heat";
let bad = 0; const t = (n: string, ok: boolean) => { console.log((ok ? "ok   " : "FAIL ") + n); if (!ok) bad++; };
const D = 86400;
t("buckets", heatOf(60) === 4 && heatOf(2 * D) === 3 && heatOf(5 * D) === 2 && heatOf(20 * D) === 1 && heatOf(90 * D) === 0);
t("edges", heatOf(D) === 4 && heatOf(D + 1) === 3 && heatOf(30 * D) === 1 && heatOf(30 * D + 1) === 0);
t("future and junk are warm, not crashes", heatOf(-5) === 4 && heatOf(NaN) === 4);
const now = Date.parse("2026-10-13T12:00:00Z") / 1000;
const m = buildHeatMap(
  [{ slug: "a", lastActivityAt: "2026-10-13T08:00:00Z" }, { slug: "b", lastActivityAt: null }, { slug: "c", lastActivityAt: "2026-06-01T00:00:00Z" }],
  [{ slug: "t1", kind: "DISCUSSION", lastMessageAt: now - 2 * D }, { slug: "branch-a", kind: "BRANCH", lastMessageAt: now }, { slug: "t2", kind: "DISCUSSION", lastMessageAt: null }],
  [{ slug: "s1", updatedAt: "2026-10-10T12:00:00Z" }], now);
t("branch warm", m.get("/branch/a") === 4 && m.get("/branch/c") === 0);
t("no data = absent", !m.has("/branch/b") && !m.has("/topic/t2"));
t("topic only, not branch chats", m.get("/topic/t1") === 3 && !m.has("/topic/branch-a"));
t("study", m.get("/study/s1") === 3);
t("hrefs", pathOfHref("/branch/a/", "https://x.org") === "/branch/a" && pathOfHref("https://x.org/study/s1?x=1#h", "https://x.org") === "/study/s1" && pathOfHref("https://other.org/a", "https://x.org") === null);
process.exit(bad ? 1 : 0);
