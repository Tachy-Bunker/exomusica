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
def run(pw):
    b = pw.chromium.launch(args=["--enable-precise-memory-info", "--js-flags=--expose-gc"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(touch=False, vis=("core",), size=(1100, 760), admin=True):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN if admin else {**ADMIN, 'isAdmin': False}))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(list(vis)))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
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

    S = "[data-testid=room-stage]"
    at = lambda pg, k: pg.get_attribute(S, "data-" + k)
    def open_room(**kw):
        pg, errs = mk(**kw); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(900); return pg, errs
    # ---- visitors never see the editor
    pg, errs = open_room(admin=False)
    check(pg.locator("[data-testid=room-edit]").count() == 0, "A visitor has no Edit button")
    # ---- the admin builds something
    pg, errs = open_room()
    x0, z0, yaw = float(at(pg, "x")), float(at(pg, "z")), float(at(pg, "yaw"))
    pg.click("[data-testid=room-edit]"); pg.wait_for_selector("[data-testid=room-editor]")
    check(pg.get_attribute("[data-testid=room-edit]", "aria-pressed") == "true", "Edit room opens the editor")
    pg.click("[data-testid=re-add-solid]"); pg.wait_for_selector("[data-testid=re-inspector]")
    check(pg.locator("[data-testid^=re-item-]").count() == 1, "Adding a solid lists it")
    pg.fill("[data-testid=re-name]", "Wall"); pg.fill("[data-testid=re-w]", "6"); pg.fill("[data-testid=re-h]", "2.5")
    check(pg.locator("[data-testid=re-name]").input_value() == "Wall" and pg.locator("[data-testid=re-w]").input_value() == "6", "The inspector edits it")
    pg.select_option("[data-testid=re-sides]", "6"); pg.click("[data-testid=re-add-trigger]"); pg.click("[data-testid=re-add-light]")
    check(pg.locator("[data-testid^=re-item-]").count() == 3, "A trigger and a light are added")
    pg.click("[data-testid=re-item-a2]")
    pg.select_option("[data-testid=re-wto]", "a1"); pg.select_option("[data-testid=re-wmsg]", "hide"); pg.click("[data-testid=re-wadd]")
    check(pg.locator("[data-testid=re-wire]").count() == 1 and "enter" in pg.inner_text("[data-testid=re-wire]"), f"A wire from the trigger to the wall ({pg.inner_text('[data-testid=re-wire]') if pg.locator('[data-testid=re-wire]').count() else ''})")
    pg.click("[data-testid=re-play]"); pg.wait_for_timeout(300)
    check(pg.get_attribute("[data-testid=re-play]", "aria-pressed") == "true", "Test play can be turned on")
    pg.click("[data-testid=re-play]")
    pg.click("[data-testid=re-save]"); pg.wait_for_function("document.querySelector('[data-testid=re-save]').textContent==='Saved'", timeout=3000)
    check(len(puts) == 1 and len(puts[0]["doc"]["actors"]) == 3 and puts[0]["baseVersion"] == 0 and len(puts[0]["doc"]["wires"]) == 1, f"Save sends the document ({len(puts)} puts)")
    check(STORE["v"] == 1, "The server version went up")
    # ---- a conflict is reported
    pg.click("[data-testid=re-item-a1]"); pg.fill("[data-testid=re-name]", "Wall2"); STORE["conflict"] = True; pg.click("[data-testid=re-save]"); pg.wait_for_selector("[data-testid=re-error]", timeout=3000)
    check("Someone saved" in pg.inner_text("[data-testid=re-error]"), "A conflicting save says so")
    STORE["conflict"] = False
    check(not errs, f"No page errors {errs}")
    # ---- solids block, wires open the way
    def doc_with(wire):
        ax, az = x0 + math.cos(yaw) * 3, z0 + math.sin(yaw) * 3
        acts = [{"id": "w", "kind": "solid", "name": "Wall", "x": ax, "z": az, "w": 8, "d": 0.6, "h": 2.5, "rot": yaw + math.pi / 2, "sides": 0, "color": "#7a8cff", "on": True},
                {"id": "t", "kind": "trigger", "name": "Plate", "x": x0, "z": z0, "w": 1.4, "d": 1.4, "h": 2, "rot": 0, "sides": 0, "color": "#ffd27a", "on": True}]
        return {"v": 1, "version": 5, "actors": acts, "wires": [{"from": "t", "ev": "enter", "to": "w", "msg": "hide", "delay": 0.6, "once": False}] if wire else []}
    def walk(pg, ms=1700):
        pg.keyboard.down("KeyW"); pg.wait_for_timeout(ms); pg.keyboard.up("KeyW"); pg.wait_for_timeout(200)
        return math.hypot(float(at(pg, "x")) - x0, float(at(pg, "z")) - z0)
    STORE.update(v=5, doc=doc_with(False))
    pg, errs = open_room(); moved = walk(pg)
    check(1.8 < moved < 3.0, f"A solid wall stops you ({moved:.2f} m of a 1.7 s walk)")
    STORE.update(v=5, doc=doc_with(True))
    pg, errs = open_room(); pg.wait_for_timeout(1200); moved2 = walk(pg)
    check(moved2 > 3.6, f"A trigger you stand on hides the wall after its delay ({moved2:.2f} m)")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
