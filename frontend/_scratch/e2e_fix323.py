import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix292.py").read()
__file__ = D + "/e2e_fix292.py"; exec(_s.split("\ndef run(playwright):")[0])
DATA["/api/channels/hall/archive"] = [{"day": "2023-04-12", "messageCount": 37}]
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    pg.goto(f"{BASE}/topic/hall?day=2023-04-12"); pg.wait_for_selector("[data-testid=recovered-log]", timeout=10000)
    t = pg.inner_text("[data-testid=recovered-log]")
    check("Recovered: 2023-04-12, #hall" in t and "37 entries decoded" in t and "years down" in t, f"Archive day opens with a recovered-log header: {t!r}")
    pg2 = ctx.new_page(); pg2.goto(f"{BASE}/topic/hall"); pg2.wait_for_selector("text=alpha", timeout=10000)
    check(pg2.locator("[data-testid=recovered-log]").count() == 0, "Live chat has no header")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
