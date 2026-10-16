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
            if key.startswith("/api/room-doc/"): return ok({"version": STORE["v"], "doc": STORE["doc"]})
            if key.startswith("/api/admin/room-doc/"):
                body = json.loads(route.request.post_data); puts.append(body)
                if STORE["conflict"]: return ok({"error": "Someone saved this room since you opened it. Reload to continue."}, 409)
                STORE["v"] += 1; STORE["doc"] = body["doc"]; return ok({"version": STORE["v"], "doc": body["doc"]})
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
    base = {"v": 1, "version": 3, "actors": [], "wires": [], "tex": [], "floor": [], "bands": [], "grade": None}
    def art(i, x, z, **kw):
        o = {"id": i, "kind": "artifact", "name": "Art " + i, "x": x, "z": z, "w": 1.6, "d": 0.1, "h": 1, "rot": 0, "sides": 0, "color": "#00ff00", "on": True, "pulse": 0, "text": "", "lore": "", "img": 0, "mode": 2, "visor": False}
        o.update(kw); return o
    # ---- editor
    STORE.update(v=3, doc=base); pg, errs = open_room(); puts.clear()
    pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=room-editor]")
    pg.click("[data-testid=re-add-artifact]"); pg.wait_for_selector("[data-testid=re-artifact]")
    pg.fill("[data-testid=re-atext]", "Ask the drain"); pg.fill("[data-testid=re-alore]", "They fell for nine years.")
    pg.select_option("[data-testid=re-amode]", "1"); pg.check("[data-testid=re-avisor]")
    pg.click("[data-testid=re-add-solid]"); pg.click("[data-testid=re-item-a1]")
    pg.select_option("[data-testid=re-wto]", "a2"); pg.select_option("[data-testid=re-wmsg]", "hide")
    ev = pg.eval_on_selector("[data-testid=re-wev]", "e=>Array.from(e.options).map(o=>o.value)") if pg.locator("[data-testid=re-wev]").count() else []
    check("scanned" in ev, f"An artifact can send 'scanned' ({ev})")
    pg.select_option("[data-testid=re-wev]", "scanned"); pg.click("[data-testid=re-wadd]")
    pg.click("[data-testid=re-save]"); pg.wait_for_function("document.querySelector('[data-testid=re-save]').textContent==='Saved'", timeout=3000)
    d0 = puts[-1]["doc"]; a0 = d0["actors"][0]
    check(a0["kind"] == "artifact" and a0["text"] == "Ask the drain" and a0["lore"].startswith("They fell") and a0["mode"] == 1 and a0["visor"] is True, f"Save sends the artifact's words, entry, placement and visor flag")
    check(len(d0["wires"]) == 1 and d0["wires"][0]["ev"] == "scanned", "…and the scanned wire")
    check(not errs, f"No page errors {errs}")
    # ---- where do you spawn?
    STORE.update(v=3, doc=base); pg, errs = open_room(); x0, z0, yaw = float(at(pg, "x")), float(at(pg, "z")), float(at(pg, "yaw"))
    fw = lambda dd: (round(x0 + math.cos(yaw) * dd, 2), round(z0 + math.sin(yaw) * dd, 2))
    green = lambda pg: mean(pg, 1) - (mean(pg, 0) + mean(pg, 2)) / 2
    g0 = green(pg)
    # ---- visitors see it
    STORE.update(v=4, doc={**base, "actors": [art("b", *fw(3.5), w=3, h=2)]}); pg, errs = open_room(); g1 = green(pg)
    check(g1 > g0 + 10, f"A billboard artifact shows ({g0:.1f} -> {g1:.1f})")
    # ---- visor-only
    STORE.update(v=5, doc={**base, "actors": [art("b", *fw(3.5), w=3, h=2, visor=True)]})
    pg, errs = open_room(); vis(pg, False); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(900); g2 = green(pg)
    check(g2 < g0 + 5, f"Visor-only stays invisible without the visor ({g2:.1f})")
    pg, errs = open_room(); vis(pg, True); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(1200); g3 = green(pg)
    check(g3 > g0 + 10, f"…and shows with it ({g3:.1f})")
    # ---- scan: lore, record, wire
    docs = {**base, "actors": [art("a", *fw(1.6), w=0.8, h=0.8, color="#ff0000", name="Drain note", lore="They fell for nine years.", mode=0, rot=yaw + math.pi), art("b", *fw(4), w=4, h=2.5)], "wires": [{"from": "a", "ev": "scanned", "to": "b", "msg": "hide", "delay": 0, "once": False}]}
    STORE.update(v=6, doc=docs); pg, errs = open_room(); vis(pg, True); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(1000); posts_scan.clear()
    gb = green(pg); check(gb > g0 + 8, f"Both artifacts show before the scan ({gb:.1f})")
    pg.keyboard.press("KeyX"); pg.keyboard.press("Enter"); pg.wait_for_selector("[data-testid=scan-screen]", timeout=6000); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    card = pg.inner_text("[data-testid=scan-screen]"); pg.keyboard.press("KeyX"); pg.wait_for_timeout(200)
    check("they fell for nine years." in card.lower() and "drain note" in card.lower(), f"Scanning writes the owner's entry ({card!r})")
    check(any(p.get("key") == "room:core/artifact/a" for p in posts_scan), f"The scan is recorded ({posts_scan})")
    pg.wait_for_timeout(500); ga = green(pg)
    check(ga < gb - 6, f"Scanning it hid the other artifact through the wire ({gb:.1f} -> {ga:.1f})")
    pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(1200)
    check(green(pg) < gb - 6, "What you scanned stays done when you come back")
    pg.keyboard.press("KeyL"); pg.wait_for_selector("[data-testid=logbook]", timeout=3000)
    pg.click("[data-testid=logbook-room] button"); pg.wait_for_selector("[data-testid=logbook-entry]"); lt = pg.inner_text("[data-testid=logbook]"); check("Drain note" in lt, f"The Logbook holds the entry ({lt[:200]!r})")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
