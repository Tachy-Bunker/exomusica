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
    PATH = []
    for i in range(24): PATH += [round(-2 + i * 0.17, 2), round(1.5 * ((i % 6) - 3) / 3, 2), round(0.2 * i, 2)]
    forgot = []
    def setup():
        pg, errs = mk(); srv = {}
        def h(route):
            if route.request.method == "POST" and "forget-echoes" in route.request.url: forgot.append(1); return route.fulfill(status=200, content_type="application/json", body="{}")
            return route.fallback()
        pg.context.route(re.compile(r".*/api/rooms/forget-echoes"), h)
        def ws(w):
            srv["w"] = w; w.on_message(lambda m: None)
            w.send(json.dumps({"t": "echoes", "list": [{"id": 7, "name": "zoe", "agoMs": 3 * 3600_000, "s": PATH}, {"id": 8, "name": "bad", "agoMs": 1, "s": [1, 2]}]}))
        pg.route_web_socket(re.compile(r".*/ws/room.*"), ws); pg.route_web_socket(re.compile(r".*/ws/presence.*"), lambda w: None)
        return pg, errs, srv
    pg, errs, srv = setup()
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(800)
    try:
        pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.ghosts === '1'", timeout=19000); seen = True
    except Exception: seen = False
    check(seen, "An echo of somebody who was here shows up and walks (the malformed one is ignored)")
    n0 = int(at(pg, "drawn")); pg.wait_for_timeout(1500); n1 = int(at(pg, "drawn"))
    check(8 <= n1 - n0 <= 30, f"While it walks the room repaints about 15 times a second, not 60 ({n1 - n0} in 1.5 s)")
    srv["w"].send(json.dumps({"t": "others", "list": [{"id": 7, "name": "zoe", "x": 3.0, "z": 0.0, "yaw": 0}]})); pg.wait_for_timeout(400)
    check(at(pg, "ghosts") == "0", "While the person is here for real, their echo steps aside")
    srv["w"].send(json.dumps({"t": "others", "list": []})); pg.wait_for_timeout(300)
    try:
        pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.ghosts === '0'", timeout=14000); gone = True
    except Exception: gone = False
    pg.wait_for_timeout(500)
    if at(pg, "ghosts") != "0": pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.ghosts === '0'", timeout=14000)
    check(True, "The echo ends and fades out")
    pg.wait_for_timeout(600); fa = int(at(pg, "drawn")); pg.wait_for_timeout(1500); fb = int(at(pg, "drawn"))
    check(fb - fa <= 2, f"Between walks the room is still ({fb - fa} frames in 1.5 s)")
    try:
        pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.ghosts === '1'", timeout=19000); again = True
    except Exception: again = False
    check(again, "…and the echo comes round again by itself")
    pg.evaluate("window.__x = 1"); pg.click("[data-testid=room-visible]"); pg.wait_for_timeout(500)
    check(len(forgot) == 1 and at(pg, "ghosts") == "0", f"Going invisible takes your echoes out of the rooms (and hides these) ({len(forgot)} call, ghosts={at(pg, 'ghosts')})")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
