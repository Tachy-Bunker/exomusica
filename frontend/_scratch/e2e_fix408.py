import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Milestone test states (fix408, P8): the draft test shows the room under the milestones as they are, all reached, or none reached. Doors and gated actors follow the state; nothing is saved.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}, {"id": 2, "parentId": 1, "slug": "vault", "name": "Vault", "gate": "m-gate", "secret": True, "key": "j8344v"}]
HOME = {"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}], "activity": [], "stats": {"members": 1, "tracks": 2, "studies": 0, "branches": 1}}
MILES = [{"key": "m-ring", "title": "Second ring", "perk": "p", "metric": "BRANCHES", "label": "b", "target": 2, "now": 3, "reached": True, "reachedAt": None, "live": True},
         {"key": "m-gate", "title": "The gate", "perk": "p", "metric": "TRACKS", "label": "t", "target": 5, "now": 2, "reached": False, "reachedAt": None, "live": True}]
ROOM = {"v": 1, "version": 1, "actors": [
    {"id": "m", "kind": "marker", "x": 0, "z": -3, "name": "start", "w": 0.6, "d": 0.6, "h": 1.6, "on": True, "color": "#7a8cff"},
    {"id": "g", "kind": "light", "x": -2, "z": 2, "name": "gated lamp", "w": 1, "d": 1, "h": 2.4, "on": True, "color": "#ffd27a", "gate": "m-gate", "gateOff": False}],
    "wires": []}

def stage(pg, name):
    return pg.evaluate("(n) => document.querySelector('[data-testid=room-stage]')?.dataset[n] ?? null", name)

def settle(pg, name, want, timeout=4000):
    end = __import__("time").time() + timeout / 1000
    while __import__("time").time() < end:
        if stage(pg, name) == want: return True
        pg.wait_for_timeout(100)
    return stage(pg, name) == want

def run(pw):
    out = []; saves = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core', 'vault']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        if route.request.method != "GET" and "/room-doc/" in key: saves.append(route.request.method + " " + key)
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/milestones": return ok(MILES)
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
    pg.wait_for_timeout(800)
    # the Core's doors: the Hull door (locked here: its own visit state) and the sealed Vault door (gated by m-gate, not reached); the gated lamp is shut away
    pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=re-ms]", timeout=6000)
    check(pg.input_value("[data-testid=re-ms]") == "asis" and stage(pg, "ms") == "asis", "the editor opens on as is")
    check(settle(pg, "shut", "1"), f"as is: the gated lamp is shut away (shut {stage(pg, 'shut')})")
    check(stage(pg, "doorsOpen") == "0" and stage(pg, "doorsLocked") == "2", f"as is: both doors locked (open {stage(pg, 'doorsOpen')}, locked {stage(pg, 'doorsLocked')})")
    pg.select_option("[data-testid=re-ms]", "all")
    check(settle(pg, "doorsOpen", "1") and stage(pg, "doorsLocked") == "1", f"all reached: the Vault door opens (open {stage(pg, 'doorsOpen')}, locked {stage(pg, 'doorsLocked')})")
    check(settle(pg, "shut", "0"), f"all reached: the gated lamp is no longer shut (shut {stage(pg, 'shut')})")
    pg.select_option("[data-testid=re-ms]", "none")
    check(settle(pg, "doorsOpen", "0") and stage(pg, "doorsLocked") == "2", f"none reached: both doors locked (open {stage(pg, 'doorsOpen')}, locked {stage(pg, 'doorsLocked')})")
    check(settle(pg, "shut", "1"), f"none reached: the gated lamp is shut again (shut {stage(pg, 'shut')})")
    # the draft test runs under the chosen state, and stays clean
    pg.click("[data-testid=re-play]"); pg.wait_for_timeout(600)
    pg.select_option("[data-testid=re-ms]", "all")
    check(settle(pg, "doorsOpen", "1") and settle(pg, "shut", "0"), "changing the state while testing opens the Vault door and the lamp")
    pg.click("[data-testid=re-play]"); pg.wait_for_timeout(400)
    pg.select_option("[data-testid=re-ms]", "asis")
    check(settle(pg, "doorsOpen", "0") and settle(pg, "shut", "1"), "back to as is: the Vault door and the lamp are as they were")
    # closing the editor puts the milestones back as they are, even if the state was left on all
    pg.select_option("[data-testid=re-ms]", "all"); pg.wait_for_timeout(500)
    pg.click("[data-testid=re-close]")
    check(settle(pg, "ms", "asis") and settle(pg, "doorsOpen", "0") and settle(pg, "shut", "1"), "closing the editor restores as is")
    check(stage(pg, "room") == "core", "the room is still core")
    check(not saves, f"no room save happened ({saves[:3]})")
    check(not errs, f"no page errors ({errs[:3]})")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
