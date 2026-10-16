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
DOCS = {}
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
                sl = key.split("/api/room-doc/")[1]; e = DOCS.get(sl) or {"v": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}}
                return ok({"version": e["v"], "doc": e["doc"]})
            if key.startswith("/api/admin/room-doc/"):
                sl = key.split("/api/admin/room-doc/")[1]; body = json.loads(route.request.post_data); puts.append({"slug": sl, **body})
                e = DOCS.get(sl) or {"v": 0, "doc": None}; DOCS[sl] = {"v": e["v"] + 1, "doc": body["doc"]}; return ok({"version": DOCS[sl]["v"], "doc": body["doc"]})
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

    posts_scan = []
    def vis(pg, visor=True):
        MS = [{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True},
              {"key": "m-visor", "title": "Echo visor", "perk": "x", "metric": "SCANS", "label": "s", "target": 1500, "now": 1600 if visor else 900, "reached": visor, "reachedAt": None, "live": True}]
        def h(route):
            u = route.request.url; okj = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if "/api/milestones" in u: return okj(MS)
            if "/api/lore" in u: return okj([])
            if "/api/scans" in u:
                if route.request.method == "POST": posts_scan.append(json.loads(route.request.post_data)); return route.fulfill(status=204)
                return okj([])
            return route.fallback()
        pg.context.route(re.compile(r".*/api/(milestones|lore|scans).*"), h)
    S = "[data-testid=room-stage]"
    at = lambda pg, k: pg.get_attribute(S, "data-" + k)
    def open_room():
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(1000); return pg, errs
    def mean(pg, ch):
        return pg.evaluate("""(ch)=>{const c=document.querySelector('.rm-stage canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let s=0,n=0;for(let i=0;i<d.length;i+=4){s+=d[i+ch];n++}return s/n}""", ch)
    CORR = "b2~core"
    def to_corridor(pg):
        pg.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg.wait_for_timeout(200)
        pg.keyboard.down("KeyW")
        for _ in range(200):
            pg.wait_for_timeout(50)
            if at(pg, "space") == "corridor": break
        pg.keyboard.up("KeyW"); pg.wait_for_timeout(300); return at(pg, "space") == "corridor"
    # ---- admin: edit the corridor
    pg, errs = open_room(); puts.clear()
    check(pg.locator("[data-testid=room-edit-corr]").count() == 0, "No corridor button inside the room")
    inside = to_corridor(pg); check(inside, "Walked into the corridor")
    yaw = float(at(pg, "yaw"))
    pg.wait_for_selector("[data-testid=room-edit-corr]", timeout=3000); pg.click("[data-testid=room-edit-corr]"); pg.wait_for_selector("[data-testid=room-editor]")
    tabs = pg.inner_text("[data-testid=room-editor]")
    check("Floor" not in tabs.split("Mood")[0] and "Walls" not in tabs.split("Mood")[0], "A corridor has no floor or wall tabs")
    pg.click("[data-testid=re-add-artifact]"); pg.wait_for_selector("[data-testid=re-artifact]")
    pg.fill("[data-testid=re-atext]", "Mind the gap"); pg.fill("[data-testid=re-alore]", "The pipe remembers.")
    pg.click("[data-testid=re-save]"); pg.wait_for_function("document.querySelector('[data-testid=re-save]').textContent==='Saved'", timeout=3000)
    pu = puts[-1]; check(pu["slug"] == CORR and len(pu["doc"]["actors"]) == 1 and pu["doc"]["actors"][0]["text"] == "Mind the gap", f"Save goes to the corridor's own key ({pu['slug']})")
    check(all(p["slug"] == CORR for p in puts), "The room's own document was not touched")
    P = pu["doc"]["actors"][0]
    pg.click("[data-testid=room-edit]"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=room-editor]").count() == 0, "Closing returns to the room")
    check(not errs, f"No page errors {errs}")
    # ---- visitors: the corridor's things are there
    def art(x, z):
        return {"id": "a1", "kind": "artifact", "name": "Sign", "x": x, "z": z, "w": 1.8, "d": 0.1, "h": 1.2, "rot": 0, "sides": 0, "color": "#00ff00", "on": True, "pulse": 0, "text": "", "lore": "The pipe remembers.", "img": 0, "mode": 2, "visor": False}
    def solid(x, z, rot):
        return {"id": "s1", "kind": "solid", "name": "Plug", "x": x, "z": z, "w": 5, "d": 0.4, "h": 3, "rot": rot, "sides": 0, "color": "#7a8cff", "on": True, "pulse": 0, "text": "", "lore": "", "img": 0, "mode": 0, "visor": False}
    dx, dz = math.cos(yaw), math.sin(yaw)
    green = lambda pg: mean(pg, 1) - (mean(pg, 0) + mean(pg, 2)) / 2
    def visitor(actors):
        DOCS[CORR] = {"v": 3, "doc": {"v": 1, "version": 3, "actors": actors, "wires": [], "tex": [], "floor": [], "bands": [], "grade": None}}
        pg, errs = open_room(); return pg, errs
    pg, errs = visitor([]); inside = to_corridor(pg); g0 = green(pg)
    pg, errs = visitor([art(P["x"], P["z"])]); inside2 = to_corridor(pg); pg.wait_for_timeout(500); g1 = green(pg)
    check(inside and inside2 and g1 > g0 + 4, f"The corridor's artifact shows when you are in it ({g0:.1f} -> {g1:.1f})")
    # a plug across the corridor stops you; without it you walk through to the next room
    pg, errs = visitor([solid(P["x"] + dx * 2.0, P["z"] + dz * 2.0, yaw + math.pi / 2)]); to_corridor(pg)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(7000); pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    check(at(pg, "room") == "core" and at(pg, "space") == "corridor", f"A solid in the corridor blocks it ({at(pg, 'room')}, {at(pg, 'space')})")
    pg, errs = visitor([]); to_corridor(pg); pg.keyboard.down("KeyW"); pg.wait_for_timeout(7000); pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    check(at(pg, "room") != "core", f"Without it you walk through ({at(pg, 'room')})")
    # scanning an artifact in the corridor writes its entry
    pg, errs = visitor([art(P["x"], P["z"])]); vis(pg, True); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(800); posts_scan.clear()
    to_corridor(pg); pg.keyboard.down("KeyW"); pg.wait_for_timeout(700); pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    pg.keyboard.press("KeyX"); pg.keyboard.press("Enter")
    try:
        pg.wait_for_selector("[data-testid=scan-screen]", timeout=6000); pg.keyboard.press("Enter"); pg.wait_for_timeout(250); card = pg.inner_text("[data-testid=scan-screen]")
    except Exception: card = ""
    check("the pipe remembers." in card.lower(), f"Scanning the corridor's artifact shows its entry ({card!r})")
    check(any(q.get("key") == f"room:{CORR}/artifact/a1" for q in posts_scan), f"…and records it under the corridor's address ({posts_scan})")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
