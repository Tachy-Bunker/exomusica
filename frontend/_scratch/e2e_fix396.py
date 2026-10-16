import json, re, sys, os, math
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

STORE = {"v": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}, "conflict": False}
puts = []
reqs = []
DOCS = {}
HIST = {}
restores = []
LIB = []
posts = []
import base64, io, zipfile
from PIL import Image
def png(c, n=64):
    bio = io.BytesIO(); Image.new("RGB", (n, n), c).save(bio, "PNG"); return bio.getvalue()
RED = png((255, 0, 0))
def pano(w=1024, h=512):
    im = Image.new("RGB", (w, h), (0, 0, 255))
    for x in range(w):
        if (x // 64) % 2 == 0:
            for y in range(h): im.putpixel((x, y), (255, 0, 0))
    bio = io.BytesIO(); im.save(bio, "JPEG", quality=90); return bio.getvalue()
PANO = pano()
def run(pw):
    b = pw.chromium.launch(args=["--enable-precise-memory-info", "--js-flags=--expose-gc"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(touch=False, vis=("core",), size=(1100, 760), admin=True):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN if admin else {**ADMIN, 'isAdmin': False}))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(list(vis)))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN if admin else {**ADMIN, 'isAdmin': False}}))
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/api/admin/room-textures":
                if route.request.method == "POST":
                    b2 = json.loads(route.request.post_data); posts.append(b2); LIB.append({"id": 40 + len(LIB), "name": ("sky:" if b2.get("sky") else "") + b2["name"], "sky": bool(b2.get("sky"))}); return ok({"id": LIB[-1]["id"]}, 201)
                return ok(LIB)
            m = re.match(r"^/api/admin/room-textures/(\d+)$", key)
            if m and route.request.method == "DELETE":
                LIB[:] = [x for x in LIB if x["id"] != int(m.group(1))]; return ok({"ok": True})
            if key.startswith("/api/room-textures/"): return route.fulfill(status=200, content_type="image/jpeg", body=PANO) if key.endswith("/77") else route.fulfill(status=200, content_type="image/png", body=RED)
            if key.startswith("/api/room-doc/"):
                reqs.append(key)
                sl = key.split("/api/room-doc/")[1]; e = DOCS.get(sl) or {"v": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}}
                return ok({"version": e["v"], "doc": e["doc"]})
            m = re.match(r"^/api/admin/room-doc/([^/]+)/history$", key)
            if m and route.request.method == "GET": return ok(list(reversed([{"id": h["id"], "version": h["version"], "savedAt": "2026-10-16T09:00:00.000Z"} for h in HIST.get(m.group(1), [])])))
            m = re.match(r"^/api/admin/room-doc/([^/]+)/restore/(\d+)$", key)
            if m and route.request.method == "POST":
                sl = m.group(1); bd = json.loads(route.request.post_data); restores.append({"slug": sl, "id": int(m.group(2)), "baseVersion": bd.get("baseVersion")})
                h = next(x for x in HIST[sl] if x["id"] == int(m.group(2))); e = DOCS[sl]; DOCS[sl] = {"v": e["v"] + 1, "doc": h["doc"]}
                HIST[sl].append({"id": len(HIST[sl]) + 1, "version": DOCS[sl]["v"], "doc": h["doc"]}); return ok({"version": DOCS[sl]["v"], "doc": {**h["doc"], "version": DOCS[sl]["v"]}})
            if key.startswith("/api/admin/room-doc/"):
                sl = key.split("/api/admin/room-doc/")[1]; body = json.loads(route.request.post_data); puts.append({"slug": sl, **body})
                e = DOCS.get(sl) or {"v": 0, "doc": None}; DOCS[sl] = {"v": e["v"] + 1, "doc": body["doc"]}; HIST.setdefault(sl, []).append({"id": len(HIST[sl]) + 1 if sl in HIST else 1, "version": DOCS[sl]["v"], "doc": body["doc"]}); return ok({"version": DOCS[sl]["v"], "doc": {**body["doc"], "version": DOCS[sl]["v"]}})
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
    def go(pg, room):
        pg.goto(f"{BASE}/branch/{room}/room"); pg.wait_for_selector(S); pg.wait_for_timeout(900)
    def route_json(pg, pat, body, status=200):
        pg.route(re.compile(pat), lambda r: r.fulfill(status=status, content_type="application/json", body=json.dumps(body)))
    HOME_FULL = {**HOME, "stats": {"members": 3, "tracks": 1, "studies": 0, "branches": 6}}
    MSGS = [{"authorUsername": "ann", "contentRaw": "first light"}, {"authorUsername": "bob", "contentRaw": "second take"}, {"authorUsername": "cy", "contentRaw": "third"}]

    # 1. the homepage: how many people are in the rooms, as one line; no line at zero or when the count can't be read
    def home(total=None, status=200):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        def ans(r):
            u = r.request.url
            if "/api/auth/" in u: return r.fallback()
            if u.endswith("/api/home"): body, st = HOME_FULL, 200
            elif "/api/rooms/online" in u: body, st = ({"total": total} if total is not None else {}), status
            else: body, st = [], 200
            r.fulfill(status=st, content_type="application/json", body=json.dumps(body))
        pg.route(re.compile(r".*/api/.*"), ans)
        pg.goto(f"{BASE}/"); pg.wait_for_selector("[data-testid=activity]", timeout=8000); pg.wait_for_timeout(400)
        return pg, errs
    def live_line(pg):
        return pg.inner_text("[data-testid=rooms-live]") if pg.query_selector("[data-testid=rooms-live]") else None
    pg, errs = home(3)
    check(live_line(pg) == "3 people in the rooms right now", f"the homepage says how many people are in the rooms ({live_line(pg)!r})")
    check(pg.query_selector("section[data-tour=now] [data-testid=rooms-live]") is not None, "and the line sits in the Happening now section")
    check(not errs, f"the homepage raised no page errors ({errs[:2]})")
    pg.close()
    pg, errs = home(1)
    check(live_line(pg) == "1 person in the rooms right now", f"one person is singular ({live_line(pg)!r})")
    pg.close()
    pg, errs = home(0)
    check(live_line(pg) is None, "at zero there is no line")
    pg.close()
    pg, errs = home(None, 500)
    check(live_line(pg) is None and not errs, f"when the count can't be read, the line is left out and nothing errors ({errs[:2]})")
    pg.close()

    # 2. the branch chat, heard from the room: one line in a corner, quiet, never catching a click
    def room(msgs):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        route_json(pg, r".*/api/channels/chat-core/messages(\?.*)?$", msgs)
        go(pg, "core"); pg.wait_for_selector("[data-testid=room-ticker]", timeout=6000)
        return pg, errs
    pg, errs = room(MSGS)
    t = pg.inner_text("[data-testid=room-ticker]")
    check(t == "ann: first light", f"the room shows the first line of the branch chat ({t!r})")
    check(pg.get_attribute("[data-testid=room-ticker]", "aria-hidden") == "true", "the ticker is hidden from screen readers (the chat is a terminal in the room)")
    check(pg.eval_on_selector("[data-testid=room-ticker]", "e => getComputedStyle(e).pointerEvents") == "none", "and it never catches a click")
    try:
        pg.wait_for_function("() => document.querySelector('[data-testid=room-ticker]')?.textContent === 'bob: second take'", timeout=9000); moved = True
    except Exception:
        moved = False
    check(moved, "it moves on to the next line after a few seconds")
    check(not errs, f"the room raised no page errors ({errs[:2]})")
    pg.close()
    pg, errs = room([])
    check(pg.inner_text("[data-testid=room-ticker]") == "(quiet in here)", "a quiet chat says so")
    pg.close()

    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
