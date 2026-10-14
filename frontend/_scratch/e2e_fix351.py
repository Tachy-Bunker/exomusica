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
    b = pw.chromium.launch(args=["--enable-precise-memory-info", "--js-flags=--expose-gc"]); out = []
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
    at = lambda pg, k: pg.get_attribute(S, "data-" + k)
    ws_urls = []; reqs = []
    pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/room.*"), lambda w: ws_urls.append(w.url)); pg.route_web_socket(re.compile(r".*/ws/presence.*"), lambda w: None)
    pg.on("request", lambda r: reqs.append(r.url.replace(BASE, "").split("?")[0]) if "/api/branches/" in r.url else None)
    pg.goto(f"{BASE}/branch/core/room?perf"); pg.wait_for_selector(S); pg.wait_for_timeout(700)
    ahead = [r for r in reqs if r not in ("/api/branches/core", "/api/branches/core/albums")]
    check(ahead == [] and at(pg, "link") == "", f"Standing in the middle: no door open, nothing loaded ahead ({ahead})")
    pg.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg.wait_for_timeout(200)
    trace = []; seen_space = []; seen_link = []; poly_max = [0]
    pg.keyboard.down("KeyW")
    drone_in_corridor = None; start = None; arrive = (0, 0); fetched_at = []
    for i in range(220):
        pg.wait_for_timeout(50)
        room, space, lk = at(pg, "room"), at(pg, "space"), at(pg, "link")
        if not seen_space or seen_space[-1] != (room, space): seen_space.append((room, space))
        if lk and (not seen_link or seen_link[-1].split(":")[0] != lk.split(":")[0]): seen_link.append(lk)
        trace.append((room, lk))
        if space == "corridor" and room == "core":
            m = re.search(r"(\d+) polys", pg.inner_text("[data-testid=room-perf]") or "")
            if m: poly_max[0] = max(poly_max[0], int(m.group(1)))
            if drone_in_corridor is None and at(pg, "drone"): drone_in_corridor = at(pg, "drone")
        if room != "core" and lk == "": break
        if room != "core" and start is None: start = i; arrive = (float(at(pg, "x")), float(at(pg, "z"))); fetched_at = sorted(set(r for r in reqs if r.startswith("/api/branches/b") and not r.endswith("/albums")))
        if start is not None and i - start > 70 and lk == "": break
    pg.keyboard.up("KeyW")
    dest = at(pg, "room")
    opens = [float(l.split(":")[1]) for r, l in trace if l and r == "core"]
    check(any(0.02 < o < 0.95 for o in opens) and max(opens or [0]) >= 0.99, f"The door opens gradually as you come near (0 .. 1, {len(opens)} samples)")
    check(seen_space[:2] == [("core", "cur"), ("core", "corridor")] and seen_space[-1][0] == dest != "core", f"Room, then corridor, then the next room ({seen_space})")
    check(poly_max[0] > 0 and poly_max[0] < 450, f"Looking down the corridor stays cheap ({poly_max[0]} polygons)")
    check(drone_in_corridor, "The drone follows you into the corridor")
    check(fetched_at == [f"/api/branches/{dest}"], f"Only the room behind your door was loaded ahead ({fetched_at})")
    check(re.search(r"/branch/" + dest + r"/room$", pg.url) is not None, f"The address follows ({pg.url})")
    check(pg.locator("[data-testid=room-back]").get_attribute("href") == f"/branch/{dest}", "Back leads to the new room's branch page")
    check(any(f"room={dest}" in u for u in ws_urls) and any("room=core" in u for u in ws_urls), f"Presence moved to the new room ({[u.split('room=')[1] for u in ws_urls]})")
    pg.wait_for_timeout(1200)
    check(at(pg, "link") == "" or float(at(pg, "link").split(":")[1]) < 1, "The door shuts behind you and the old room is let go")
    check(arrive[0] ** 2 + arrive[1] ** 2 > 16, f"You arrive at the door, not in the middle ({arrive})")
    # a wall of the corridor stops you: push sideways in the middle of it
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW")
    for i in range(160):
        pg.wait_for_timeout(50)
        if at(pg, "space") == "corridor": break
    pg.wait_for_timeout(450); pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    yaw0 = float(at(pg, "yaw")); pg.keyboard.down("KeyA"); pg.wait_for_timeout(1200); pg.keyboard.up("KeyA"); pg.wait_for_timeout(200)
    check(at(pg, "space") == "corridor" and at(pg, "room") == "core", "Sideways into the corridor wall: you stay in it")
    # walk back out: the corridor is the same both ways and the door stays open while you are in it
    pg.keyboard.down("KeyS")
    for i in range(80):
        pg.wait_for_timeout(50)
        if at(pg, "space") == "cur": break
    pg.keyboard.up("KeyS"); pg.wait_for_timeout(300)
    check(at(pg, "space") == "cur" and at(pg, "room") == "core", "Backing out returns you to the room")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
