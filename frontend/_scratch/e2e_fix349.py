import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
for i in range(2, 6): NODES.append({"id": i, "parentId": 1, "slug": f"b{i}", "name": f"Branch {i}"})
NODES += [{"id": 6, "parentId": 2, "slug": "b6", "name": "Deep six"}, {"id": 7, "parentId": 2, "slug": "b7", "name": "Deep seven"}]
NODES.append({"id": 8, "parentId": 2, "secret": True, "key": "zz"})
HOME = {"branches": [{"slug": n["slug"], "name": n["name"], "tracks": 12, "albums": 2} for n in NODES if not n.get("secret")], "activity": [], "stats": {}}
ALBUM_FULL = {"id": 1, "slug": "alb-one", "title": "Album One", "composer": "Ann", "coverArtUrl": None, "description": None, "contentMarkdown": None, "links": [], "gallery": [], "branch": {"slug": "core", "name": "Core"}, "collaborators": [], "tracks": [{"id": 11, "title": "First Light", "fileUrl": "/uploads/a.mp3", "format": "mp3", "durationSeconds": 125, "position": 1, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}, {"id": 12, "title": "Second Wind", "fileUrl": "/uploads/b.mp3", "format": "mp3", "durationSeconds": 61, "position": 2, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}]}
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}, {"id": 2, "slug": "alb-two", "title": "Album Two", "composer": "x", "coverArtUrl": None, "previewTrack": None}]

