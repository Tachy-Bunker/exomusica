import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
NOW = time.time()
iso = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - ago))
BR = [{"id": 1, "slug": "hot", "name": "Hot", "lastActivityAt": iso(3600), "channel": None}, {"id": 2, "slug": "cold", "name": "Cold", "lastActivityAt": iso(90 * 86400), "channel": None}, {"id": 3, "slug": "none", "name": "None", "lastActivityAt": None, "channel": None}]
CH = [{"slug": "tw", "kind": "DISCUSSION", "lastMessageAt": int(NOW - 2 * 86400)}]
ALBUM = {"id": 1, "slug": "al1", "title": "First", "composer": "Ghost", "branch": {"name": "Full Branch", "slug": "full"}, "galleryImages": [], "collaborators": [], "links": [], "tracks": [{"id": 1, "source": "upload", "title": "t", "composer": "c", "durationSeconds": 60, "album": {"slug": "al1"}}]}
backreq = []


UNLOCKED = {"v": True}; heat_calls = []
HEAT = {"locked": False, "rows": [["branch:cold", 500], ["branch:hot", 3], ["study:s9", 40]]}
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk():
        ctx = browser.new_context(viewport={"width": 1280, "height": 700}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/branches": return ok(BR)
            if key == "/api/channels": return ok(CH)
            if key == "/api/studies": return ok([])
            if key == "/api/milestones": return ok([{"key": "m-thermal", "title": "Thermal lens", "perk": "x", "metric": "SCANS", "label": "scans", "target": 1000, "now": 1200 if UNLOCKED["v"] else 10, "reached": UNLOCKED["v"], "reachedAt": None, "live": True}])
            if key == "/api/scans/heat": heat_calls.append(1); return ok(HEAT)
            if key in ("/api/landmarks", "/api/field-log", "/api/chart", "/api/scans"): return ok([])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    ADD = "()=>{const w=document.createElement('div');w.innerHTML='<a id=h href=\"/branch/hot\">h</a><a id=c href=\"/branch/cold\">c</a><a id=s href=\"/study/s9\">s</a><a id=o href=\"/about\">o</a>';document.body.appendChild(w)}"
    p = mk(); p.goto(f"{BASE}/chart"); p.wait_for_selector("[data-testid=chart-page]"); p.evaluate(ADD)
    p.keyboard.press("i"); p.wait_for_selector("[data-testid=probe-hud]"); p.keyboard.press("2")
    p.wait_for_selector("[data-testid=heat-scanned]", timeout=4000)
    check(p.get_attribute("[data-testid=heat-recent]", "aria-pressed") == "true", "Unlocked: Thermal opens on the familiar Recent reading")
    check(p.evaluate("()=>document.getElementById('h').dataset.heat") == "4", "Recent: the recently active branch is hot")
    check(len(heat_calls) == 0, "…and the community data isn't fetched until asked for")
    p.click("[data-testid=heat-scanned]"); p.wait_for_function("()=>document.getElementById('c').dataset.heat==='4'", timeout=4000)
    hs = p.evaluate("()=>['h','c','s','o'].map(i=>document.getElementById(i).dataset.heat??null)")
    check(hs[1] == "4" and hs[0] in ("0", "1") and hs[2] in ("2", "3") and hs[3] is None, f"Scanned: the most-scanned page is hottest, unrelated untouched {hs}")
    p.click("[data-testid=heat-recent]"); p.wait_for_function("()=>document.getElementById('h').dataset.heat==='4'", timeout=4000)
    check(p.evaluate("()=>document.getElementById('c').dataset.heat") == "0", "Back to Recent")
    check(len(heat_calls) == 1, f"The community data was fetched once ({len(heat_calls)})")
    UNLOCKED["v"] = False; heat_calls.clear(); q = mk(); q.goto(f"{BASE}/chart"); q.wait_for_selector("[data-testid=chart-page]")
    q.keyboard.press("i"); q.wait_for_selector("[data-testid=probe-hud]"); q.keyboard.press("2"); q.wait_for_selector("[data-testid=heat-legend]"); q.wait_for_timeout(600)
    check(q.locator("[data-testid=heat-scanned]").count() == 0 and not heat_calls, "Before the milestone: no Scanned reading, no request")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
