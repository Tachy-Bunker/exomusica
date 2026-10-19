import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Map checks (fix409, P7): the admin map lists what is wrong, and Open selects the room.
NODES = [
    {"id": 1, "parentId": None, "slug": "core", "name": "Core"},
    {"id": 2, "parentId": 1, "slug": "a", "name": "A"},
    {"id": 3, "parentId": None, "slug": "b", "name": "B"},
    {"id": 4, "parentId": 1, "slug": "s", "name": "S", "secret": True, "key": "", "gate": ""},
]
HOME = {"branches": [{"slug": n["slug"], "name": n["name"], "tracks": 2, "albums": 1, "parentSlug": None} for n in NODES], "activity": [], "stats": {"members": 1, "tracks": 6, "studies": 0, "branches": 4}}
LINKS = [{"id": 1, "fromSlug": "core", "toSlug": "ghost", "kind": "lift", "gate": ""}]
MILES = [{"key": "m-ring", "title": "Second ring", "perk": "p", "metric": "BRANCHES", "label": "b", "target": 2, "now": 3, "reached": True, "reachedAt": None, "live": True}]
CORE_DOC = {"v": 1, "version": 1, "actors": [{"id": "x", "kind": "solid", "name": "crate", "x": 0, "z": 0, "w": 0.5, "d": 0.5, "h": 1, "rot": 0, "sides": 0, "color": "#ffffff", "on": True, "pulse": 0, "text": "", "lore": "", "img": 0, "mode": 0, "visor": False, "prop": "", "gate": "", "gateOff": False}],
            "wires": [{"from": "x", "ev": "start", "to": "ghost", "msg": "toggle", "delay": 0, "once": False, "arg": ""}]}

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/home": return ok(HOME)
        if key == "/api/milestones": return ok(MILES)
        if key == "/api/map-links": return ok(LINKS)
        if key == "/api/map-overrides": return ok([])
        if key == "/api/room-doc/core": return ok({"version": 1, "doc": CORE_DOC})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": None})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/admin/map-layout"); pg.wait_for_selector("[data-testid=maplayout-checks]", timeout=10000)
    pg.wait_for_selector("[data-testid=maplayout-check-0]", timeout=8000)
    rows = pg.locator("[data-testid^=maplayout-check-][data-level]")
    texts = [rows.nth(i).inner_text() for i in range(rows.count())]
    print("rows:", len(texts), flush=True)
    check(any("No walk path from the Core" in t and "b" in t.lower() for t in texts), "a room no walk reaches is listed as an error")
    check(any("Lift to ghost" in t for t in texts), "a lift to a missing room is listed")
    check(any("A wire joins ghost" in t for t in texts), "a wire to a missing actor is listed")
    check(any("Sealed room with no gate" in t for t in texts), "a sealed room with no gate is listed as a warning")
    levels = [rows.nth(i).get_attribute("data-level") for i in range(rows.count())]
    check(levels == sorted(levels, key=lambda x: {"error": 0, "warn": 1, "info": 2}[x]), "errors come first")
    check("errors" in pg.inner_text("[data-testid=maplayout-checks] h3"), "the heading counts the problems")
    # Open selects the room: the walk-path row is for room b; its Warp link then shows
    idx = next(i for i, t in enumerate(texts) if "No walk path from the Core" in t)
    pg.click(f"[data-testid=maplayout-check-open-{idx}]"); pg.wait_for_timeout(400)
    href = pg.locator("[data-testid=maplayout-warp]").first.get_attribute("href") if pg.locator("[data-testid=maplayout-warp]").count() else ""
    check(href == "/branch/b/room", f"Open selects the room the check is about ({href})")
    check(not errs, f"no page errors ({errs[:3]})")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
