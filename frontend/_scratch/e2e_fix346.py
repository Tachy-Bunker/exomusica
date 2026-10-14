import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
NOW = int(time.time() * 1000)
ARMS = [{"kind": "track", "label": "track:7", "n": 40}, {"kind": "lore", "label": "album:first", "n": 22}, {"kind": "person", "label": None, "n": 9}] + [{"kind": "lore", "label": f"study:s{i}", "n": 5 + i} for i in range(6)]
def storm(kind):
    if kind == "locked": return {"locked": True}
    if kind == "active": return {"locked": False, "state": "active", "startsAt": NOW - 10 * 3600000, "endsAt": NOW + 38 * 3600000, "goal": 1000, "count": 420, "full": False, "serverNow": NOW, "artifact": None}
    if kind == "activefull": return {"locked": False, "state": "active", "startsAt": NOW - 10 * 3600000, "endsAt": NOW + 38 * 3600000, "goal": 1000, "count": 1000, "full": True, "serverNow": NOW, "artifact": None}
    if kind == "won": return {"locked": False, "state": "ended", "startsAt": NOW - 50 * 3600000, "endsAt": NOW - 2 * 3600000, "goal": 1000, "count": 1000, "full": True, "serverNow": NOW, "artifact": {"seed": 4242, "total": 1337, "arms": ARMS}}
    return {"locked": False, "state": "ended", "startsAt": NOW - 50 * 3600000, "endsAt": NOW - 2 * 3600000, "goal": 1000, "count": 640, "full": False, "serverNow": NOW, "artifact": None}
def run(pw):
    b = pw.chromium.launch(); out = []; asked = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(kind, reachedAgoH=10):
        ctx = b.new_context(viewport={"width": 1100, "height": 800}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','1');window.__ac=0;const A=window.AudioContext;window.AudioContext=function(){window.__ac++;return new A()};")
        def h(route):
            path = route.request.url.replace(BASE, ""); k = path.split("?")[0]
            ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if k == "/api/storm": asked.append(1); return ok(storm(kind))
            if k == "/api/milestones": return ok([{"key": "m-storm", "title": "Signal storm", "perk": "x", "metric": "SCANS", "label": "s", "target": 5000, "now": 5200, "reached": kind != "locked", "reachedAt": None if kind == "locked" else time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(NOW / 1000 - reachedAgoH * 3600)), "live": True}])
            if k in DATA: return ok(DATA[k])
            return ok([] if k in ("/api/chart",) else {})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs
    pg, errs = mk("locked"); pg.goto(f"{BASE}/storm"); pg.wait_for_selector("[data-testid=storm-locked]")
    check(True, "Locked: a quiet message")
    asked.clear(); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1500)
    check(pg.locator("[data-testid=storm-banner]").count() == 0 and not asked, "Locked: no banner, no storm request from the homepage")
    pg, errs = mk("active"); pg.goto(f"{BASE}/storm"); pg.wait_for_selector("[data-testid=storm-meter]")
    check(pg.get_attribute("[data-testid=storm-meter]", "aria-valuenow") == "42" and "420 of 1000" in pg.inner_text("[data-testid=storm-status]") and "ends in 38 h" in pg.inner_text("[data-testid=storm-status]"), f"Active: meter, count and time left ({pg.inner_text('[data-testid=storm-status]')})")
    check(pg.locator("[data-testid=storm-artifact]").count() == 0, "Active: no Artifact yet")
    asked.clear(); pg.goto(f"{BASE}/"); pg.wait_for_selector("[data-testid=storm-banner]", timeout=5000)
    check("42%" in pg.inner_text("[data-testid=storm-banner]") and pg.get_attribute("[data-testid=storm-banner] a", "href") == "/storm", "Homepage banner while it runs, linking to the storm")
    pg, errs = mk("activefull"); pg.goto(f"{BASE}/storm"); pg.wait_for_selector("[data-testid=storm-meter]")
    check("forms when the storm ends" in pg.inner_text("[data-testid=storm-status]") and pg.locator("[data-testid=storm-artifact]").count() == 0, "Full meter: promise of the Artifact, nothing shown yet")
    pg, errs = mk("won", 50); pg.goto(f"{BASE}/storm"); pg.wait_for_selector("[data-testid=storm-canvas]"); pg.wait_for_timeout(400)
    px = pg.evaluate("(()=>{const c=document.querySelector('[data-testid=storm-canvas]');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()")
    check(px > 1500, f"The Artifact is drawn ({px} pixels)")
    check(pg.locator("[data-testid=storm-arms] li").count() == 9 and "someone" in pg.inner_text("[data-testid=storm-arms]") and "album:first" in pg.inner_text("[data-testid=storm-arms]"), "Nine spokes listed, a person shown only as 'someone'")
    pg.screenshot(path="/tmp/storm.png"); ac0 = pg.evaluate("window.__ac"); pg.click("[data-testid=storm-play]"); pg.wait_for_timeout(300)
    check(pg.evaluate("window.__ac") == ac0 + 1, "Hear it: one audio context, started by the click")
    asked.clear(); pg.goto(f"{BASE}/"); pg.wait_for_selector("[data-testid=storm-banner]", timeout=5000)
    check("Artifact is open" in pg.inner_text("[data-testid=storm-banner]"), "After a win the banner says the Artifact is open")
    check(not errs, f"No page errors {errs[:1]}")
    pg, errs = mk("lost", 50); pg.goto(f"{BASE}/storm"); pg.wait_for_selector("[data-testid=storm-status]")
    check("nothing opened" in pg.inner_text("[data-testid=storm-status]") and pg.locator("[data-testid=storm-artifact]").count() == 0, "Unfilled meter: the storm passes, no Artifact")
    pg, errs = mk("won", 24 * 30); asked.clear(); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1500)
    check(pg.locator("[data-testid=storm-banner]").count() == 0 and not asked, "A month later: no banner and no request")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
