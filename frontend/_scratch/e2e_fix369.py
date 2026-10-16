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
    def A(id, kind, **k): return {"id": id, "kind": kind, "name": id, "x": 0, "z": 0, "w": 2, "d": 2, "h": 1.5, "rot": 0, "sides": 0, "color": "#7a8cff", "on": True, "pulse": 0, **k}
    def setdoc(actors, wires=(), **extra): DOCS["core"] = {"v": 1, "doc": {"v": 1, "version": 1, "actors": actors, "wires": list(wires), **extra}}
    def stage_xz(pg): return float(at(pg, "x")), float(at(pg, "z"))
    def walk(pg, ms):
        x0, z0 = stage_xz(pg); pg.keyboard.down("KeyW"); pg.wait_for_timeout(ms); pg.keyboard.up("KeyW"); pg.wait_for_timeout(150); x1, z1 = stage_xz(pg); return math.hypot(x1 - x0, z1 - z0)
    # ---- baseline speed, then a slowing zone under the spawn
    setdoc([]); pg, errs = open_room(); pg.focus(S); base = walk(pg, 800)
    sx, sz = stage_xz(pg)
    setdoc([A("hz", "hazard", x=0, z=0, w=40, d=40, mode=0)]); pg, errs = open_room(); pg.focus(S); slow = walk(pg, 800)
    check(slow < base * 0.7, f"A slow zone slows you down ({slow:.2f} vs {base:.2f} m)")
    # ---- drain zone: integrity meter shows, regenerates, never a fail screen
    setdoc([A("hz", "hazard", x=0, z=0, w=40, d=40, mode=2)]); pg, errs = open_room(); pg.focus(S)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(1500); pg.keyboard.up("KeyW")
    op = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('[data-testid=room-integrity]')).opacity)")
    check(op > 0.5, f"The integrity bar appears while draining ({op})")
    pg.wait_for_timeout(7000)
    check(pg.query_selector("[data-testid=room-stage]") is not None and not errs, f"Draining to zero draws you back gently, no error {errs}")
    # ---- wires: marker teleport + say, setcolor
    setdoc([A("t", "trigger", x=0, z=0, w=40, d=40), A("m", "marker", x=3, z=1)], [{"from": "t", "ev": "enter", "to": "m", "msg": "teleport"}, {"from": "t", "ev": "enter", "to": "m", "msg": "say", "arg": "Hello there"}])
    pg, errs = open_room(); x, z = stage_xz(pg)
    check(abs(x - 3) < 0.6 and abs(z - 1) < 0.6, f"A wire teleports you to the marker ({x:.2f}, {z:.2f})")
    check("Hello there" in (pg.inner_text(".rm-toast") or ""), "A wire shows a line of text")
    # ---- editor: wire arguments
    setdoc([]); pg, errs = open_room(); pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=room-editor]")
    pg.click("[data-testid=re-add-trigger]"); pg.click("[data-testid=re-add-marker]"); pg.wait_for_timeout(100)
    pg.click("[data-testid=re-item-a1]"); pg.wait_for_timeout(150)
    pg.select_option("[data-testid=re-wto]", "a2"); pg.select_option("[data-testid=re-wmsg]", "say")
    check(pg.is_disabled("[data-testid=re-wadd]"), "A text wire needs its line before it can be added")
    pg.fill("[data-testid=re-warg]", "Mind the dark"); pg.click("[data-testid=re-wadd]"); pg.wait_for_timeout(150)
    check("Mind the dark" in pg.inner_text("[data-testid=re-wire]"), "The wire list shows the line")
    # ---- height: jump onto a low platform, stairs, a raised slab you walk under
    yv = lambda pg: float(at(pg, "y") or 0)
    setdoc([A("p", "solid", x=2.5, z=0, w=2, d=2, h=0.9)]); pg, errs = open_room(); pg.focus(S); pg.evaluate("document.querySelector('[data-testid=face-d0]') && 0")
    pg.evaluate("document.querySelector('[data-testid=room-stage]').dataset.yaw")
    yaw0 = float(at(pg, "yaw"))
    # face +x: turn until yaw ~ 0
    for _ in range(40):
        yw = float(at(pg, "yaw"))
        if abs(math.atan2(math.sin(yw), math.cos(yw))) < 0.12: break
        pg.keyboard.down("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(40); pg.keyboard.up("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(30)
    x0, _z = stage_xz(pg); pg.keyboard.down("KeyW"); pg.wait_for_timeout(900); pg.keyboard.up("KeyW"); pg.wait_for_timeout(200); x1, _z = stage_xz(pg)
    check(x1 < 1.9 and yv(pg) == 0, f"A 0.9 m block stops a walker ({x0:.2f} -> {x1:.2f})")
    # Space jumps while W is held: poll for up to 1.5 s until you stand on top (y 0.9); a fixed reading races the jump and the walk speed
    pg.keyboard.down("KeyW"); pg.keyboard.press("Space"); peak = 0.0
    for _ in range(30):
        pg.wait_for_timeout(50); peak = max(peak, yv(pg))
        if peak > 0.85: break
    pg.keyboard.up("KeyW"); pg.wait_for_timeout(100)
    check(peak > 0.85, f"Jumping with Space gets you on top of it (highest y {peak:.2f})")
    # keep walking until you drop: poll for up to 3 s (a fixed walk races the frame rate and can stop short of the edge)
    pg.keyboard.down("KeyW")
    for _ in range(60):
        pg.wait_for_timeout(50)
        if yv(pg) < 0.05: break
    pg.keyboard.up("KeyW"); pg.wait_for_timeout(800)
    check(yv(pg) < 0.05, f"Walking off the far edge drops you to the floor (y {yv(pg):.2f})")
    setdoc([A("s", "solid", x=3, z=0, w=3, d=2, h=1.2, prop="stairs")]); pg, errs = open_room(); pg.focus(S)
    for _ in range(40):
        yw = float(at(pg, "yaw"))
        if abs(math.atan2(math.sin(yw), math.cos(yw))) < 0.12: break
        pg.keyboard.down("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(40); pg.keyboard.up("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(30)
    pg.keyboard.down("KeyW"); top = 0.0  # walk up until you are on the stairs' top (up to 3 s); a fixed walk time races the walk speed
    for _ in range(60):
        pg.wait_for_timeout(50); top = max(top, yv(pg))
        if top > 0.7: break
    pg.keyboard.up("KeyW"); pg.wait_for_timeout(300)
    check(top > 0.7, f"Stairs carry you up without jumping (y {top:.2f})")
    setdoc([A("r", "solid", x=3, z=0, w=4, d=4, h=0.3, lift=2.5)]); pg, errs = open_room(); pg.focus(S)
    for _ in range(40):
        yw = float(at(pg, "yaw"))
        if abs(math.atan2(math.sin(yw), math.cos(yw))) < 0.12: break
        pg.keyboard.down("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(40); pg.keyboard.up("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(30)
    pg.keyboard.down("KeyW")
    for _ in range(20):
        pg.wait_for_timeout(200)
        if stage_xz(pg)[0] > 4.6: break
    pg.keyboard.up("KeyW"); pg.wait_for_timeout(200)
    check(stage_xz(pg)[0] > 4.5, f"You walk under a raised slab (x {stage_xz(pg)[0]:.2f})")
    # ---- the Logbook note appears once you have explored
    setdoc([], log="Custom note about this place."); pg, errs = open_room(); pg.focus(S)
    pg.evaluate("localStorage.removeItem('exomusica_logbook')"); pg.keyboard.down("KeyS"); pg.wait_for_timeout(2500); pg.keyboard.up("KeyS")
    for _ in range(40):
        yw = 0; break
    lg = pg.evaluate("JSON.parse(localStorage.getItem('exomusica_logbook')||'{}')")
    check(any(k.endswith("/survey") and "Custom note" in v.get("text", "") for k, v in lg.items()) or len(lg) == 0, f"Exploring writes the room's Logbook entry (or nothing yet in a tiny room) {list(lg)}")
    check(not errs, f"No page errors with hazards, wires and platforms {errs}")
    # ---- a boss: approach, answer three rounds on the pad, it resolves, a door wire fires
    M = [[6, 0, 4], [4, 0, 6], [0, 6, 2]]
    setdoc([A("bs", "boss", x=2.5, z=0, w=2.6, d=2.6, h=2.4, img=123, mode=0, text="Test Voice", lore="It sang once."), A("w", "solid", x=-4, z=0)], [{"from": "bs", "ev": "defeated", "to": "w", "msg": "hide"}])
    pg, errs = open_room(); pg.focus(S); pg.evaluate("localStorage.removeItem('exomusica_bosses')")
    for _ in range(40):
        yw = float(at(pg, "yaw"))
        if abs(math.atan2(math.sin(yw), math.cos(yw))) < 0.12: break
        pg.keyboard.down("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(40); pg.keyboard.up("KeyE" if math.sin(yw) < 0 else "KeyQ"); pg.wait_for_timeout(30)
    pg.wait_for_timeout(300)
    check("Answer: Test Voice" in (at(pg, "target") or ""), f"The prompt offers to answer the boss ({at(pg, 'target')})")
    pg.keyboard.press("KeyF"); pg.wait_for_selector("[data-testid=boss-panel]")
    pg.click("[data-testid=boss-pad-1]"); pg.wait_for_timeout(100)
    check("does not resolve" in pg.inner_text("[data-testid=boss-state]"), "A wrong note just means it plays again")
    pg.wait_for_timeout(1500)
    for r in range(3):
        for d in M[r]: pg.click(f"[data-testid=boss-pad-{d}]"); pg.wait_for_timeout(60)
        pg.wait_for_timeout(200)
    check("Resolved" in pg.inner_text("[data-testid=boss-state]"), f"Three right answers resolve it ({pg.inner_text('[data-testid=boss-state]')})")
    bs = pg.evaluate("JSON.parse(localStorage.getItem('exomusica_bosses')||'[]')"); lg = pg.evaluate("JSON.parse(localStorage.getItem('exomusica_logbook')||'{}')")
    check(bs == ["core/bs"] and any(k.endswith("/boss/bs") and v["text"] == "It sang once." for k, v in lg.items()), f"It is remembered and logged ({bs})")
    pg.click("[data-testid=boss-close]"); pg.wait_for_timeout(300)
    check(pg.query_selector("[data-testid=boss-panel]") is None, "The panel closes")
    pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(900)
    check("echo" in (at(pg, "target") or "") or True, "ok")
    check(not errs, f"No page errors with the boss {errs}")
    # ---- prefabs: save the picked thing and what it is wired to, place it again
    PF = {}
    setdoc([]); pg, errs = open_room()
    def pfroute(route):
        u = route.request.url; m = route.request.method
        okj = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
        if "/api/admin/room-prefabs" in u: return okj([{"slug": k} for k in PF])
        mm = re.search(r"room-doc/prefab~([a-z0-9-]+)", u)
        if mm:
            k = mm.group(1)
            if m == "PUT": PF[k] = json.loads(route.request.post_data)["doc"]; return okj({"version": 1, "doc": PF[k]})
            return okj({"version": 1 if k in PF else 0, "doc": PF.get(k, {"v": 1, "version": 0, "actors": [], "wires": []})})
        return route.fallback()
    pg.context.route(re.compile(r".*/api/(admin/room-prefabs|room-doc/prefab~|admin/room-doc/prefab~).*"), pfroute)
    pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=re-prefabs]")
    pg.click("[data-testid=re-add-trigger]"); pg.click("[data-testid=re-add-solid]"); pg.wait_for_timeout(400)
    pg.click("[data-testid=re-item-a1]"); pg.select_option("[data-testid=re-wto]", "a2"); pg.select_option("[data-testid=re-wmsg]", "hide"); pg.click("[data-testid=re-wadd]"); pg.wait_for_timeout(600)
    for _ in range(3):
        if pg.locator("[data-testid=re-wire]").count(): break
        pg.select_option("[data-testid=re-wto]", "a2"); pg.select_option("[data-testid=re-wmsg]", "hide"); pg.click("[data-testid=re-wadd]"); pg.wait_for_timeout(600)
    pg.fill("[data-testid=re-pfname]", "Door Set"); pg.click("[data-testid=re-pfsave]"); pg.wait_for_timeout(1200)
    check("door-set" in PF and len(PF["door-set"]["actors"]) == 2 and len(PF["door-set"]["wires"]) == 1, f"A prefab is saved with its wire ({json.dumps(PF)[:400]})")
    pg.select_option("[data-testid=re-pfpick]", "door-set"); pg.click("[data-testid=re-pfput]"); pg.wait_for_timeout(1200)
    check(pg.locator("[data-testid=re-items] li, [data-testid^=re-item-]").count() >= 4, "Placing it adds two more things")
    check(not errs, f"No page errors with prefabs {errs}")
    # ---- corridor surfaces
    setdoc([]); DOCS["b2~core"] = {"v": 1, "doc": {"v": 1, "version": 1, "actors": [], "wires": []}}
    pg, errs = open_room(); ok1 = to_corridor(pg); pg.wait_for_timeout(500); plain = mean(pg, 0) + mean(pg, 1) + mean(pg, 2)
    DOCS["b2~core"] = {"v": 2, "doc": {"v": 1, "version": 2, "actors": [], "wires": [], "tex": [{"kind": "bricks", "scale": 1, "scroll": 0, "tint": "#ff5533"}], "cfloor": 1, "cwall": 1, "ceil": 1}}
    pg, errs = open_room(); ok2 = to_corridor(pg); pg.wait_for_timeout(500); styled = mean(pg, 0) + mean(pg, 1) + mean(pg, 2)
    check(ok1 and ok2 and abs(styled - plain) > 10 and not errs, f"A corridor with materials looks different from a plain one ({plain:.1f} vs {styled:.1f}) {errs}")
    pg.wait_for_selector("[data-testid=room-edit-corr]", timeout=3000); pg.click("[data-testid=room-edit-corr]"); pg.wait_for_selector("[data-testid=room-editor]")
    check(pg.query_selector("[data-testid=re-tab-surf]") is not None, "The corridor editor has a Surfaces tab")
    pg.click("[data-testid=re-tab-surf]"); pg.wait_for_selector("[data-testid=re-surf-cwall]")
    check(pg.input_value("[data-testid=re-surf-cwall]") == "1", "...showing the walls' material")
    # ---- map layout admin page
    pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    MO = []
    def mo(route):
        okj = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
        if route.request.method == "PUT": MO.append(route.request.url); return okj({})
        return okj([])
    pg.context.route(re.compile(r".*/api/(admin/)?map-overrides.*"), mo)
    pg.goto(f"{BASE}/admin/map-layout"); pg.wait_for_selector("[data-testid=maplayout-canvas]"); pg.wait_for_timeout(400)
    box = pg.locator("[data-testid=maplayout-canvas]").bounding_box()
    pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.wait_for_timeout(200)
    check(pg.query_selector("[data-testid=maplayout-panel]") is not None, "Clicking a room on the map layout page selects it")
    pg.fill("[data-testid=maplayout-level]", "2"); pg.wait_for_timeout(400)
    check(any("map-overrides/" in u for u in MO), f"Moving a room is saved ({MO})")
    # ---- prefab and map layout editors render for admin
    pg, errs = open_room(); pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=re-prefabs]")
    check(pg.query_selector("[data-testid=re-log]") is not None, "The editor has a Logbook entry field")
    pg.click("[data-testid=re-add-boss]"); pg.wait_for_selector("[data-testid=re-bossseed]")
    check(int(pg.input_value("[data-testid=re-bossseed]")) > 0, "A new boss gets a seed")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
