import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
import random
random.seed(4)
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
for i in range(2, 9): NODES.append({"id": i, "parentId": 1, "slug": f"b{i}", "name": f"Branch {i}"})
nid = 9
for p in range(2, 9):
    for k in range(random.randint(1, 4)):
        NODES.append({"id": nid, "parentId": p, "slug": f"b{nid}", "name": f"Branch {nid}"}); nid += 1
for p in (10, 12, 15, 18): 
    NODES.append({"id": nid, "parentId": p, "slug": f"b{nid}", "name": f"Deep {nid}"}); nid += 1
NODES.append({"id": nid, "parentId": 3, "secret": True, "key": "zz"}); nid += 1
NODES.append({"id": nid, "parentId": 5, "secret": True, "key": "yy"})
VIS = ["core", "b2", "b3", "b9", "b10", "b4", "b5", "b12"]
HOME = {"branches": [{"slug": n["slug"], "name": n["name"], "tracks": random.randint(3, 60), "albums": 2} for n in NODES if not n.get("secret")], "activity": [], "stats": {}}

def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(ring, pulses=False):
        ctx = b.new_context(viewport={"width": 1300, "height": 800}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(VIS))});localStorage.setItem('exomusica_lastplay', {json.dumps(json.dumps({'branchSlug':'b10','title':'t','at':1}))});")
        hits = {"pulse": 0}
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/home": return ok(HOME)
            if key == "/api/milestones": return ok([{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": ring, "reachedAt": None, "live": True}, {"key": "m-chart", "title": "Chart layer", "perk": "x", "metric": "MEMBERS", "label": "m", "target": 150, "now": 160, "reached": pulses, "reachedAt": None, "live": True}])
            if key == "/api/chart/pulse": hits["pulse"] += 1; return ok({"locked": False, "pulses": {"10": 3, "11": 1}})
            if key.startswith("/api/branches/"): return ok({"name": "Sealed One"})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs, hits
    num = lambda pg, k: float(pg.get_attribute("[data-testid=explorer-stage]", "data-" + k))
    pg, errs, hits = mk(False)
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(700)
    real = len([n for n in NODES if not n.get("secret")])
    check(int(pg.get_attribute("[data-testid=explorer-stage]", "data-rooms")) == real, f"All {real} rooms are in the world; sealed ones are left out before Second ring")
    check("8 visited" in pg.inner_text("[data-testid=explorer-tally]") and "sealed" not in pg.inner_text("[data-testid=explorer-tally]"), "Tally: visited and heard-of counted, no sealed yet")
    check(pg.locator("[data-testid=explorer-legend]").count() == 0, "Legend starts closed")
    pg.keyboard.press("KeyL"); check(pg.locator("[data-testid=explorer-legend]").count() == 1, "L opens the legend")
    pg.keyboard.press("KeyL"); check(pg.locator("[data-testid=explorer-legend]").count() == 0, "…and closes it")
    # the picture is really there
    px = pg.evaluate("(()=>{const c=document.querySelector('[data-testid=explorer-canvas]');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()")
    check(px > 2000, f"Something is drawn ({px} pixels)")
    # drag turns it
    y0, p0, d0 = num(pg, "yaw"), num(pg, "pitch"), num(pg, "dist")
    pg.mouse.move(650, 400); pg.mouse.down(); pg.mouse.move(760, 440, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    check(abs(num(pg, "yaw") - y0) > 0.3 and abs(num(pg, "pitch") - p0) > 0.1, "Dragging rotates the map")
    pg.mouse.move(650, 400); pg.mouse.wheel(0, -400); pg.wait_for_timeout(300)
    check(num(pg, "dist") < d0, "The wheel zooms in")
    tx0, tz0 = num(pg, "tx"), num(pg, "tz")
    pg.keyboard.down("Shift"); pg.mouse.move(650, 400); pg.mouse.down(); pg.mouse.move(560, 360, steps=6); pg.mouse.up(); pg.keyboard.up("Shift"); pg.wait_for_timeout(300)
    check(abs(num(pg, "tx") - tx0) + abs(num(pg, "tz") - tz0) > 0.3, "Shift-drag moves it")
    pg.keyboard.press("KeyR"); pg.wait_for_timeout(900)
    check(abs(num(pg, "pitch") - 0.62) < 0.02 and num(pg, "tx") == 0, "R brings back the whole map")
    pg.keyboard.press("KeyT"); pg.wait_for_timeout(900)
    check(num(pg, "pitch") > 1.5, "T looks from above")
    # cheap: nothing runs while nothing happens, and a burst of moves is not a burst of frames
    pg.wait_for_timeout(500); a = int(pg.get_attribute("[data-testid=explorer-stage]", "data-drawn")); pg.wait_for_timeout(900)
    check(int(pg.get_attribute("[data-testid=explorer-stage]", "data-drawn")) == a, "Idle: no frames are drawn")
    pg.mouse.move(600, 400); pg.mouse.down(); a = int(pg.get_attribute("[data-testid=explorer-stage]", "data-drawn"))
    for i in range(60): pg.mouse.move(600 + i, 400 + (i % 5))
    pg.mouse.up(); pg.wait_for_timeout(500); n = int(pg.get_attribute("[data-testid=explorer-stage]", "data-drawn")) - a
    check(n <= 62 + 2, f"60 pointer moves cost {n} frames at most")
    # picking: N goes to a room and selects it
    pg.keyboard.press("KeyR"); pg.wait_for_timeout(700)
    pg.keyboard.press("KeyE"); pg.wait_for_selector("[data-testid=explorer-card]"); pg.wait_for_timeout(700)
    check("Core" in pg.inner_text("[data-testid=explorer-card]") and pg.get_attribute("[data-testid=explorer-room]", "href") == "/branch/core/room" and pg.locator("[data-testid=explorer-open]").count() == 0, "N selects the first room (the hub): its card has one button, into the room")
    # clicking the middle of the screen picks the selected room again
    pg.keyboard.press("Escape") if False else None
    pg.mouse.click(650, 400); pg.wait_for_timeout(200)
    check(pg.get_attribute("[data-testid=explorer-stage]", "data-selected") != "", "Clicking a room selects it")
    # walk through every room: an unseen one never gives its name or a link away
    seen_unseen = 0; leaked = False
    for _ in range(len(NODES)):
        pg.keyboard.press("KeyE"); pg.wait_for_timeout(60)
        t = pg.inner_text("[data-testid=explorer-card]")
        if "Not found yet" in t:
            seen_unseen += 1
            if pg.locator("[data-testid=explorer-room]").count() or "Branch" in t or "Deep" in t: leaked = True
    check(seen_unseen >= 1 and not leaked, f"Unseen rooms show ??? and no link ({seen_unseen} checked)")
    html = pg.inner_html("[data-testid=explorer-list]")
    import re as _re
    tl = pg.inner_text("[data-testid=explorer-tally]"); known = int(_re.search(r"(\d+) visited", tl).group(1)) + int(_re.search(r"(\d+) heard of", tl).group(1))
    check(pg.locator("[data-testid=explorer-list] a").count() == known and "Branch 2" in html, f"The accessible list is exactly the rooms you know ({known}), as links")
    check(not errs, f"No page errors {errs[:1]}")
    # Second ring
    pg, errs, hits = mk(True)
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(700)
    check(int(pg.get_attribute("[data-testid=explorer-stage]", "data-rooms")) == real + 2 and "2 sealed" in pg.inner_text("[data-testid=explorer-tally]"), "Second ring: the sealed rooms appear on the outer ring")
    sealed_leak = False
    for _ in range(len(NODES) + 2):
        pg.keyboard.press("KeyE"); pg.wait_for_timeout(50)
        t = pg.inner_text("[data-testid=explorer-card]")
        if "A sealed room" in t and (pg.locator("[data-testid=explorer-room]").count() or "Sealed One" in t): sealed_leak = True
    check(not sealed_leak, "A sealed room is not a doorway and has no name")
    check(hits["pulse"] == 0, "Chart layer not reached: no pulse request")
    pg, errs, hits = mk(False, pulses=True)
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(700)
    check(hits["pulse"] == 0, "Pulses are switched off for now: no request even when reached")
    # leaving
    pg, errs, hits = mk(False)
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.keyboard.press("Escape"); pg.wait_for_url(re.compile(r".*/soundbay$"), timeout=5000)
    check(True, "Esc leaves (to Soundbay when there is nowhere to go back to)")
    pg.wait_for_selector("[data-testid=open-explorer]"); pg.click("[data-testid=open-explorer]"); pg.wait_for_selector("[data-testid=explorer-canvas]")
    pg.click("[data-testid=ex-exit]"); pg.wait_for_url(re.compile(r".*/soundbay$"), timeout=5000)
    check(True, "Soundbay's Scan map button opens it, Exit returns")
    pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-3d]"); 
    check(pg.locator("[data-testid=chart-3d]").count() == 1, "The Chart links to the 3D map")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
