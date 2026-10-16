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
    ANN = {"id": 5, "username": "ann", "avatarUrl": None, "bio": None, "links": None, "isGhost": False, "createdAt": "2026-01-01T00:00:00.000Z"}
    STATS = {"signals": 0, "trace": [0] * 14, "studies": []}

    # 1. the homepage keeps its front page and gains a card into the Core room, with its picture
    def home(branches):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        def ans(r):
            u = r.request.url
            if "/api/auth/" in u: return r.fallback()
            if u.endswith("/api/home"): body = {**HOME_FULL, "branches": branches}
            elif "/api/rooms/online" in u: body = {"total": 0, "rooms": 0}
            else: body = []
            r.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        pg.route(re.compile(r".*/api/.*"), ans)
        pg.goto(f"{BASE}/"); pg.wait_for_selector("[data-testid=activity]", timeout=8000); pg.wait_for_timeout(400)
        return pg, errs
    pg, errs = home(HOME["branches"])
    card = pg.query_selector("[data-testid=home-core-enter]")
    check(card is not None and card.get_attribute("href") == "/branch/core/room", "the homepage has an Enter the game card into the Core room")
    try:
        pg.wait_for_function("() => { const i = document.querySelector('.home-core-img'); return !!i && i.complete && i.naturalWidth > 0 }", timeout=6000); pic = True
    except Exception:
        pic = False
    check(pic, "and its picture loads")
    check(pg.query_selector("#home-explore, [data-tour=branches]") is not None, "the branches are still on the front page, below the card")
    check(not errs, f"the homepage raised no page errors ({errs[:2]})")
    pg.close()
    pg, errs = home([b for b in HOME["branches"] if b["slug"] != "core"])
    check(pg.query_selector("[data-testid=home-core]") is None, "without the Core on the map there is no card")
    pg.close()

    # 2. Find in room on a profile: shown unless the member is Hidden
    def profile(room_body):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        route_json(pg, r".*/api/users/ann$", ANN)
        route_json(pg, r".*/api/users/ann/stats$", STATS)
        route_json(pg, r".*/api/users/ann/room$", room_body)
        pg.goto(f"{BASE}/u/ann"); pg.wait_for_selector("[data-testid=profile-stats]", timeout=8000); pg.wait_for_timeout(300)
        return pg, errs
    pg, errs = profile({"state": "in", "room": {"slug": "core", "name": "Core"}})
    pg.wait_for_selector("[data-testid=profile-find-btn]", timeout=6000); pg.click("[data-testid=profile-find-btn]")
    pg.wait_for_selector("[data-testid=profile-find-result]", timeout=6000)
    res = pg.inner_text("[data-testid=profile-find-result]"); href = pg.get_attribute("[data-testid=profile-find-result] a", "href")
    check(res == "Right now in Core" and href == "/branch/core/room", f"Find in room shows the room and links into it ({res!r}, {href})")
    check(not errs, f"the profile raised no page errors ({errs[:2]})")
    pg.close()
    pg, errs = profile({"state": "out"})
    pg.wait_for_selector("[data-testid=profile-find-btn]", timeout=6000); pg.click("[data-testid=profile-find-btn]")
    pg.wait_for_selector("[data-testid=profile-find-result]", timeout=6000)
    check(pg.inner_text("[data-testid=profile-find-result]") == "Not in a room right now.", "someone in no room is told so")
    pg.close()
    pg, errs = profile({"state": "hidden"})
    pg.wait_for_timeout(700)
    check(pg.query_selector("[data-testid=profile-find]") is None, "a member who is Hidden has no Find in room at all")
    pg.close()

    # 3. the room's Hidden switch is saved to the account while signed in
    pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    sent = []
    def saw(r):
        sent.append(json.loads(r.request.post_data or "{}")); r.fulfill(status=200, content_type="application/json", body="{}")
    pg.route(re.compile(r".*/api/account/room-visibility$"), saw)
    go(pg, "core")
    pg.click("[data-testid=room-visible]"); pg.wait_for_timeout(400)
    check(sent and sent[-1] == {"hidden": True}, f"pressing Hidden in a room saves it to the account ({sent[-1:]})")
    pg.click("[data-testid=room-visible]"); pg.wait_for_timeout(400)
    check(sent and sent[-1] == {"hidden": False}, "and pressing Visible again clears it")
    check(not errs, f"the room raised no page errors while toggling ({errs[:2]})")
    pg.close()

    # 4. a website page inside the room's terminal
    pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    go(pg, "core")
    pg.click("[data-testid=room-logbook]")
    pg.wait_for_selector("[data-testid=logbook-site-xenolab]", timeout=6000)
    check(pg.query_selector("[data-testid=logbook-site-branch-core]") is not None and pg.query_selector("[data-testid=logbook-site-wiki]") is not None, "the logbook lists this branch's page, XenoLab and the Log")
    pg.click("[data-testid=logbook-site-xenolab]")
    pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
    fel = pg.query_selector("[data-testid=terminal-frame]")
    nm = (fel.get_attribute("name") or "") if fel else ""
    check(fel is not None and fel.get_attribute("src") == "/xenolab" and nm.startswith("exomusica-terminal:core|") and "alb-one" in nm, f"XenoLab opens in the terminal frame for this room ({nm!r})")
    fr = fel.content_frame()
    try:
        fr.wait_for_selector("[data-testid=terminal-main]", timeout=15000); inside = True
    except Exception:
        inside = False
    check(inside, "the page opens with the terminal's own shell")
    check(fr.query_selector("nav[aria-label=Primary]") is None, "and the site's header and menus are not in it")
    fr.evaluate("() => { history.pushState({}, '', '/u/ann'); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }")
    try:
        fr.wait_for_function("() => location.pathname === '/branch/core'", timeout=6000); bounced = True
    except Exception:
        bounced = False
    check(bounced, "a link out of the room's reach brings the terminal back to the room's branch page")
    fr.evaluate("() => { history.pushState({}, '', '/wiki'); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }")
    pg.wait_for_timeout(900)
    check(fr.evaluate("() => location.pathname") == "/wiki", "the Log is open from inside the terminal")
    pg.click("[data-testid=terminal-leave]")
    try:
        pg.wait_for_url(re.compile(r".*/wiki$"), timeout=8000); left = True
    except Exception:
        left = False
    check(left and pg.query_selector("[data-testid=page-terminal]") is None, "leave takes you to the whole site, at the page the terminal is on")
    check(not errs, f"the room raised no page errors in the terminal ({errs[:2]})")
    pg.close()
    pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    go(pg, "core"); pg.click("[data-testid=room-logbook]"); pg.wait_for_selector("[data-testid=logbook-site-wiki]", timeout=6000)
    pg.click("[data-testid=logbook-site-wiki]"); pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
    pg.click("[data-testid=terminal-close]"); pg.wait_for_timeout(400)
    check(pg.query_selector("[data-testid=page-terminal]") is None and pg.query_selector(S) is not None, "closing the terminal brings you back into the room")
    pg.close()

    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
