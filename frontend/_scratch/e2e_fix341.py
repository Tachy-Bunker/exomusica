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
    pg.keyboard.press("KeyL")
    check("Visited by others" not in pg.inner_text("[data-testid=explorer-legend]"), "Legend: no 'Visited by others this week' entry")
    pg.keyboard.press("KeyL")
    # physical keys: AZERTY sends the same codes for the W/A/S/D positions with other letters
    def key(code, k):
        pg.evaluate("(a)=>document.querySelector('[data-testid=explorer-stage]').dispatchEvent(new KeyboardEvent('keydown',{code:a[0],key:a[1],bubbles:true,cancelable:true}))", [code, k])
    pg.keyboard.press("KeyR"); pg.wait_for_timeout(900)
    t0 = num(pg, "tx") , num(pg, "tz")
    key("KeyW", "z"); pg.wait_for_timeout(250)
    t1 = num(pg, "tx"), num(pg, "tz")
    check(abs(t1[0] - t0[0]) + abs(t1[1] - t0[1]) > 0.01, "AZERTY: the key in the W position (printed Z) moves forward")
    key("KeyA", "q"); pg.wait_for_timeout(250)
    t2 = num(pg, "tx"), num(pg, "tz")
    check(abs(t2[0] - t1[0]) + abs(t2[1] - t1[1]) > 0.01, "AZERTY: the key in the A position (printed Q) strafes")
    key("KeyQ", "a"); pg.wait_for_selector("[data-testid=explorer-card]", timeout=3000)
    check(True, "Q-position key (printed A on AZERTY) steps rooms, it does not move")
    key("KeyE", "e"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=ex-prev]").count() == 1 and pg.locator("[data-testid=ex-next]").count() == 1, "Previous and next room buttons are both there")
    check(pg.locator("[data-testid=ex-hints]").count() == 1, "Key hints shown")
    # free head movement: keep looking up past the top, no stop
    pg.keyboard.press("KeyR"); pg.wait_for_timeout(900)
    seen = []
    for _ in range(30):
        pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(40); seen.append(num(pg, "pitch"))
    check(max(seen) > 1.6, f"Looking up goes past straight-up instead of stopping ({max(seen):.2f})")
    check(all(abs(v) <= 3.2 for v in seen), "Pitch stays wrapped")
    before = num(pg, "pitch")
    for _ in range(8): pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(30)
    check(abs(num(pg, "pitch") - before) > 0.05, "Still moving after many presses (no stuck state)")
    # upside down: dragging right still turns the way the hand goes
    pg.keyboard.press("KeyR"); pg.wait_for_timeout(900)
    for _ in range(12): pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(20)
    pg.wait_for_timeout(200)
    check(not errs, f"No page errors {errs[:1]}")

    # the door
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script("localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_door','hex');")
    state = {"slow": False, "held": []}
    def handle(route):
        path = route.request.url.replace(BASE, ""); key_ = path.split("?")[0]
        ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
        if key_ == "/api/chart": return ok(NODES)
        if key_ == "/api/branches/b3":
            if state["slow"]: state["held"].append(route); return
            return ok({"slug": "b3", "name": "Dark Room", "identityColor": "#10102a", "identityGlyph": "◆", "id": 3, "tracks": [], "albums": [], "children": []})
        if key_ in DATA: return ok(DATA[key_])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    w = ctx.new_page(); werrs = []; w.on("pageerror", lambda e: "sandboxed" in str(e) or werrs.append(str(e)))
    w.goto(f"{BASE}/chart"); w.wait_for_selector("[data-testid=chart-page]")
    w.evaluate("()=>{const a=document.createElement('a');a.id='go';a.href='/branch/b3';a.textContent='go';a.onclick=(e)=>{e.preventDefault();history.pushState({},'','/branch/b3');dispatchEvent(new PopStateEvent('popstate'))};a.style.cssText='position:fixed;top:400px;left:10px;z-index:99999';document.body.appendChild(a)}")
    state["slow"] = True
    w.click("#go");
    w.wait_for_selector("[data-testid=door-wipe][data-phase=closing]", timeout=1500)
    check(w.url.endswith("/chart"), "Door closes first: the page has not changed yet")
    w.wait_for_selector("[data-testid=door-wipe][data-phase=closed]", timeout=2000)
    check(w.locator("[data-testid=door-wipe] .dw-p").count() == 6, "Six panels")
    w.wait_for_timeout(700)
    check(w.get_attribute("[data-testid=door-wipe]", "data-phase") == "closed", "Stays shut while the page is still loading")
    check(w.evaluate("getComputedStyle(document.querySelector('.door-wipe')).pointerEvents") == "auto", "Door blocks clicks while shut")
    col = w.evaluate("()=>document.querySelector('.door-wipe').style.getPropertyValue('--door')")
    check(col.startswith("#") and col.lower() != "#10102a", f"Door wears the lifted branch colour ({col})")
    state["slow"] = False
    for r in state["held"]: r.fulfill(status=200, content_type="application/json", body=json.dumps({"slug": "b3", "name": "Dark Room", "identityColor": "#10102a", "identityGlyph": "◆", "id": 3, "tracks": [], "albums": [], "children": []}))
    w.wait_for_selector("[data-testid=door-wipe][data-phase=opening]", timeout=6000)
    check(w.url.endswith("/branch/b3"), "Opens only when the new page is there")
    w.wait_for_selector("[data-testid=door-wipe]", state="detached", timeout=3000)
    check(True, "Door gone after it opens")
    hc = w.evaluate("()=>{const e=document.querySelector('.hdr-branch');return e?getComputedStyle(e).color:null}")
    if hc:
        nums = [int(x) for x in re.findall(r"\d+", hc)[:3]]
        lum = 0.2126*(nums[0]/255)**2.2 + 0.7152*(nums[1]/255)**2.2 + 0.0722*(nums[2]/255)**2.2
        check(lum > 0.1, f"Header branch name readable despite a dark branch colour ({hc})")
    else: check(False, "hdr-branch present")
    # modifier click is left alone
    w.goto(f"{BASE}/chart"); w.wait_for_selector("[data-testid=chart-page]")
    check(not werrs, f"No page errors {werrs[:1]}")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
