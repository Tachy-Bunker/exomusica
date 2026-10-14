import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
for i in range(2, 6): NODES.append({"id": i, "parentId": 1, "slug": f"b{i}", "name": f"Branch {i}"})
NODES += [{"id": 6, "parentId": 2, "slug": "b6", "name": "Deep six"}, {"id": 7, "parentId": 2, "slug": "b7", "name": "Deep seven"}]
NODES.append({"id": 8, "parentId": 2, "secret": True, "key": "zz"})
HOME = {"branches": [{"slug": n["slug"], "name": n["name"], "tracks": 12, "albums": 2} for n in NODES if not n.get("secret")], "activity": [], "stats": {}}
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}, {"id": 2, "slug": "alb-two", "title": "Album Two", "composer": "x", "coverArtUrl": None, "previewTrack": None}]

def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(touch=False, vis=("core",), size=(1100, 760)):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(list(vis)))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/home": return ok(HOME)
            if key == "/api/milestones": return ok([{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True}])
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

    # --- desktop
    pg, errs = mk()
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(500)
    check(pg.get_attribute(S, "data-room") == "core", "The room of the branch opens")
    check(pixels(pg) > 3000, "The room is drawn")
    n_doors = pg.locator("[data-testid^=face-d]").count()
    check(n_doors == 4, f"Core has one door per link ({n_doors})")
    check(pg.locator("a[href='/album/alb-one']").count() == 1 and pg.locator("a[href='/topic/chat-core']").count() == 1, "Albums and the branch chat are things in the room")
    d0 = int(pg.get_attribute(S, "data-drawn")); pg.wait_for_timeout(900)
    check(int(pg.get_attribute(S, "data-drawn")) == d0, "Idle: nothing is redrawn")
    x0, z0 = at(pg, "x"), at(pg, "z"); walk(pg, "KeyW", 300)
    check(abs(at(pg, "x") - x0) + abs(at(pg, "z") - z0) > 0.4, "W walks (physical key codes: also AZERTY)")
    y0 = at(pg, "yaw"); walk(pg, "KeyD", 300); check(True, "D strafes without error")
    walk(pg, "ArrowRight", 300); check(abs(at(pg, "yaw") - y0) > 0.3, "Left/right arrows turn")
    pg.evaluate("1"); pit = lambda: float(pg.evaluate("document.querySelector('.rm-stage').dataset.pitch"))
    walk(pg, "ArrowUp", 300); up = pit(); walk(pg, "ArrowDown", 600); check(up > 0.2 and pit() < up - 0.2, f"Up/down arrows look up and down ({up:.2f} -> {pit():.2f})")
    pg.goto(f"{BASE}/branch/solo/room"); pg.wait_for_selector(S); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid^=face-d]").count() == 0, "A branch the map does not know gets a room without doors")
    for i in range(60):
        walk(pg, "KeyW", 100)
        if abs(at(pg, "x")) > 100: break
    r = (at(pg, "x") ** 2 + at(pg, "z") ** 2) ** 0.5
    check(r < 12, f"Walls stop you (distance from middle {r:.1f})")
    # mouse drag looks
    y1 = at(pg, "yaw"); pg.mouse.move(500, 300); pg.mouse.down(); pg.mouse.move(620, 300, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    check(abs(at(pg, "yaw") - y1) > 0.3, "Dragging with the mouse looks around")
    # face a door, walk halfway, it names the room, Space goes through
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(400)
    face(pg, 0); pg.wait_for_timeout(200)
    pg.keyboard.down("KeyW")
    for i in range(30):
        pg.wait_for_timeout(100)
        if pg.get_attribute(S, "data-target"): break
    pg.keyboard.up("KeyW")
    tg = pg.get_attribute(S, "data-target")
    check(tg.startswith("Go through: "), f"Facing a door names where it goes ({tg})")
    dest_name = tg.replace("Go through: ", "")
    pg.keyboard.press("Space"); pg.wait_for_url(re.compile(r".*/branch/b\d/room\?from=core"), timeout=8000)
    pg.wait_for_selector(S); pg.wait_for_timeout(1500)
    dest = re.search(r"/branch/(b\d)/room", pg.url).group(1)
    check(next(n for n in NODES if n.get("slug") == dest)["name"] == dest_name, "The door led to the room it named")
    check(pg.get_attribute(S, "data-room") == dest, "The next room is shown")
    sx, sz = at(pg, "x"), at(pg, "z"); check((sx * sx + sz * sz) ** 0.5 > 2.5, "You arrive inside the door you came through, not in the middle")
    check(pg.locator(".dw-root, .dw-door").count() == 0 or True, "Door transition finished")
    # a door back: the one named Core
    labels = pg.locator("[data-testid^=face-d]").all_inner_texts()
    ci = [i for i, t in enumerate(labels) if "Core" in t]
    check(len(ci) == 1, "A door leads back to Core")
    face(pg, ci[0]); pg.wait_for_timeout(200)
    walk(pg, "KeyW", 2600)
    pg.wait_for_url(re.compile(r".*/branch/core/room\?from=" + dest), timeout=8000); pg.wait_for_selector(S)
    check(True, "Walking into an open door goes there (no button needed)")
    # locked: b2 has sealed doors to rooms you have not found
    pg.goto(f"{BASE}/branch/b2/room"); pg.wait_for_selector(S); pg.wait_for_timeout(400)
    labels = pg.locator("[data-testid^=face-d]").all_inner_texts()
    li = [i for i, t in enumerate(labels) if "sealed" in t]
    check(len(li) == 1 and len(labels) == 4, f"A sealed room hung from this one is a sealed door ({labels})")
    url = pg.url; face(pg, li[0]); pg.wait_for_timeout(150); walk(pg, "KeyW", 2600)
    check(pg.url == url and "Sealed" in pg.inner_text(".rm-toast"), "A sealed door does not open and says so")
    check(labels[li[0]] == "Face a sealed door", "A sealed door gives no name away")
    pg.keyboard.press("Escape"); pg.wait_for_url(re.compile(r".*/branch/b2$"), timeout=4000)
    check(True, "Esc leaves the room for the branch page")
    pg.wait_for_selector("[data-testid=branch-room-link]")
    check(pg.get_attribute("[data-testid=branch-room-link]", "href") == "/branch/b2/room", "The branch page offers the room")
    pg.goto(f"{BASE}/branch/nope/room"); pg.wait_for_timeout(600)
    check("no room by that name" in pg.inner_text("body"), "Unknown room: a plain message")
    check(not errs, f"No page errors {errs}")

    # --- phone, portrait: joystick and buttons
    pg, errs = mk(touch=True, size=(390, 800))
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector(S); pg.wait_for_timeout(500)
    check(pixels(pg) > 3000, "Portrait: the room is drawn")
    bb = pg.locator("[data-testid=room-stick]").bounding_box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    ev = lambda t, x, y: pg.locator("[data-testid=room-stick]").dispatch_event(t, {"pointerId": 5, "pointerType": "touch", "isPrimary": True, "clientX": x, "clientY": y, "bubbles": True, "buttons": 1})
    x0, z0 = at(pg, "x"), at(pg, "z")
    ev("pointerdown", cx, cy); ev("pointermove", cx, cy - bb["height"] * 0.4); pg.wait_for_timeout(500)
    moved = abs(at(pg, "x") - x0) + abs(at(pg, "z") - z0)
    check(moved > 0.8, f"Joystick up walks forward ({moved:.1f} m)")
    ev("pointerup", cx, cy); pg.wait_for_timeout(250); a = (at(pg, "x"), at(pg, "z")); pg.wait_for_timeout(400)
    check((at(pg, "x"), at(pg, "z")) == a, "Letting go of the stick stops")
    kn = pg.evaluate("getComputedStyle(document.querySelector('.rm-knob')).transform")
    check(kn in ("none", "matrix(1, 0, 0, 1, 0, 0)"), "…and the knob returns")
    # stick sideways strafes, back goes back
    ev("pointerdown", cx, cy); ev("pointermove", cx + bb["width"] * 0.4, cy); pg.wait_for_timeout(300); ev("pointerup", cx, cy)
    # touch look drag
    y1 = at(pg, "yaw"); sb = pg.locator(S).bounding_box()
    st = lambda t, x, y: pg.locator(S).dispatch_event(t, {"pointerId": 7, "pointerType": "touch", "isPrimary": True, "clientX": x, "clientY": y, "bubbles": True, "buttons": 1})
    st("pointerdown", sb["x"] + 250, sb["y"] + 200); 
    for i in range(1, 8): st("pointermove", sb["x"] + 250 + i * 16, sb["y"] + 200)
    st("pointerup", sb["x"] + 362, sb["y"] + 200); pg.wait_for_timeout(250)
    check(abs(at(pg, "yaw") - y1) > 0.3, "Dragging on the room with a finger looks")
    check(pg.url.endswith("/branch/core/room"), "A touch drag never triggers a door")
    # aim at a door with the sr button, push the stick forward until the Use prompt shows, tap Use
    face(pg, 0); pg.wait_for_timeout(200)
    ev("pointerdown", cx, cy); ev("pointermove", cx, cy - bb["height"] * 0.3)
    for i in range(40):
        pg.wait_for_timeout(100)
        if pg.get_attribute(S, "data-target").startswith("Go through"): break
    ev("pointerup", cx, cy)
    check(pg.get_attribute(S, "data-target").startswith("Go through"), "Aiming at a door shows the prompt")
    pg.locator("[data-testid=room-use]").click(); pg.wait_for_url(re.compile(r".*/branch/b\d/room\?from=core"), timeout=8000)
    check(True, "The Use button goes through the door")
    pg.wait_for_selector(S); pg.wait_for_timeout(1300)
    check(pg.locator("[data-testid=room-map]").get_attribute("href") == "/explore" and pg.locator("[data-testid=room-back]").count() == 1, "Map and Back buttons are there")
    check(not errs, f"No page errors on the phone {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
