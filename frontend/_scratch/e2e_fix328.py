import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix310.py").read()
__file__ = D + "/e2e_fix310.py"; exec(_s.split("\ndef run(playwright):")[0])
SUIT = {"items": [
  {"key": "tint", "title": "Probe tint", "earned": True, "perk": "Choose your own colour for your marks in the Scan visor."},
  {"key": "frame-spark", "title": "Spark frame", "earned": False, "level": 0, "hint": "In XenoLab, open a phenomenon card and scan all of its parts."},
  {"key": "frame-log", "title": "Log frame", "earned": False, "level": 2, "hint": "Finish a list, and listen."}], "choice": {"frame": None, "tint": None}}
CAT = [{"id": "lore", "title": "Lore", "entries": [{"key": "wiki:a", "title": "A", "href": "/wiki/a"}]}]
puts = []; scan_body = {"v": None}
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user=ME):
        ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/upgrades": return ok(SUIT)
            if key == "/api/upgrades/choice":
                if req.method == "PUT": b = json.loads(req.post_data); puts.append(b); SUIT["choice"] = b; return ok(b)
                return ok(SUIT["choice"])
            if key == "/api/field-log": return ok(CAT)
            if key == "/api/scans":
                if req.method == "POST" and scan_body["v"]: return ok(scan_body["v"])
                return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if key == "/api/users/neo": return ok({"id": 9, "username": "neo", "avatarUrl": None, "bio": None, "links": None, "isGhost": False, "createdAt": "2026-01-01T00:00:00Z", "frame": "frame-spark"})
            if key == "/api/users/neo/stats": return ok({"signals": 3, "trace": [0, 1, 2], "studies": []})
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or "volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    pg = mk(); pg.goto(f"{BASE}/field-log"); pg.wait_for_selector("[data-testid=suit]")
    hints = pg.locator("[data-testid=suit-hint]")
    check(pg.locator("[data-testid=suit-earned]").count() == 1 and hints.count() == 2, "Suit: one earned perk, two hints")
    check(hints.nth(0).get_attribute("data-level") == "0" and hints.nth(1).get_attribute("data-level") == "2", "Hints carry their fade level")
    check(float(pg.evaluate("getComputedStyle(document.querySelectorAll('[data-testid=suit-hint]')[1]).opacity")) < float(pg.evaluate("getComputedStyle(document.querySelectorAll('[data-testid=suit-hint]')[0]).opacity")), "A faded hint looks fainter")
    pg.fill("[data-testid=suit-tint]", "#ff00aa"); pg.wait_for_timeout(300)
    check(puts and puts[-1]["tint"] == "#ff00aa", f"Choosing a colour saves it {puts[-1:]}")
    check(pg.evaluate("document.documentElement.getAttribute('data-tint')") == "1" and pg.evaluate("document.documentElement.style.getPropertyValue('--own-tint')") == "#ff00aa", "…and applies it at once")
    # tint survives a reload (applied from the saved choice at login)
    pg.reload(); pg.wait_for_selector("[data-testid=suit]"); pg.wait_for_timeout(300)
    check(pg.evaluate("document.documentElement.getAttribute('data-tint')") == "1", "…and after a reload")
    SUIT["items"][0]["earned"] = True
    # frame: earn then wear
    SUIT["items"][1] = {"key": "frame-spark", "title": "Spark frame", "earned": True, "perk": "A glowing frame."}
    pg.reload(); pg.wait_for_selector("[data-testid=suit-frame-frame-spark]"); pg.click("[data-testid=suit-frame-frame-spark]"); pg.wait_for_timeout(300)
    check(puts[-1]["frame"] == "frame-spark" and "Wearing" in pg.inner_text("[data-testid=suit-frame-frame-spark]"), "Wearing a frame saves the choice")
    # profile shows frame
    pg.goto(f"{BASE}/u/neo"); pg.wait_for_selector("[data-testid=profile-avatar]")
    check("avatar-frame-spark" in (pg.get_attribute("[data-testid=profile-avatar]", "class") or "") and "rgb(255, 211, 107)" in pg.evaluate("getComputedStyle(document.querySelector('[data-testid=profile-avatar]')).boxShadow"), "A profile shows the frame its owner wears")
    # earning announces itself
    scan_body["v"] = {"earned": ["Probe tint"]}
    p2 = mk(); p2.goto(f"{BASE}/study/mine-1"); p2.wait_for_selector(".probe-point"); p2.keyboard.press("i"); p2.hover("a[href$='/album/al1']"); p2.wait_for_selector("[data-testid=probe-card]", timeout=4000); p2.wait_for_timeout(700)
    check("Suit upgrade: Probe tint" in p2.inner_text("body"), "Earning an upgrade while scanning shows a toast")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
