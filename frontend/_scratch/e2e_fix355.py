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
    MSGS = [{"id": i, "channelId": 9, "authorId": 3, "authorUsername": u, "authorAvatarUrl": None, "unixTimestamp": 1700000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": t, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": []} for i, (u, t) in enumerate([("ann", "anyone hear that **bass**?"), ("bo", "https://x.example/very/long yes!"), ("cy", "a long message that needs cutting down to fit a screen")])]
    hits = []
    def setup(extra=None):
        pg, errs = mk(); pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
        def h(route):
            hits.append(route.request.url)
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(MSGS))
        pg.context.route(re.compile(r".*/api/channels/chat-core/(archive|participants|pins|follow).*"), lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))
        pg.context.route(re.compile(r".*/api/channels/chat-core/messages.*"), h)
        return pg, errs
    # ---- the room: Classic view and Esc
    pg, errs = setup()
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(900)
    check(pg.get_attribute("[data-testid=room-back]", "href") == "/branch/core" and "Classic view" in pg.inner_text("[data-testid=room-back]"), "The room has a Classic view button to the ordinary page")
    # ---- the terminal's screen already holds the last lines
    check(at(pg, "chat") == "3", f"The chat terminal screen holds the last 3 lines ({at(pg, 'chat')})")
    check(any("limit=3" in u for u in hits), "…read with one small request")
    pg.evaluate("document.querySelector('[data-prop=terminal]').click()"); pg.wait_for_timeout(250)
    MSGS.append({**MSGS[0], "id": 9, "authorUsername": "dee", "contentRaw": "new one"}); n0 = len(hits)
    pg.keyboard.press("Space"); pg.wait_for_selector("[data-testid=room-terminal]", timeout=3000); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_selector("[data-testid=room-terminal]", state="detached", timeout=3000); pg.wait_for_timeout(600)
    check(len(hits) > n0, "Closing the terminal reads the lines again")
    check(not errs, f"No page errors {errs}")
    # the screen is seen when close: look at the terminal
    pg.evaluate("document.querySelector('[data-testid=face-terminal]') && document.querySelector('[data-testid=face-terminal]').click()")
    pg.wait_for_timeout(300); pg.screenshot(path="/tmp/term.png", clip={"x": 0, "y": 100, "width": 1100, "height": 560})
    pg.keyboard.press("Escape"); pg.wait_for_url(re.compile(r".*/explore$"), timeout=4000)
    check(True, "Esc leaves the room for the Scan map")
    # ---- the branch page: rooms-first switch
    pg, errs = setup()
    pg.goto(f"{BASE}/branch/core"); pg.wait_for_selector("[data-testid=rooms-first]")
    check(pg.is_checked("[data-testid=rooms-first]"), "Opening branches as 3D rooms is on by default")
    pg.uncheck("[data-testid=rooms-first]"); check(pg.evaluate("localStorage.getItem('exomusica_rooms3d')") == "0", "…and can be switched off")
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(600)
    pg.keyboard.press("KeyE"); pg.wait_for_selector("[data-testid=explorer-card]"); pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=explorer-open]").count() == 1 and pg.locator("[data-testid=explorer-soundbay]").count() == 1, "With it off the map card offers the old choices")
    pg.evaluate("localStorage.setItem('exomusica_rooms3d','1')"); pg.reload(); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(600)
    pg.keyboard.press("KeyE"); pg.wait_for_selector("[data-testid=explorer-card]"); pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=explorer-room]").count() == 1 and pg.locator("[data-testid=explorer-open]").count() == 0 and pg.locator("[data-testid=explorer-soundbay]").count() == 0, "With it on the card has one button: Enter")
    check("Enter" in pg.inner_text("[data-testid=explorer-room]"), "…called Enter")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
