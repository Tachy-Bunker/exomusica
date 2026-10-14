import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix310.py").read()
__file__ = D + "/e2e_fix310.py"; exec(_s.split("\ndef run(playwright):")[0])
UNLOCKED = {"v": True}; seen_calls = []; N = {"v": 4}
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk():
        ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok([{"key": "m-sharedlens", "title": "Shared lens", "perk": "x", "metric": "SCANS", "label": "scans", "target": 500, "now": 600 if UNLOCKED["v"] else 100, "reached": UNLOCKED["v"], "reachedAt": None, "live": True}])
            if key == "/api/scans/seen": seen_calls.append(path); return ok({"others": N["v"]})
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or "volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    def scan(pg):
        pg.goto(f"{BASE}/study/mine-1"); pg.wait_for_selector(".probe-point"); pg.keyboard.press("i"); pg.hover("a[href$='/album/al1']"); pg.wait_for_selector("[data-testid=probe-card]", timeout=4000)
    pg = mk(); scan(pg); pg.wait_for_selector("[data-testid=probe-others]", timeout=3000)
    check("4 other members have scanned this" in pg.inner_text("[data-testid=probe-others]"), "Unlocked: the card says how many others scanned it")
    check(len(seen_calls) == 1 and "kind=" in seen_calls[0] and "key=" in seen_calls[0], f"One request per look {seen_calls}")
    N["v"] = 0; pg2 = mk(); seen_calls.clear(); scan(pg2); pg2.wait_for_selector("[data-testid=probe-others]", timeout=3000)
    check("No one else" in pg2.inner_text("[data-testid=probe-others]"), "Nobody else: says so")
    N["v"] = 1; pg3 = mk(); scan(pg3); pg3.wait_for_selector("[data-testid=probe-others]", timeout=3000)
    check("1 other member has" in pg3.inner_text("[data-testid=probe-others]"), "Singular wording")
    UNLOCKED["v"] = False; seen_calls.clear(); pg4 = mk(); scan(pg4); pg4.wait_for_timeout(800)
    check(pg4.locator("[data-testid=probe-others]").count() == 0 and not seen_calls, "Before the milestone: no line, and no request at all")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
