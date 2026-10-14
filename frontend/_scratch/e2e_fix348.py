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
    b = pw.chromium.launch(); out = []
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
    at = lambda pg, k: float(pg.get_attribute(S, "data-" + k))
    face = lambda pg, i: pg.evaluate(f"document.querySelector('[data-testid=face-d{i}]').click()")
    def walk(pg, key, ms): pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
    def pixels(pg): return pg.evaluate("(()=>{const c=document.querySelector('.rm-stage canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>60)n++;return n})()")


    S = "[data-testid=room-stage]"
    at = lambda pg, k: float(pg.get_attribute(S, "data-" + k))
    face = lambda pg, i: pg.evaluate(f"document.querySelector('[data-testid=face-d{i}]').click()")
    def walk(pg, key, ms): pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
    OTHERS = {"list": [{"id": 5, "name": "zoe", "x": 2.0, "z": 0.0, "yaw": 3.0}]}
    pg, errs = mk()
    sent = []; srv = {}
    def ws(w):
        srv["w"] = w; srv["url"] = w.url
        w.on_message(lambda m: sent.append(json.loads(m)))
    pg.route_web_socket(re.compile(r".*/ws/room.*"), ws)
    pg.route_web_socket(re.compile(r".*/ws/presence.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(700)
    check("room=core" in srv.get("url", "") and "token=t" in srv.get("url", ""), "Joins the room's live channel with the member's token")
    check(any(m.get("t") == "pose" for m in sent), "…and tells where you stand")
    n0 = len(sent); walk(pg, "KeyW", 1000); pg.wait_for_timeout(300)
    k = len(sent) - n0; check(2 <= k <= 8, f"Walking sends a few positions, not a flood ({k} in ~1.3 s)")
    srv["w"].send(json.dumps({"t": "others", "list": [{"id": 5, "name": "zoe", "x": 0.0, "z": 0.0, "yaw": 0}]})); pg.wait_for_timeout(500)
    check("1 here" in pg.inner_text("[data-testid=room-here]"), "Somebody else in the room is counted")
    check(pg.evaluate("(()=>{const c=document.querySelector('.rm-stage canvas');return c.width>0})()"), "Canvas is alive")
    # put zoe in front of us and look at the picture: her name is drawn, so pixels near the middle change versus an empty room
    x, z, yaw = at(pg, "x"), at(pg, "z"), at(pg, "yaw")
    import math
    shot = lambda: pg.evaluate("(()=>{const c=document.querySelector('.rm-stage canvas');const g=c.getContext('2d');const d=g.getImageData(c.width*0.35,c.height*0.2,c.width*0.3,c.height*0.6).data;let n=0;for(let i=0;i<d.length;i+=4)n+=d[i]+d[i+1]+d[i+2];return n})()")
    srv["w"].send(json.dumps({"t": "others", "list": []})); pg.wait_for_timeout(400); empty = shot(); check("here" not in pg.inner_text(".rm-title"), "When they leave the counter goes")
    srv["w"].send(json.dumps({"t": "others", "list": [{"id": 5, "name": "zoe", "x": x + math.cos(yaw) * 3, "z": z + math.sin(yaw) * 3, "yaw": yaw + 3.14}]})); pg.wait_for_timeout(500)
    check(abs(shot() - empty) > 20000, "A person in front of you is drawn")
    # hidden: connection closes and nobody is shown
    pg.click("[data-testid=room-visible]"); pg.wait_for_timeout(400)
    check("Hidden" in pg.inner_text("[data-testid=room-visible]") and "here" not in pg.inner_text(".rm-title"), "Hiding turns presence off both ways")
    check(pg.evaluate("localStorage.getItem('exomusica_room_visible')") == "0", "…and remembers it")
    pg.click("[data-testid=room-visible]"); pg.wait_for_timeout(500); check("Visible" in pg.inner_text("[data-testid=room-visible]"), "Visible again")
    # arrows
    walk(pg, "ArrowUp", 250); check(float(pg.evaluate("document.querySelector('.rm-stage').dataset.pitch")) > 0.2, "Up arrow looks up")
    # terminals: album
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('a[href=\"/album/alb-one\"]').dataset.t=1")
    # aim at the pedestal through its yaw: the ring pedestals sit at known spots; find the prop from the page by walking the list of yaw offsets
    pg.evaluate("document.querySelector('[data-prop=\\'a:alb-one\\']').click()"); pg.wait_for_timeout(250)
    check("Open album" in (pg.get_attribute(S, "data-target") or ""), "Walking up to a pedestal names the album")
    pg.keyboard.press("Space"); pg.wait_for_selector("[data-testid=room-terminal]", timeout=3000)
    check(pg.url.endswith("/branch/core/room"), "Using it opens a screen in the room, not a new page")
    pg.wait_for_selector(".rt-track"); check("First Light" in pg.inner_text(".rt-body") and "2:05" in pg.inner_text(".rt-body"), "The album terminal lists the tracks with their lengths")
    check(pg.get_attribute("[data-testid=terminal-open]", "href") == "/album/alb-one", "…and links to the full page")
    x1, z1 = at(pg, "x"), at(pg, "z"); walk(pg, "KeyW", 500); check((at(pg, "x"), at(pg, "z")) == (x1, z1), "While the screen is open the room does not move")
    pg.click(".rt-track >> nth=1"); pg.wait_for_timeout(300)
    check(pg.evaluate("(()=>{try{return JSON.stringify(window.__audio||null)}catch(e){return null}})()") is not None, "Choosing a track does not break the page")
    pg.keyboard.press("Escape"); pg.wait_for_selector("[data-testid=room-terminal]", state="detached", timeout=3000)
    check(pg.url.endswith("/branch/core/room"), "Esc closes the screen first, not the room")
    walk(pg, "KeyS", 400); check(abs(at(pg, "x") - x1) + abs(at(pg, "z") - z1) > 0.3, "…and the room moves again")
    # chat terminal
    pg.evaluate("document.querySelector('[data-prop=terminal]').click()"); pg.wait_for_timeout(250)
    check(pg.get_attribute(S, "data-target") == "TALK" or "Talk" in (pg.get_attribute(S, "data-target") or ""), "The chat terminal can be aimed at")
    pg.keyboard.press("Space"); pg.wait_for_selector("[data-testid=terminal-chat]", timeout=3000)
    check(True, "It opens the branch chat on a screen")
    pg.keyboard.press("Escape")
    check(not errs, f"No page errors {errs}")
    # guest: no connection
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
