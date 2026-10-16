import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
_t = open(D + "/e2e_fix352.py").read(); exec(_t.split("\ndef run(pw):")[0])  # the shared fixtures: NODES, HOME, ALBUMS, DATA, BASE, ADMIN

# The scan visor: a mode you stay in. X turns it on, Space scans what the reticle is on, the result opens over the room,
# the logbook entry is one level deeper (Space), B goes back a level, X leaves the visor. Idle, things in view are outlined:
# purple until they are in the logbook, green after.
SCAN_PAT = {"green": (125, 255, 158), "purple": (180, 139, 255)}

def run(pw):
    b = pw.chromium.launch(args=["--enable-precise-memory-info", "--js-flags=--expose-gc"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(size=(1100, 760)):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN}))
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/home": return ok(HOME)
            if re.match(r"^/api/branches/([^/]+)/albums$", key): return ok(ALBUMS)
            m = re.match(r"^/api/branches/([^/]+)$", key)
            if m:
                n = next((x for x in NODES + [{"id": 99, "slug": "solo", "name": "Solo", "parentId": None}] if x.get("slug") == m.group(1)), None)
                if not n: return ok({"error": "nope"}, 404)
                return ok({"id": n["id"], "slug": n["slug"], "name": n["name"], "description": "d", "coverArtUrl": None, "parentId": n["parentId"], "channel": {"id": 9, "slug": "chat-" + n["slug"]}})
            if key.endswith("/messages") or key.endswith("/participants") or key in ("/api/emojis", "/api/recent-messages", "/api/online"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs

    S = "[data-testid=room-stage]"
    at = lambda pg, k: pg.get_attribute(S, "data-" + k)
    posts = []
    def setup():
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        MS = [{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True},
              {"key": "m-visor", "title": "Echo visor", "perk": "x", "metric": "SCANS", "label": "s", "target": 1500, "now": 1600, "reached": True, "reachedAt": None, "live": True}]
        LORE = [{"id": 1, "key": "room:core/door/b2", "title": "The first door", "body": "It hums at night. Stand still and you can hear it answer."}]
        def h(route):
            u = route.request.url; ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if "/api/milestones" in u: return ok(MS)
            if "/api/lore" in u: return ok(LORE)
            if "/api/scans" in u:
                if route.request.method == "POST": posts.append(json.loads(route.request.post_data)); return route.fulfill(status=204)
                return ok([])
            return route.fallback()
        pg.context.route(re.compile(r".*/api/(milestones|lore|scans).*"), h)
        return pg, errs

    # the visor's colours: read the overlay's pixels and count the outline colours
    COUNT_JS = """() => { const c = document.querySelector('[data-testid=room-hud]'); if (!c) return [0, 0];
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let g = 0, p = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (Math.abs(r - 125) < 30 && Math.abs(gg - 255) < 30 && Math.abs(bb - 158) < 30) g++;
        else if (Math.abs(r - 180) < 30 && Math.abs(gg - 139) < 30 && Math.abs(bb - 255) < 30) p++; }
      return [g, p]; }"""
    SCAN_BTN = "[data-testid=room-scan]"

    pg, errs = setup(); posts.clear()
    pg.goto(f"{BASE}/branch/core/room"); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(500); pg.keyboard.up("KeyW"); pg.wait_for_timeout(150)

    # ---- enter the visor and look at what is in view
    check(pg.get_attribute(SCAN_BTN, "aria-pressed") == "false", "Combat visor to start with")
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(700)
    check(pg.get_attribute(SCAN_BTN, "aria-pressed") == "true" and "Combat visor" in pg.inner_text(SCAN_BTN), "X turns the scan visor on and stays in it")
    g0, p0 = pg.evaluate(COUNT_JS)
    check(p0 > 0 and g0 == 0, f"Idle: unscanned things in view are outlined in purple (purple {p0} px, green {g0} px)")

    # ---- a scan: Space, the scanning animation, then the result
    pg.keyboard.press("Enter"); pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.scan", timeout=900)
    pg.wait_for_selector("[data-testid=scan-screen]", timeout=6000)
    view = pg.get_attribute("[data-testid=scan-screen]", "data-view"); txt = pg.inner_text("[data-testid=scan-screen]")
    check(view == "result" and "the first door" in txt.lower(), f"The scan opens its result over the room ({view}, {txt[:60]!r})")
    check(any(bb["kind"] == "lore" and bb["key"] == "room:core/door/b2" for bb in posts), f"The scan is recorded on the account ({posts})")
    check("It hums at night." in txt and "Stand still" not in txt, "The result shows only the first sentence")

    # ---- the room stands still while the screen is open
    x0 = at(pg, "x"); pg.keyboard.down("KeyW"); pg.wait_for_timeout(400); pg.keyboard.up("KeyW")
    check(at(pg, "x") == x0 and pg.locator("[data-testid=scan-screen]").count() == 1, "The room keeps still while the scan screen is open")

    # ---- Space: the logbook entry, one level deeper; B: back a level, then back to the scanner
    pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    view = pg.get_attribute("[data-testid=scan-screen]", "data-view"); txt = pg.inner_text("[data-testid=scan-screen]")
    check(view == "entry" and "It hums at night." in txt, "Space opens the logbook entry, one level deeper")
    pg.keyboard.press("KeyB"); pg.wait_for_timeout(250)
    check(pg.get_attribute("[data-testid=scan-screen]", "data-view") == "result", "B goes back to the result")
    pg.keyboard.press("KeyB"); pg.wait_for_timeout(250)
    check(pg.locator("[data-testid=scan-screen]").count() == 0 and pg.get_attribute(SCAN_BTN, "aria-pressed") == "true", "B goes back to the scanner, still in the scan visor")

    # ---- what is scanned turns green, and a second scan of it opens the entry straight away
    pg.wait_for_timeout(1300); g1, p1 = pg.evaluate(COUNT_JS)
    check(g1 > 0, f"Scanned things in view are outlined in green (green {g1} px, purple {p1} px)")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    check(pg.get_attribute("[data-testid=scan-screen]", "data-view") == "entry", "Space on a scanned thing opens its entry")

    # ---- X leaves the visor from the screen
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=scan-screen]").count() == 0 and pg.get_attribute(SCAN_BTN, "aria-pressed") == "false", "X closes the screen and leaves the scan visor")

    # ---- the buttons do the same as the keys (the bar's button, and the screen's)
    pg.click(SCAN_BTN); pg.wait_for_timeout(300)
    check(pg.get_attribute(SCAN_BTN, "aria-pressed") == "true", "The Scan visor button turns the visor on")
    pg.click(SCAN_BTN); pg.wait_for_timeout(300)
    check(pg.get_attribute(SCAN_BTN, "aria-pressed") == "false", "…and off again")

    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
