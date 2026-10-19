import json, re, sys, os, math
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# The scan visor (fix404): right click scans (Space is jump and never scans); the target prompt and the bottom hint name the right click; on touch the Use button is Scan.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}]
S = "[data-testid=room-stage]"
at = lambda pg, k: pg.get_attribute(S, "data-" + k)

def art(i, x, z, **kw):
    o = {"id": i, "kind": "artifact", "name": "Art " + i, "x": x, "z": z, "w": 0.8, "d": 0.1, "h": 0.8, "rot": 0, "sides": 0, "color": "#00ff00", "on": True, "pulse": 0, "text": "", "lore": "", "img": 0, "mode": 0, "visor": False}
    o.update(kw); return o

def session(pw, touch, doc_actors_fn):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 760} if touch else {"width": 1100, "height": 760}, service_workers="block", has_touch=touch, is_mobile=touch)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/branches/core/albums": return ok(ALBUMS)
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": None})
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 2, "studies": 0, "branches": 1}})
        if key == "/api/milestones": return ok([])
        if key.startswith("/api/room-doc/"): return ok({"version": 1, "doc": {"v": 1, "version": 1, "actors": doc_actors_fn(), "wires": [], "tex": [], "floor": [], "bands": [], "grade": None}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S, timeout=8000); pg.wait_for_timeout(900)
    return b, ctx, pg, errs

def centre(pg):
    bb = pg.locator(S).bounding_box(); return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)

    # ---- desktop: the room has a note to scan ahead of the spawn point
    actors = {"v": None}
    def doc_actors():
        return actors["v"]() if actors["v"] else []
    b, ctx, pg, errs = session(pw, False, doc_actors)
    x0, z0, yaw = float(at(pg, "x")), float(at(pg, "z")), float(at(pg, "yaw"))
    ax, az = round(x0 + math.cos(yaw) * 1.6, 2), round(z0 + math.sin(yaw) * 1.6, 2)
    actors["v"] = lambda: [art("a", ax, az, rot=yaw + math.pi, name="Drain note", lore="They fell for nine years.")]
    pg.reload(); pg.wait_for_selector(S, timeout=8000); pg.wait_for_timeout(900)
    x0, z0, yaw = float(at(pg, "x")), float(at(pg, "z")), float(at(pg, "yaw"))
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(400)
    hint = pg.inner_text(".rm-hint")
    check("Right click" in hint and "Space jump" in hint and "Enter scans" in hint, f"the scan hint names the right click, and Space stays jump ({hint!r})")
    check("Enter scan · Space jump" not in hint, "the old 'Enter scan' hint is gone")
    # Space jumps and never scans: holding Space on the visor does not open a scan
    pg.keyboard.press("Space"); pg.wait_for_timeout(1500)
    check(pg.locator("[data-testid=scan-screen]").count() == 0, "Space does not start a scan")
    # right click starts the scan; the scan screen opens when it completes
    cx, cy = centre(pg); pg.mouse.click(cx, cy, button="right"); pg.wait_for_timeout(200)
    ok_scan = False
    try:
        pg.wait_for_selector("[data-testid=scan-screen]", timeout=6000); ok_scan = True
    except Exception:
        pass
    check(ok_scan, "right click scans the target on the scan visor")
    if ok_scan: pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(300)   # back to the combat visor / walk
    # walk mode: right click still locks on (no scan)
    pg.mouse.click(cx, cy, button="right"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=scan-screen]").count() == 0, "in walk mode the right button does not scan")
    check(not [e for e in errs if "Cannot read" in e or "undefined" in e], f"no render errors ({errs[:2]})")
    check(not errs, f"no page errors on desktop ({errs[:3]})")
    ctx.close(); b.close()

    # ---- touch: no right button; the Use button is Scan on the scan visor, and the hint says so
    b, ctx, pg, errs = session(pw, True, lambda: [])
    pg.locator("[data-testid=room-scan]").first.click(); pg.wait_for_timeout(400)
    use_label = pg.inner_text("[data-testid=room-use]")
    check("scan" in use_label.lower(), f"on touch the Use button reads Scan on the scan visor ({use_label!r})")
    hint = pg.inner_text(".rm-hint")
    check("Scan button scans" in hint, f"the touch hint says the Scan button scans ({hint!r})")
    check(not errs, f"no page errors on touch ({errs[:3]})")
    ctx.close(); b.close()

    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
