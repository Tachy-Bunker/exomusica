import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# The Hull (fix402): the Core has a door to the Hull, open once the Hull milestone is reached. The Hull is a ring hall with one door per milestone:
# a lit door (reached) and a dark one (not yet). Walking into a milestone door, or using it, shows its card.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}]
def ms(key, title, reached, now, target):
    return {"key": key, "title": title, "perk": "Perk of " + title, "metric": "TRACKS", "label": "tracks", "target": target, "now": now, "reached": reached, "reachedAt": None, "live": True}
def milestones(hull_reached):
    return [ms("m-roll", "Roll call", True, 30, 25), ms("m-tracks", "First hundred", False, 40, 100), ms("m-scans", "Wide lens", True, 900, 500), ms("m-hull", "Hull", hull_reached, 24 if hull_reached else 10, 24)]

def click_text(pg, text):
    return pg.evaluate("(t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (!b) return false; b.click(); return true; }", text)
def room(pg):
    return pg.evaluate("() => document.querySelector('[data-testid=room-stage]')?.dataset.room || ''")
def link(pg):
    return pg.evaluate("() => document.querySelector('[data-testid=room-stage]')?.dataset.link || ''")
def card(pg):
    return pg.evaluate("() => { const c = document.querySelector('[data-testid=milestone-card]'); return c ? { key: c.dataset.key, reached: c.dataset.reached } : null; }")

def session(pw, hull_reached, check, errs_out):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
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
        if key == "/api/milestones": return ok(milestones(hull_reached))
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    pg.wait_for_timeout(800)
    return b, ctx, pg, errs

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)

    # ---- run 1: the Hull milestone reached: the door is lit, and the way opens
    b, ctx, pg, errs = session(pw, True, check, None)
    check(pg.locator("button", has_text="Face the door to The Hull").count() == 1, "the Core has a lit door to the Hull once the Hull milestone is reached")
    check(click_text(pg, "Walk up to: The Hull"), "walk up to the Hull door")
    pg.wait_for_timeout(300)
    pg.keyboard.press("KeyF"); pg.wait_for_timeout(1200)   # first use: the Hull is loaded
    pg.keyboard.press("KeyF")                               # second use: the corridor opens
    try:
        pg.wait_for_function("() => (document.querySelector('[data-testid=room-stage]')?.dataset.link || '').startsWith('hull.core')", timeout=6000); opened = True
    except Exception:
        opened = False
    check(opened, f"using the lit door opens the corridor to the Hull (link {link(pg)!r})")
    pg.keyboard.down("KeyW")
    entered = False
    for _ in range(40):
        pg.wait_for_timeout(300)
        if room(pg) == "hull.core": entered = True; break
    pg.keyboard.up("KeyW")
    check(entered, f"walking forward takes you into the Hull (room {room(pg)!r})")
    check(pg.url.endswith("/branch/core/room"), f"the address stays the Core's room while you are in the Hull ({pg.url.split('//')[-1]})")

    # the milestone doors: a lit one shows its card with reached = 1, a dark one with reached = 0
    check(click_text(pg, "Walk up to: Roll call"), "walk up to a lit milestone door in the Hull")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(300)
    c = card(pg)
    check(c == {"key": "m-roll", "reached": "1"}, f"a lit milestone door shows its card ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(card(pg) is None, "Escape closes the card")
    check(click_text(pg, "Walk up to: First hundred"), "walk up to a dark milestone door")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(300)
    c = card(pg)
    check(c == {"key": "m-tracks", "reached": "0"}, f"a dark milestone door shows its card with the progress ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(not [e for e in errs if "Cannot read" in e or "undefined" in e], f"no render errors in the Hull ({errs[:2]})")
    # walking into a dark milestone door (no key but the walk) shows its card too
    check(click_text(pg, "Walk up to: First hundred"), "walk up to the dark door again")
    pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(1200); pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    c = card(pg)
    check(bool(c) and c.get("key") == "m-tracks", f"walking into a dark milestone door shows its card ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # the way back: the Hull's door to the Core
    check(click_text(pg, "Walk up to: Core"), "walk up to the way back to the Core")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(1200); pg.keyboard.press("KeyF")
    pg.keyboard.down("KeyW")
    back = False
    for _ in range(40):
        pg.wait_for_timeout(300)
        if room(pg) == "core": back = True; break
    pg.keyboard.up("KeyW")
    check(back, f"walking back out of the Hull returns you to the Core (room {room(pg)!r})")
    check(not errs, f"no page errors in the first run ({errs[:3]})")
    ctx.close(); b.close()

    # ---- run 2: the Hull milestone not reached: the Core's door is dark, its card shows the progress, nothing opens
    b, ctx, pg, errs = session(pw, False, check, None)
    check(pg.locator("button", has_text="Face the milestone: Hull").count() == 1, "the Core's door to the Hull is dark until the Hull milestone is reached")
    check(click_text(pg, "Walk up to: Hull"), "walk up to the dark Hull door")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(300)
    c = card(pg)
    check(c == {"key": "m-hull", "reached": "0"}, f"the dark Hull door shows the Hull milestone's card ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(not link(pg).startswith("hull.core"), "no corridor opens to the Hull while it is dark")
    check(room(pg) == "core", "you stay in the Core")
    check(not errs, f"no page errors in the second run ({errs[:3]})")
    ctx.close(); b.close()

    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
