import { linksTo, validBacklinkPath } from "../src/lib/backlinks";
let bad = 0; const t = (n: string, ok: boolean) => { console.log((ok ? "ok   " : "FAIL ") + n); if (!ok) bad++; };
t("valid path", validBacklinkPath("/album/al1") && validBacklinkPath("/u/neo") && validBacklinkPath("/community-album/x_y"));
t("invalid paths", !validBacklinkPath("/admin/x") && !validBacklinkPath("album/x") && !validBacklinkPath("/album/") && !validBacklinkPath("/album/a/b") && !validBacklinkPath(5) && !validBacklinkPath("/album/" + "a".repeat(200)));
t("regex chars are inert", !validBacklinkPath("/album/a.*"));
t("finds markdown link", linksTo("see [x](/album/al1) now", "/album/al1"));
t("finds full url", linksTo("https://e.com/album/al1?x=1", "/album/al1"));
t("end of text", linksTo("/album/al1", "/album/al1"));
t("not a prefix of a longer slug", !linksTo("see /album/al10", "/album/al1") && !linksTo("/album/al1-b", "/album/al1"));
t("dot in slug is literal", !linksTo("/album/alX1", "/album/al.1") && linksTo("/album/al.1", "/album/al.1"));
import { secondRing } from "../src/lib/backlinks";
{
  const h = (slug: string) => ({ type: "study" as const, slug, title: "T" + slug, href: "/study/" + slug });
  const direct = [h("a"), h("b")];
  const via = new Map([["/study/a", [h("c"), h("b"), h("x")]], ["/study/b", [h("c"), h("d"), h("self")]]]);
  const r = secondRing("/study/self", direct, via);
  t("second ring skips first ring, itself and repeats", r.map((x) => x.slug).join() === "c,x,d");
  t("remembers the page it came through", r[0].via === "Ta" && r[2].via === "Tb");
  t("cap", secondRing("/p", direct, new Map([["/study/a", Array.from({ length: 50 }, (_, i) => h("n" + i))]]), 5).length === 5);
  t("nothing in, nothing out", secondRing("/p", [], new Map()).length === 0);
}
process.exit(bad ? 1 : 0);
