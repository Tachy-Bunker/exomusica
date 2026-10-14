import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix302.py").read()
__file__ = D + "/e2e_fix302.py"; exec(_s.split("\ndef run(playwright):")[0])
PL = [{"id": 1, "title": "Late night drones"}, {"id": 2, "title": "A rather long playlist title for a very narrow phone screen"}, {"id": 3, "title": "Field"}]
posted = []; loads = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/albums/al1": return ok(ALBUM)
        if key == "/api/playlists" and "mine=true" in path: loads.append(1); return ok(PL)
        m = re.match(r"/api/playlists/(\d+)/items$", key)
        if m: posted.append((int(m.group(1)), json.loads(req.post_data))); return ok({"ok": True}, 201)
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    pg.goto(f"{BASE}/album/al1"); pg.wait_for_selector("[data-testid=add-pl-open]", timeout=10000)
    wide = lambda: pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check(not wide(), "Closed: the page does not scroll sideways on a phone")
    check(len(loads) == 0 and pg.locator("select").count() == 0, "Nothing is fetched until the button is pressed; no <select> left")
    pg.locator("[data-testid=add-pl-open]").first.click(); pg.wait_for_selector("[data-testid=add-pl-pop]")
    items = pg.locator("[data-testid=add-pl-item]")
    check(items.count() == 3 and len(loads) == 1, "Pressing it shows the playlists as buttons")
    check(not wide(), "Open: still no sideways scroll")
    b = pg.locator("[data-testid=add-pl-pop]").bounding_box()
    check(b["x"] >= 0 and b["x"] + b["width"] <= 390, f"The panel stays inside the screen ({b['x']:.0f}..{b['x']+b['width']:.0f})")
    items.nth(2).click(); pg.wait_for_timeout(300)
    check(posted == [(3, {"trackId": 1})] and "✓" in items.nth(2).inner_text(), f"Pressing a playlist adds the track {posted}")
    pg.wait_for_timeout(1200)
    check(pg.locator("[data-testid=add-pl-pop]").count() == 0, "…and the panel closes")
    pg.locator("[data-testid=add-pl-open]").nth(1).click(); pg.wait_for_selector("[data-testid=add-pl-pop]")
    pg.mouse.click(5, 400); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=add-pl-pop]").count() == 0 and len(loads) == 1, "Tapping elsewhere closes it; the list was fetched only once")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
