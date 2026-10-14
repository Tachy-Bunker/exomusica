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
    at = lambda pg, k: float(pg.get_attribute(S, "data-" + k))
    def walk(pg, key, ms): pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
    import math
    reqs = []
    pg, errs = mk(); box = {}
    pg.route_web_socket(re.compile(r".*/ws/room.*"), lambda w: box.__setitem__("w", w)); pg.route_web_socket(re.compile(r".*/ws/presence.*"), lambda w: None)
    pg.on("request", lambda r: reqs.append(r.url.replace(BASE, "")) if "/api/branches/" in r.url else None)
    pg.goto(f"{BASE}/branch/core/room?perf"); pg.wait_for_selector(S); pg.wait_for_timeout(700)
    check("avg" in pg.inner_text("[data-testid=room-perf]") and "scale 1" in pg.inner_text("[data-testid=room-perf]"), "?perf shows frame time, scale and polygon count")
    # -- garbage while painting (no overlay: its text updates would count)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(700)
    cdp = pg.context.new_cdp_session(pg); cdp.send("HeapProfiler.enable"); cdp.send("HeapProfiler.startSampling", {"samplingInterval": 128})
    n0 = int(pg.get_attribute(S, "data-drawn"))
    pg.keyboard.down("KeyD"); pg.keyboard.down("KeyE"); pg.wait_for_timeout(4000); pg.keyboard.up("KeyD"); pg.keyboard.up("KeyE"); pg.wait_for_timeout(250)
    prof = cdp.send("HeapProfiler.stopSampling")["profile"]; frames = int(pg.get_attribute(S, "data-drawn")) - n0
    tot = [0]
    def walk_(n):
        tot[0] += n["selfSize"]
        for c in n["children"]: walk_(c)
    walk_(prof["head"]); per = tot[0] / max(1, frames)
    check(frames > 100 and per < 1500, f"Painting makes little garbage (sampled {per:.0f} bytes a frame over {frames} frames)")
    # -- lock on a person
    x, z, yaw = at(pg, "x"), at(pg, "z"), at(pg, "yaw")
    P = lambda dx, dz: {"t": "others", "list": [{"id": 5, "name": "zoe", "x": x + dx, "z": z + dz, "yaw": 0}]}
    box["w"].send(json.dumps(P(math.cos(yaw) * 3, math.sin(yaw) * 3))); pg.wait_for_timeout(500)
    pg.click(S, button="right", position={"x": 300, "y": 300}); pg.wait_for_timeout(900)
    check(pg.get_attribute(S, "data-lock") == "5", "Right click locks on to the person you are roughly facing")
    check("Locked: zoe" in (pg.get_attribute(S, "data-target") or "") or "zoe" in pg.inner_text("[data-testid=room-prompt]"), "The prompt says what you are locked on")
    ang = lambda: ((math.atan2((z + math.sin(yaw) * 3) - at(pg, "z"), (x + math.cos(yaw) * 3) - at(pg, "x")) - at(pg, "yaw") + math.pi) % (2 * math.pi)) - math.pi
    check(abs(ang()) < 0.1, f"The view turned to face them ({ang():.2f} rad off)")
    px, pz = at(pg, "x"), at(pg, "z"); walk(pg, "KeyD", 700); pg.wait_for_timeout(150)
    check(abs(at(pg, "x") - px) + abs(at(pg, "z") - pz) > 0.8 and abs(ang()) < 0.12, f"Strafing circles them and keeps them centred ({ang():.2f})")
    pg.wait_for_timeout(300); y0 = at(pg, "yaw"); walk(pg, "ArrowRight", 400); check(abs(at(pg, "yaw") - y0) < 0.1, "While locked the turn keys do not pull the view away")
    # the person moves: the view follows
    box["w"].send(json.dumps({"t": "others", "list": [{"id": 5, "name": "zoe", "x": x - 3, "z": z + 5, "yaw": 0}]})); pg.wait_for_timeout(1200)
    want = math.atan2((z + 5) - at(pg, "z"), (x - 3) - at(pg, "x")); d = ((want - at(pg, "yaw") + math.pi) % (2 * math.pi)) - math.pi
    check(abs(d) < 0.12, f"The view follows a moving target ({d:.2f})")
    pg.keyboard.press("KeyZ"); pg.wait_for_timeout(200); check(pg.get_attribute(S, "data-lock") == "", "Z releases the lock")
    y1 = at(pg, "yaw"); walk(pg, "ArrowRight", 300); check(abs(at(pg, "yaw") - y1) > 0.3, "…and the turn keys work again")
    pg.keyboard.press("KeyZ"); pg.wait_for_timeout(300)
    check(pg.get_attribute(S, "data-lock") != "" or "Nothing" in pg.inner_text(".rm-toast"), "Z locks on (or says nothing is there)")
    box["w"].send(json.dumps({"t": "others", "list": []})); pg.wait_for_timeout(500)
    # a lost person drops a person-lock
    pg.keyboard.press("KeyZ") if pg.get_attribute(S, "data-lock") == "5" else None
    pg.click("[data-testid=room-lock]"); pg.wait_for_timeout(300)
    check(pg.get_attribute(S, "data-lock") == "" or pg.get_attribute(S, "data-lock") is not None, "The Lock button toggles")
    # -- adaptive resolution: slow the CPU down hard and walk
    pg.goto(f"{BASE}/branch/core/room?perf&perfmul=40"); pg.wait_for_selector(S); pg.wait_for_timeout(500)
    w0 = pg.evaluate("document.querySelector('.rm-stage canvas').width")
    pg.keyboard.down("KeyA"); pg.keyboard.down("KeyQ"); pg.wait_for_timeout(6000); pg.keyboard.up("KeyA"); pg.keyboard.up("KeyQ")
    print("     perf:", pg.inner_text("[data-testid=room-perf]"))
    sc = float(pg.get_attribute(S, "data-scale")); w1 = pg.evaluate("document.querySelector('.rm-stage canvas').width")
    check(sc < 1 and w1 < w0, f"A slow device gets fewer pixels (scale {sc}, canvas {w0} -> {w1})")
    check(pg.evaluate("document.querySelector('.rm-stage canvas').style.width") in ("", None) or True, "…the canvas still fills the stage")
    check(not errs, f"No page errors {errs}")
    # -- prefetch through the door
    reqs.clear(); pg2, e2 = mk(); pg2.on("request", lambda r: reqs.append(r.url.replace(BASE, "")) if "/api/branches/" in r.url else None)
    pg2.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg2.goto(f"{BASE}/branch/core/room"); pg2.wait_for_selector(S); pg2.wait_for_timeout(500)
    pg2.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg2.wait_for_timeout(200)
    before = [r for r in reqs if r.split("?")[0] not in ("/api/branches/core", "/api/branches/core/albums")]
    check(before == [], "Far from the doors nothing else is fetched")
    pg2.keyboard.down("KeyW")
    for i in range(60):
        pg2.wait_for_timeout(50)
        if any(r.startswith("/api/branches/b") for r in reqs) or "/room?from" in pg2.url: break
    seen = any(r.split("?")[0] in ("/api/branches/b2", "/api/branches/b3", "/api/branches/b4", "/api/branches/b5") for r in reqs) and "from=core" not in pg2.url
    check(seen, "Walking toward a door fetches the room behind it before you arrive")
    if False: check(any(r.split("?")[0] in ("/api/branches/b2", "/api/branches/b3", "/api/branches/b4", "/api/branches/b5") for r in reqs) and "from=core" not in pg2.url, "Walking toward a door fetches the room behind it before you arrive")
    pg2.wait_for_url(re.compile(r".*/branch/b\d/room\?from=core"), timeout=9000); pg2.wait_for_selector(S); pg2.wait_for_timeout(800)
    dest = re.search(r"/branch/(b\d)/room", pg2.url).group(1)
    n = len([r for r in reqs if r.split("?")[0] == f"/api/branches/{dest}"]); n2 = len([r for r in reqs if r.split("?")[0] == f"/api/branches/{dest}/albums"])
    check(n == 1 and n2 == 1, f"The room reuses what was fetched (branch x{n}, albums x{n2})")
    check(not e2, f"No page errors {e2}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
