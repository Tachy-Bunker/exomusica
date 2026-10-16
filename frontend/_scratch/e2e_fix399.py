import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# The site computer: a room prop that opens this branch's site list (the page, XenoLab, the Log) as a terminal.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]

def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN}))
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key == "/api/chart": return ok(NODES)
        if key == "/api/branches/core/albums": return ok([])
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 0, "albums": 0, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 0, "studies": 0, "branches": 1}})
        if key == "/api/milestones": return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": {"id": 9, "slug": "chat-core"}})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key.startswith("/api/channels/"): return ok([])
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000); pg.wait_for_timeout(900)

    n_computer = pg.evaluate("() => document.querySelectorAll('[data-prop=computer]').length")
    check(n_computer == 1, f"the room has one site computer ({n_computer})")
    check(pg.evaluate("() => !!document.querySelector('[data-prop=terminal]')"), "the Talk terminal is still there")

    # open it: stand in front of it and interact
    pg.evaluate("() => document.querySelector('[data-prop=computer]').click()"); pg.wait_for_timeout(250)
    pg.keyboard.press("KeyF")
    try:
        pg.wait_for_selector("[data-testid=room-terminal]", timeout=4000); opened = True
    except Exception:
        opened = False
    check(opened, "interacting with the site computer opens a terminal")
    if opened:
        title = pg.inner_text("[data-testid=room-terminal]")
        check("site" in title.lower(), "the terminal is the site terminal")
        check(pg.query_selector("[data-testid=room-terminal] [data-testid=logbook-site-wiki]") is not None, "it lists the Log")
        check(pg.query_selector("[data-testid=room-terminal] [data-testid=logbook-site-xenolab]") is not None, "and XenoLab")
        pg.click("[data-testid=logbook-site-wiki]"); pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
        check(pg.query_selector("[data-testid=room-terminal]") is None, "opening a site from it goes straight to the page terminal")
        pg.click("[data-testid=terminal-close]"); pg.wait_for_timeout(400)
        check(pg.query_selector("[data-testid=page-terminal]") is None and pg.query_selector("[data-testid=room-stage]") is not None, "closing the page brings you back into the room")

    # the Talk terminal still opens the chat
    pg.evaluate("() => document.querySelector('[data-prop=terminal]').click()"); pg.wait_for_timeout(250)
    pg.keyboard.press("KeyF")
    try:
        pg.wait_for_selector("[data-testid=room-terminal]", timeout=4000); talk = "talk" in pg.inner_text("[data-testid=room-terminal]").lower()
    except Exception:
        talk = False
    check(talk, "the Talk terminal still opens the chat")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    check(not errs, f"the room raised no page errors ({errs[:3]})")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
