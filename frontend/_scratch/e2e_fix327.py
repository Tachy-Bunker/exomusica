import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
CAT = [{"id": "lore", "title": "Lore", "entries": []},
       {"id": "ancients", "title": "Ancients", "entries": [{"key": "user:Ada", "title": "@Ada", "href": "/u/Ada"}, {"key": "user:bob", "title": "@bob", "href": "/u/bob"}, {"key": "user:zed", "title": "@zed", "href": "/u/zed"}]}]
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
    ctx.add_init_script("localStorage.setItem('exomusica_classic','0'); localStorage.setItem('exomusica_scans', JSON.stringify(['person|user:bob']));")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/field-log": return ok(CAT)
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{BASE}/field-log"); pg.wait_for_selector("[data-testid=log-ancients]")
    sec = pg.locator("[data-testid=log-ancients]")
    check(pg.inner_text("[data-testid=log-ancients-count]").startswith("1/3"), "Ancients section counts found/total")
    check(sec.locator("[data-testid=log-entry]").count() == 1 and sec.locator("[data-testid=log-locked]").count() == 2, "One name unlocked, two silhouettes")
    t = sec.inner_text()
    check("@bob" in t and "@Ada" not in t and "@zed" not in t, "Locked names are not in the page")
    check("old Discord" in t, "The section explains itself")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
