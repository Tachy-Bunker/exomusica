import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Inscriptions: a logbook entry can name a Log page as [label](/wiki/slug); it opens in the room's terminal. Other [text](/path) stays as written.
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
        if key == "/api/wiki/opening": return ok({"id": 1, "slug": "opening", "title": "The opening", "contentMarkdown": "The first entry.", "font": None})
        if key == "/api/branches/core/albums": return ok([])
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 0, "albums": 0, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 0, "studies": 0, "branches": 1}})
        if key == "/api/milestones": return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "Read [the opening](/wiki/opening) first. Then [home](/topic/x) stays plain, and [XenoLab](/xenolab) is a link.", "coverArtUrl": None, "parentId": None, "channel": {"id": 9, "slug": "chat-core"}})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key.startswith("/api/channels/"): return ok([])
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000); pg.wait_for_timeout(900)

    # scan the inscription on the wall: visor on, face it, scan, read the logbook entry
    check(pg.evaluate("() => !!document.querySelector('[data-testid=face-plaque]')"), "the room has an inscription on a wall")
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(250)
    pg.evaluate("() => document.querySelector('[data-testid=face-plaque]').click()"); pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    try:
        pg.wait_for_selector("[data-testid=scan-screen]", timeout=8000); scanned = True
    except Exception:
        scanned = False
    if not scanned:
        pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
        scanned = pg.query_selector("[data-testid=scan-screen]") is not None
    check(scanned, "scanning the inscription opens the scan result")
    if scanned:
        if pg.get_attribute("[data-testid=scan-screen]", "data-view") == "result":
            pg.click("[data-testid=scan-logbook]"); pg.wait_for_timeout(200)
        check(pg.get_attribute("[data-testid=scan-screen]", "data-view") == "entry", "the logbook entry opens")
        links = pg.eval_on_selector_all(".scan-link", "els => els.map(e => e.textContent)")
        check(links == ["the opening ↗", "XenoLab ↗"], f"the Log and XenoLab links are buttons in the entry ({links})")
        check("[home](/topic/x)" in pg.inner_text("[data-testid=scan-screen]"), "a link to somewhere the terminal does not show stays as written")
        pg.click(".scan-link"); pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
        check(pg.query_selector("[data-testid=scan-screen]") is None, "the scan closes when the page opens")
        fr = pg.query_selector("[data-testid=terminal-frame]").content_frame()
        fr.wait_for_selector("[data-testid=terminal-main]", timeout=8000)
        check(fr.evaluate("() => location.pathname") == "/wiki/opening", "the Log page opens in the room's terminal")
        pg.click("[data-testid=terminal-close]"); pg.wait_for_timeout(400)
        check(pg.query_selector("[data-testid=page-terminal]") is None and pg.query_selector("[data-testid=room-stage]") is not None, "closing it brings you back into the room")

    check(not errs, f"the room raised no page errors ({errs[:3]})")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
