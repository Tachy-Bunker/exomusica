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
RING = "--ring" in sys.argv
def run(pw):
    b = pw.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 800}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(VIS))});localStorage.setItem('exomusica_lastplay', {json.dumps(json.dumps({'branchSlug':'b10','title':'t','at':1}))});")
    def handle(route):
        path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
        if key == "/api/chart": return ok(NODES)
        if key == "/api/home": return ok(HOME)
        if key == "/api/milestones": return ok([{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": RING, "reachedAt": None, "live": True}])
        if key == "/api/chart/pulse": return ok({"locked": True, "pulses": {}})
        if key.startswith("/api/branches/"): return ok({"name": "Sealed One"})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: print("PAGEERROR", str(e)[:300]))
    pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explorer-canvas]"); pg.wait_for_timeout(900)
    pg.screenshot(path="/tmp/ex1.png")
    pg.keyboard.press("l"); pg.keyboard.press("t"); pg.wait_for_timeout(900); pg.screenshot(path="/tmp/ex2.png")
    b.close()
with sync_playwright() as p: run(p)
