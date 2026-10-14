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
    posts = []
    def setup(visor=True, lore=True):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        MS = [{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True},
              {"key": "m-visor", "title": "Echo visor", "perk": "x", "metric": "SCANS", "label": "s", "target": 1500, "now": 1600 if visor else 900, "reached": visor, "reachedAt": None, "live": True}]
        LORE = [{"id": 1, "key": "room:core/door/b2", "title": "The first door", "body": "It hums at night."}] if lore else []
        def h(route):
            u = route.request.url; ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if "/api/milestones" in u: return ok(MS)
            if "/api/lore" in u: return ok(LORE)
            if "/api/scans" in u:
                if route.request.method == "POST": posts.append(json.loads(route.request.post_data)); return route.fulfill(status=204)
                return ok([])
            return route.fallback()
        pg.context.route(re.compile(r".*/api/(milestones|lore|scans).*"), h)
        return pg, errs
    # ---- the visor is locked until the community unlocks it
    pg, errs = setup(visor=False)
    pg.goto(f"{BASE}/branch/b2/room"); pg.wait_for_selector(S); pg.wait_for_timeout(700)
    pg.keyboard.press("KeyV"); pg.wait_for_timeout(300)
    check("1500" in pg.inner_text(".rm-toast") and at(pg, "echo") == "", f"Locked visor says how far away it is ({pg.inner_text('.rm-toast')!r})")
    # ---- unlocked: ping
    pg, errs = setup()
    pg.goto(f"{BASE}/branch/b2/room"); pg.wait_for_selector(S); pg.wait_for_timeout(900)
    pg.keyboard.press("KeyV"); pg.wait_for_timeout(500)
    check(at(pg, "echo") == "1", "V sends a ping")
    pg.keyboard.press("KeyV"); pg.wait_for_timeout(200)
    check("ringing" in pg.inner_text(".rm-toast"), "A second ping has to wait")
    pg.wait_for_timeout(1800); pg.click("[data-testid=room-ping]"); pg.wait_for_timeout(300)
    check(at(pg, "echo") == "1", "The Ping button works too")
    n0 = int(at(pg, "drawn")); pg.wait_for_timeout(1500); n1 = int(at(pg, "drawn"))
    check(n1 > n0 + 30, f"The room repaints while the ring is sweeping ({n1 - n0} frames in 1.5 s)")
    pg.wait_for_timeout(12000); n2 = int(at(pg, "drawn")); pg.wait_for_timeout(1000)
    check(at(pg, "echo") == "" and int(at(pg, "drawn")) == n2, "…and goes quiet again once the answers fade")
    check(not errs, f"No page errors {errs}")
    # ---- scanning
    pg, errs = setup(); posts.clear()
    pg.goto(f"{BASE}/branch/core/room"); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector(S); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('[data-testid=face-d0]').click()"); pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(500); pg.keyboard.up("KeyW"); pg.wait_for_timeout(150)
    pg.keyboard.press("KeyX"); pg.wait_for_function("document.querySelector('[data-testid=room-stage]').dataset.scan", timeout=900)
    p = at(pg, "scan"); check(p not in (None, ""), f"X starts a scan, a ring fills ({p})")
    pg.wait_for_selector("[data-testid=room-scan-card]", timeout=3000)
    card = pg.inner_text("[data-testid=room-scan-card]")
    check("The first door" in card and "It hums at night." in card and "lore" in card, f"The owner's lore is what the scan shows ({card!r})")
    check(any(b["kind"] == "lore" and b["key"] == "room:core/door/b2" for b in posts), f"The scan is recorded on the account ({posts})")
    posts.clear(); pg.wait_for_timeout(9500)
    check(pg.locator("[data-testid=room-scan-card]").count() == 0, "The card goes away by itself")
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(400)
    check(pg.locator("[data-testid=room-scan-card]").count() == 1 and posts == [], "Scanning again just shows it again")
    # the inscription: plain text (no lore for it), from the branch description
    pg.evaluate("document.querySelector('[data-testid=face-plaque]').click()"); pg.wait_for_timeout(300)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(1500); pg.keyboard.up("KeyW"); pg.wait_for_timeout(200)
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(1400)
    card = pg.inner_text("[data-testid=room-scan-card]") if pg.locator("[data-testid=room-scan-card]").count() else ""
    check("Inscription" in card and any(b["key"] == "branch:core" for b in posts), f"The wall's inscription can be scanned ({card!r})")
    # a scan is lost when you turn away
    pg.wait_for_timeout(9300)
    pg.evaluate("document.querySelector('[data-testid=face-d1]').click()"); pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW"); pg.wait_for_timeout(400); pg.keyboard.up("KeyW"); pg.wait_for_timeout(100)
    pg.keyboard.press("KeyX"); pg.wait_for_timeout(200)
    pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(900); pg.keyboard.up("ArrowRight"); pg.wait_for_timeout(300)
    check("lost" in pg.inner_text(".rm-toast") and at(pg, "scan") == "", "Turning away cancels the scan")
    # ---- the logbook
    pg.keyboard.press("KeyL"); pg.wait_for_selector("[data-testid=logbook]", timeout=3000)
    tot = pg.inner_text("[data-testid=logbook-total]")
    check(re.search(r"\d+%", tot) and int(re.search(r"(\d+)%", tot).group(1)) > 0, f"The logbook shows a completion ({tot!r})")
    x0 = at(pg, "x"); pg.keyboard.down("KeyW"); pg.wait_for_timeout(400); pg.keyboard.up("KeyW")
    check(at(pg, "x") == x0, "The room keeps still while the logbook is open")
    pg.locator("[data-testid=logbook-room] button").first.click(); pg.wait_for_timeout(200)
    ents = pg.locator("[data-testid=logbook-entry]").all_inner_texts()
    check(any("The first door" in e for e in ents) and any("Inscription" in e for e in ents), f"Scanned things are written up ({len(ents)})")
    check(pg.locator("[data-testid=logbook-unknown]").count() >= 1, "Things not scanned yet show as ???")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=logbook]").count() == 0 and "/room" in pg.url, "Esc closes the logbook, not the room")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
