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
    def mk(touch=False, vis=("core",), size=(1100, 760), admin=True, reduce=False):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch, reduced_motion="reduce" if reduce else "no-preference")
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
    def open_room(reduce=False):
        pg, errs = mk(reduce=reduce); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(1000); return pg, errs
    def mean(pg, ch):
        return pg.evaluate("""(ch)=>{const c=document.querySelector('.rm-stage canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let s=0,n=0;for(let i=0;i<d.length;i+=4){s+=d[i+ch];n++}return s/n}""", ch)
    base = {"v": 1, "version": 3, "actors": [], "wires": [], "tex": [], "floor": [], "bands": [], "grade": None}
    STORE.update(v=3, doc=base); pg, errs = open_room(); puts.clear()
    pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=room-editor]"); pg.click("[data-testid=re-tab-mood]")
    pg.select_option("[data-testid=re-flock]", "1"); pg.wait_for_selector("[data-testid=re-flockn]")
    pg.evaluate("""()=>{const e=document.querySelector('[data-testid=re-flockn]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'30');e.dispatchEvent(new Event('input',{bubbles:true}))}""")
    check(pg.input_value("[data-testid=re-flockn]") == "12", f"The slider stops at 12 ({pg.input_value('[data-testid=re-flockn]')})")
    pg.click("[data-testid=re-save]"); pg.wait_for_function("document.querySelector('[data-testid=re-save]').textContent==='Saved'", timeout=3000)
    fk = puts[-1]["doc"]["flock"]; check(fk["kind"] == 1 and fk["n"] == 12 and fk["color"].startswith("#"), f"Save sends the flock {fk}")
    pg.select_option("[data-testid=re-flock]", "-1"); pg.click("[data-testid=re-save]"); pg.wait_for_function("document.querySelector('[data-testid=re-save]').textContent==='Saved'", timeout=3000)
    check(puts[-1]["doc"]["flock"] is None, "None removes it")
    check(not errs, f"No page errors {errs}")
    magenta = lambda pg: pg.evaluate("""()=>{const c=document.querySelector('.rm-stage canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i]>170&&d[i+2]>170&&d[i+1]<120)n++}return n}""")
    def turn_scan(pg, fn):
        res = []
        for _ in range(8):
            res.append(fn(pg)); pg.keyboard.down("KeyE"); pg.wait_for_timeout(420); pg.keyboard.up("KeyE"); pg.wait_for_timeout(250)
        return res
    FL = {"kind": 1, "n": 12, "color": "#ff00ff"}
    STORE.update(v=4, doc={**base, "flock": None}); pg, errs = open_room(); pg.focus(S); m0 = turn_scan(pg, magenta)
    STORE.update(v=5, doc={**base, "flock": FL}); pg, errs = open_room(); pg.focus(S); m1 = turn_scan(pg, magenta)
    check(max(m0) == 0 and max(m1) > 15, f"Fireflies show up in view and only with the flock (none {max(m0)}, with {max(m1)} pixels)")
    check(min(m1) < max(m1), f"They are only drawn where you look ({m1})")
    def rate(pg):  # repaints and speck pixels in the same second: only a second with specks on screen says anything about their rate
        pg.wait_for_timeout(900); n0 = int(at(pg, "drawn")); pg.wait_for_timeout(1000); n1 = int(at(pg, "drawn")); return (magenta(pg), n1 - n0)
    pairs = turn_scan(pg, rate); rates = [r for m, r in pairs if m > 15]
    check(any(8 <= r <= 20 for r in rates), f"While some are in view the room repaints about 15 times a second (in view, repaints per second: {rates}; all: {pairs})")
    STORE.update(v=6, doc={**base, "flock": FL})
    pg2, e2 = open_room(reduce=True); pg2.focus(S); mr = turn_scan(pg2, magenta); rr = [r for m, r in turn_scan(pg2, rate)]
    check(max(mr) == 0 and max(rr) < 3, f"Reduced motion switches them off ({max(mr)} px, {max(rr)} frames)")
    STORE.update(v=7, doc={**base, "flock": {"kind": 0, "n": 12, "color": "#ffffff"}}); pg3, e3 = open_room(); pg3.focus(S)
    check(not e3 and not errs and not e2, f"No page errors {errs} {e2} {e3}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
