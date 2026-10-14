import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
ADM = {**ME, "isAdmin": True}
ATT = {"total": 9, "panels": {
  "join-requests": {"kind": "todo", "count": 2, "items": [{"label": "ghost", "to": "/admin/join-requests", "note": "waiting for an answer"}]},
  "studies": {"kind": "new", "count": 1, "items": [{"label": "Granular ice", "to": "/study/other-1", "note": "by ghost9, since you last looked"}]},
  "branches": {"kind": "missing", "count": 3, "items": [{"label": "Empty Branch", "to": "/admin/branches", "note": "no description, no cover image"}]},
  "all-tracks": {"kind": "missing", "count": 120, "items": [{"label": "Rain (First)", "to": "/admin/all-tracks", "note": "no genres"}]}}}
seen = []; fetches = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1300, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADM))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/admin/attention": fetches.append(1); return ok(ATT)
        if key == "/api/admin/attention/seen": seen.append(json.loads(req.post_data)); return ok({"ok": True})
        if key == "/api/admin/inbox": return ok({"total": 0, "counts": {}, "items": []})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    pg.goto(f"{BASE}/admin/inbox"); pg.wait_for_selector("[data-testid=light-join-requests]")
    check(pg.inner_text("[data-testid=light-total]") == "9", "Nav: the total shows on Needs attention")
    check(pg.inner_text("[data-testid=light-join-requests]") == "2" and pg.get_attribute("[data-testid=light-join-requests]", "data-kind") == "todo", "Nav: Join requests has a red light with its count")
    check(pg.get_attribute("[data-testid=light-branches]", "data-kind") == "missing" and pg.inner_text("[data-testid=light-all-tracks]") == "99+", "Nav: missing-info lights are ringed, big counts cap at 99+")
    check(pg.locator("[data-testid=light-albums]").count() == 0 and pg.locator("a:has-text('Glossary') .admin-light").count() == 0, "Nav: panels with nothing to flag stay dark")
    check(pg.locator(".admin-nav a").count() >= 38, f"Nav: every panel link is still there ({pg.locator('.admin-nav a').count()})")
    bg = pg.evaluate("getComputedStyle(document.querySelector('[data-testid=light-join-requests]')).backgroundColor")
    check(bg.startswith("rgb(229, 72, 77)"), f"Light is red ({bg})")
    # page
    pg.click("[data-testid=nav-attention]"); pg.wait_for_selector("[data-testid=attention-page]")
    t = pg.inner_text("[data-testid=attention-page]")
    check("Waiting on you" in t and "New since you last looked" in t and "Missing information" in t, "Page: three groups")
    check("no description, no cover image" in pg.inner_text("[data-testid=att-branches]") or pg.locator("[data-testid=att-branches]").evaluate("e => e.textContent").count("no description") == 1, "Page: missing items say what is missing")
    check("and 119 more" in pg.locator("[data-testid=att-all-tracks]").evaluate("e => e.textContent"), "Page: long lists are cut with a count")
    pg.locator("[data-testid=att-branches] summary").click(); pg.locator("[data-testid=att-branches] a:has-text('Empty Branch')").click(); pg.wait_for_url("**/admin/branches")
    check(True, "Page: an item links to its panel")
    # seen
    n = len(fetches)
    pg.click("a[href='/admin/studies']"); pg.wait_for_timeout(500)
    check(seen == [{"panel": "studies"}], f"Opening Studies marks it looked at {seen}")
    check(len(fetches) > n, "…and the lights refresh")
    pg.click("a[href='/admin/branches']"); pg.wait_for_timeout(300)
    check(seen == [{"panel": "studies"}], "Panels without a 'new' light don't post anything")
    check(not errors, f"No page errors {errors[:2]}")
    ATT.update({"total": 0, "panels": {}})
    p2 = ctx.new_page(); p2.goto(f"{BASE}/admin/attention"); p2.wait_for_selector("[data-testid=attention-clear]")
    check(p2.locator(".admin-light").count() == 0, "A complete site: no lights, a clear message")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
