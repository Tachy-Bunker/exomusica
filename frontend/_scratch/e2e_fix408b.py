import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# The admin map's room panel has a Warp link (fix408): it opens the selected room in a new tab, with no entry door.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}, {"id": 2, "parentId": 1, "slug": "vault", "name": "Vault"}]
HOME = {"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}, {"slug": "vault", "name": "Vault", "tracks": 2, "albums": 1, "parentSlug": "core"}], "activity": [], "stats": {"members": 1, "tracks": 4, "studies": 0, "branches": 2}}

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
        if key == "/api/milestones": return ok([])
        if key == "/api/map-links": return ok([])
        if key == "/api/map-overrides": return ok([])
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/admin/map-layout"); pg.wait_for_selector("[data-testid=maplayout-canvas]", timeout=10000)
    pg.wait_for_timeout(800)
    check(pg.locator("[data-testid=maplayout-warp]").count() == 0, "no warp link before a room is selected")
    box = pg.locator("[data-testid=maplayout-canvas]").bounding_box()
    found = False
    for fx in [0.5, 0.42, 0.58, 0.35, 0.65]:
        for fy in [0.5, 0.42, 0.58, 0.35, 0.65]:
            pg.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy); pg.wait_for_timeout(120)
            if pg.locator("[data-testid=maplayout-warp]").count():
                found = True; break
        if found: break
    check(found, "clicking a room on the map selects it and shows the warp link")
    if found:
        link = pg.locator("[data-testid=maplayout-warp]").first
        href = link.get_attribute("href") or ""
        check(re.fullmatch(r"/branch/[a-z0-9-]+/room", href) is not None, f"the link goes to a room page ({href})")
        check(link.get_attribute("target") == "_blank", "it opens in a new tab")
    check(not errs, f"no page errors ({errs[:3]})")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
