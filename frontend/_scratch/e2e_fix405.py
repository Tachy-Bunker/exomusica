import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# The lift (fix405): the pad in every room opens a cabin with the open rooms; choosing one rides the tube to a platform, where the far door leads on.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}, {"id": 2, "parentId": 1, "slug": "vault", "name": "Vault"}]

def click_text(pg, text):
    return pg.evaluate("(t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (!b) return false; b.click(); return true; }", text)
def stage(pg, name):
    return pg.evaluate("(n) => document.querySelector('[data-testid=room-stage]')?.dataset[n] ?? null", name)
def click_id(pg, tid):
    return pg.evaluate("(t) => { const b = document.querySelector(`[data-testid=${t}]`); if (!b) return false; b.click(); return true; }", tid)
def panel(pg):
    return pg.evaluate("() => !!document.querySelector('[data-testid=lift-panel]')")

def session(pw, visits):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(visits))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/milestones": return ok([])
        if key.endswith("/albums"): return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": None})
        if key == "/api/branches/vault": return ok({"id": 2, "slug": "vault", "name": "Vault", "description": "d", "coverArtUrl": None, "parentId": 1, "channel": None})
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}, {"slug": "vault", "name": "Vault", "tracks": 1, "albums": 0, "parentSlug": "core"}], "activity": [], "stats": {"members": 3, "tracks": 2, "studies": 0, "branches": 2}})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    pg.wait_for_timeout(900)
    return b, ctx, pg, errs

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)

    b, ctx, pg, errs = session(pw, ["core", "vault"])
    check(stage(pg, "lift") == "1", "the Core has a lift pad")
    check(stage(pg, "ride") in (None, ""), "no ride in the Core")
    check(click_id(pg, "lift-pad"), "the lift pad is reachable from the list")
    pg.wait_for_timeout(500)
    check(panel(pg), "stepping onto the pad opens the cabin")
    check(pg.locator("[data-testid=lift-to-vault]").count() == 1, "the cabin lists the open Vault")
    check(pg.locator("[data-testid=lift-to-core]").count() == 0, "the cabin does not list the room you are in")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    check(not panel(pg), "closing the cabin with Escape closes it")
    check(stage(pg, "room") == "core", "closing the cabin leaves you in the Core")
    pg.wait_for_timeout(600)
    check(not panel(pg), "standing on the pad after closing does not reopen the cabin")
    check(click_id(pg, "lift-pad") and pg.wait_for_selector("[data-testid=lift-panel]", timeout=3000) is not None, "the pad opens again on use")
    check(click_id(pg, "lift-to-vault"), "choosing the Vault in the cabin")
    t0 = time.time(); seen_ride = False; room_ok = False
    for _ in range(80):
        pg.wait_for_timeout(250)
        if stage(pg, "ride") == "1": seen_ride = True
        if (stage(pg, "room") or "").startswith("lift.core.vault"): room_ok = True; break
    check(room_ok, f"the ride starts in the lift tube ({stage(pg, 'room')!r})")
    check(seen_ride, "the tube is marked as a ride while you are carried")
    check(stage(pg, "lift") == "", "the tube has no pad of its own")
    # the ride carries you without input, to the platform, and then stops
    ride_done = False
    for _ in range(120):
        pg.wait_for_timeout(250)
        if stage(pg, "ride") == "": ride_done = True; break
    took = time.time() - t0
    check(ride_done, f"the ride ends at the platform on its own ({took:.1f} s)")
    check(3 < took < 25, f"the ride takes a few seconds ({took:.1f} s)")
    # walk on to the far door: the room behind it is already waiting, so you arrive in the Vault
    pg.keyboard.down("KeyW"); arrived = False
    for _ in range(30):
        pg.wait_for_timeout(250)
        if stage(pg, "room") == "vault": arrived = True; break
    pg.keyboard.up("KeyW")
    check(arrived, f"walking through the far door takes you to the Vault ({stage(pg, 'room')!r})")
    check(not errs, f"no page errors ({errs[:3]})")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")

with sync_playwright() as pw:
    run(pw)
