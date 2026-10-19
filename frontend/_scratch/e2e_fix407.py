import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Counter and switch (fix407, P40): logic actors. The room loads with them, starts their wires, and keeps running without errors. Their logic is covered by _scratch/counter.test.ts.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
HOME = {"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}], "activity": [], "stats": {"members": 1, "tracks": 2, "studies": 0, "branches": 1}}
ROOM = {"v": 1, "version": 1, "actors": [
    {"id": "m", "kind": "marker", "x": 0, "z": -3, "name": "start", "w": 0.6, "d": 0.6, "h": 1.6, "on": True, "color": "#7a8cff"},
    {"id": "c", "kind": "counter", "count": 2, "x": 0, "z": 2, "name": "counter", "w": 1, "d": 1, "h": 0, "on": True, "color": "#7affc8"},
    {"id": "s", "kind": "switch", "x": 2, "z": 2, "name": "switch", "w": 1, "d": 1, "h": 0, "on": False, "color": "#ffd27a"},
    {"id": "l", "kind": "light", "x": -2, "z": 2, "name": "lamp", "w": 1, "d": 1, "h": 2.4, "on": False, "color": "#ffd27a"}],
    "wires": [
        {"from": "m", "ev": "start", "to": "c", "msg": "count", "delay": 0, "once": False},
        {"from": "m", "ev": "start", "to": "c", "msg": "count", "delay": 0.2, "once": False},
        {"from": "c", "ev": "reached", "to": "l", "msg": "toggle", "delay": 0, "once": False},
        {"from": "c", "ev": "reached", "to": "s", "msg": "toggle", "delay": 0, "once": False},
        {"from": "s", "ev": "shown", "to": "l", "msg": "show", "delay": 0, "once": False}]}

def stage(pg, name):
    return pg.evaluate("(n) => document.querySelector('[data-testid=room-stage]')?.dataset[n] ?? null", name)

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/milestones": return ok([])
        if key == "/api/map-links": return ok([])
        if key == "/api/map-overrides": return ok([])
        if key == "/api/home": return ok(HOME)
        if key.endswith("/albums"): return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": None})
        if key == "/api/room-doc/core": return ok({"version": 1, "doc": ROOM})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    pg.wait_for_timeout(1500)
    check(stage(pg, "room") == "core", "the room with a counter and a switch loads")
    check(stage(pg, "lift") == "1", "the room still has its lift pad")
    # the wires run on start: the counter reaches 2, then the light and the switch toggle; the room keeps running
    pg.wait_for_timeout(2500)
    check(stage(pg, "room") == "core", "the room keeps running after its wires have run")
    check(not errs, f"no page errors ({errs[:3]})")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