def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(touch=False, vis=("core",), size=(1100, 760)):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(list(vis)))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/home": return ok(HOME)
            if key == "/api/milestones": return ok([{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True}])
            if key == "/api/albums/alb-one": return ok(ALBUM_FULL)
            m = re.match(r"^/api/branches/([^/]+)/albums$", key)
            if m: return ok(ALBUMS)
            m = re.match(r"^/api/branches/([^/]+)$", key)
            if m:
                n = next((x for x in NODES + [{"id": 99, "slug": "solo", "name": "Solo", "parentId": None}] if x.get("slug") == m.group(1)), None)
                if not n: return ok({"error": "nope"}, 404)
                return ok({"id": n["id"], "slug": n["slug"], "name": n["name"], "description": "d", "coverArtUrl": None, "parentId": n["parentId"], "channel": {"id": 9, "slug": "chat-" + n["slug"]}})
            if key in ("/api/channels/chat-b2/messages", "/api/channels/chat-b2/archive", "/api/emojis", "/api/recent-messages", "/api/online") or key.endswith("/participants") or key.endswith("/messages"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs

    S = "[data-testid=room-stage]"
    at = lambda pg, k: float(pg.get_attribute(S, "data-" + k))
    def walk(pg, key, ms): pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
    drone = lambda pg: pg.get_attribute(S, "data-drone") or ""
    xy = lambda s: tuple(int(v) for v in s.split(","))
    pg, errs = mk()
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(600)
    check(drone(pg) != "", f"The drone is in view beside you ({drone(pg)})")
    x, y = xy(drone(pg)); vw = pg.viewport_size["width"]
    check(x > vw / 2 and y > 100, "…ahead and to the right")
    d0 = int(pg.get_attribute(S, "data-drawn")); pg.wait_for_timeout(900)
    check(int(pg.get_attribute(S, "data-drawn")) == d0, "Nothing playing: still no repainting while idle")
    walk(pg, "KeyD", 500); pg.wait_for_timeout(100); walk(pg, "KeyE", 600)
    pg.wait_for_timeout(1500); x2, y2 = xy(drone(pg))
    check(abs(x2 - x) < 25 and abs(y2 - y) < 25, f"After moving and turning it comes back to the same spot ({x},{y}) -> ({x2},{y2})")
    # tap it
    pg.mouse.click(x2, y2); pg.wait_for_selector("[data-testid=drone-screen]", timeout=3000)
    check("Nothing is playing" in pg.inner_text("[data-testid=drone-screen]"), "Tapping the drone opens its screen (idle message)")
    check(pg.url.endswith("/branch/core/room"), "…in the room, not on a new page")
    pg.keyboard.press("Escape"); pg.wait_for_selector("[data-testid=drone-screen]", state="detached")
    pg.keyboard.press("KeyC"); pg.wait_for_selector("[data-testid=drone-screen]", timeout=3000); check(True, "C calls it")
    pg.keyboard.press("Escape")
    pg.click("[data-testid=room-drone]"); pg.wait_for_selector("[data-testid=drone-screen]"); check(True, "The Drone button (for touch) opens it too")
    pg.keyboard.press("Escape")
    # play an album through a terminal, then use the drone
    pg.evaluate("[...document.querySelectorAll('[data-prop]')].find(e=>e.dataset.prop==='a:alb-one').click()"); pg.wait_for_timeout(250)
    pg.keyboard.press("Space"); pg.wait_for_selector("[data-testid=terminal-play]"); pg.click("[data-testid=terminal-play]"); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("KeyC"); pg.wait_for_selector("[data-testid=drone-screen]")
    check(pg.inner_text("[data-testid=drone-title]") == "First Light", "The drone shows what is playing")
    q = pg.inner_text("[data-testid=drone-queue]"); check("Second Wind" in q, "…and the queue")
    pg.click("[data-testid=drone-next]"); pg.wait_for_timeout(400)
    check(pg.inner_text("[data-testid=drone-title]") == "Second Wind", "Next skips to the next track")
    check(pg.locator("[data-testid=drone-queue]").count() == 0, "…and the queue shrinks")
    pg.click("[data-testid=drone-prev]"); pg.wait_for_timeout(400)
    check(pg.inner_text("[data-testid=drone-title]") == "First Light", "Prev goes back")
    check(pg.locator("[data-testid=drone-queue]").count() == 1, "…and the track returns to the queue")
    pg.click("[data-testid=drone-shuffle]"); check("on" in pg.inner_text("[data-testid=drone-shuffle]"), "Shuffle toggles")
    pg.click("[data-testid=drone-repeat]"); check("all" in pg.inner_text("[data-testid=drone-repeat]") or "one" in pg.inner_text("[data-testid=drone-repeat]"), "Repeat cycles")
    pg.click("[data-testid=drone-clear]"); pg.wait_for_timeout(200); check(pg.locator("[data-testid=drone-queue]").count() == 0, "Clear queue empties it")
    pg.click("[data-testid=drone-away]"); pg.wait_for_selector("[data-testid=drone-screen]", state="detached"); pg.wait_for_timeout(500)
    check(drone(pg) == "" and pg.evaluate("localStorage.getItem('exomusica_drone')") == "0", "Sent away: it disappears (and stays away)")
    pg.click("[data-testid=room-drone]"); pg.wait_for_selector("[data-testid=drone-screen]"); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    check(drone(pg) != "", "Calling it brings it back")
    check(not errs, f"No page errors {errs}")
    # phone: tap on the drone with a finger
    pg2, e2 = mk(touch=True, size=(390, 800)); pg2.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg2.goto(f"{BASE}/branch/core/room"); pg2.wait_for_selector(S); pg2.wait_for_timeout(600)
    dx, dy = xy(drone(pg2)); check(dx > 195, f"Portrait: the drone is in view ({dx},{dy})")
    sb = pg2.locator(S).bounding_box()
    st = lambda t, x, y: pg2.locator(S).dispatch_event(t, {"pointerId": 9, "pointerType": "touch", "isPrimary": True, "clientX": x, "clientY": y, "bubbles": True, "buttons": 1})
    st("pointerdown", sb["x"] + dx, sb["y"] + dy); st("pointerup", sb["x"] + dx, sb["y"] + dy)
    pg2.wait_for_selector("[data-testid=drone-screen]", timeout=3000); check(True, "A finger tap on the drone opens it")
    check(not e2, f"No page errors on the phone {e2}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
