import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
def ms(xray, season, days=200): return [{"key": "m-xray", "title": "X-ray lens", "perk": "x", "metric": "STUDIES", "label": "s", "target": 25, "now": 30, "reached": xray, "reachedAt": None, "live": True}, {"key": "m-season", "title": "Season shift", "perk": "x", "metric": "DAYS", "label": "d", "target": 180, "now": days, "reached": season, "reachedAt": None, "live": True}]
def run(pw):
    b = pw.chromium.launch(); out = []; reqs = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(xray, season, days=200, init=""):
        ctx = b.new_context(viewport={"width": 1200, "height": 800}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + init)
        def h(route):
            path = route.request.url.replace(BASE, ""); k = path.split("?")[0]
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if k == "/api/milestones": return ok(ms(xray, season, days))
            if k == "/api/backlinks":
                reqs.append(path)
                if "depth=2" in path: return ok({"locked": False, "hits": [{"type": "study", "slug": "s1", "title": "Beating", "href": "/study/s1"}], "second": [{"type": "wiki", "slug": "w9", "title": "Far page", "href": "/wiki/w9", "via": "Beating"}]})
                return ok([{"type": "study", "slug": "s1", "title": "Beating", "href": "/study/s1"}])
            if k in ("/api/landmarks", "/api/field-log", "/api/chart", "/api/scans", "/api/studies"): return ok([])
            if k.startswith("/api/wiki/"): return ok({"error": "no"}, 404)
            if k in DATA: return ok(DATA[k])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs
    def xray(pg):
        pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-page]"); pg.keyboard.press("i"); pg.wait_for_selector("[data-testid=probe-hud]")
        pg.keyboard.press("3"); pg.wait_for_selector("[data-testid=xray-panel]")
        pg.evaluate("()=>{window.history.pushState({}, '', '/wiki/missing'); window.dispatchEvent(new PopStateEvent('popstate'))}")
        pg.wait_for_selector("[data-testid=xray-hit]", timeout=4000)
    # X-ray two links
    pg, errs = mk(False, False); xray(pg); pg.wait_for_timeout(300)
    check("depth=2" not in reqs[-1] and pg.locator("[data-testid=xray-second]").count() == 0, "X-ray not unlocked: one link only, no deep request")
    reqs.clear(); pg, errs = mk(True, False); xray(pg); pg.wait_for_selector("[data-testid=xray-second]", timeout=3000)
    check("depth=2" in reqs[-1], "X-ray unlocked: asks for two links")
    check("Far page" in pg.inner_text("[data-testid=xray-second]") and "via beating" in pg.inner_text("[data-testid=xray-panel]").lower(), "Pages two links away are listed with the page they came through")
    check(pg.get_attribute("[data-testid=xray-second]", "href") == "/wiki/w9", "…as links")
    check(not errs, f"No page errors {errs[:1]}")
    # Season shift
    col = lambda pg: pg.evaluate("()=>document.documentElement.style.getPropertyValue('--accent-forum')")
    pg, errs = mk(False, False); pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-page]"); pg.wait_for_timeout(500)
    check(col(pg) == "" and pg.evaluate("document.documentElement.dataset.era") is None, "Season shift locked: colours untouched")
    pg, errs = mk(False, True, 200); pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-page]"); pg.wait_for_timeout(600)
    c2 = col(pg); check(c2.startswith("#") and c2 != "#e2703f" and pg.evaluate("document.documentElement.dataset.era") == "moss", f"Day 200 is the Moss era: accents turned ({c2})")
    pg, errs = mk(False, True, 40); pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-page]"); pg.wait_for_timeout(600)
    check(col(pg) == "", "First era keeps the original colours")
    pg, errs = mk(False, True, 200, "localStorage.setItem('exomusica_skin','phazon');"); pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-page]"); pg.wait_for_timeout(600)
    check(pg.evaluate("document.documentElement.style.getPropertyValue('--accent-forum')") == "#19e0c8" and pg.evaluate("document.documentElement.dataset.era") is None, "A chosen skin wins over the era")
    # hum switch in settings, and no audio engine started by default
    pg, errs = mk(False, True, 200, "localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', JSON.stringify({id:1,username:'tachy',email:'a@b.c',isAdmin:false}));window.__ac=0;const A=window.AudioContext;window.AudioContext=function(){window.__ac++;return new A()};")
    pg.goto(f"{BASE}/account"); pg.wait_for_selector("[data-testid=hum-toggle]", timeout=5000)
    ac0 = pg.evaluate("window.__ac"); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__ac") == ac0, "The hum is off by default: it starts no audio of its own")
    pg.check("[data-testid=hum-toggle]"); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__ac") == ac0 + 1 and pg.evaluate("localStorage.getItem('exomusica_hum')") == "1", "Switching it on starts one quiet drone and remembers the choice")
    pg.uncheck("[data-testid=hum-toggle]"); pg.wait_for_timeout(300)
    check(pg.evaluate("localStorage.getItem('exomusica_hum')") is None, "…and off again")
    check(not errs, f"No page errors {errs[:1]}")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
