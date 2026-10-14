import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
UNLOCKED = {"v": True}
MEM = {"generatedAt": 0, "count": 3, "members": [
  {"username": "ann", "avatarUrl": None, "bio": "", "joinedAt": 1, "tint": "#ff00aa", "studies": 0, "messages": 9},
  {"username": "bob", "avatarUrl": None, "bio": "", "joinedAt": 2, "tint": None, "studies": 0, "messages": 5},
  {"username": "cy", "avatarUrl": None, "bio": "", "joinedAt": 3, "tint": None, "studies": 0, "messages": 1}]}
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk():
        ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/members": return ok(MEM)
            if key == "/api/milestones": return ok([{"key": "m-roll", "title": "Roll call", "perk": "x", "metric": "MEMBERS", "label": "members", "target": 25, "now": 30 if UNLOCKED["v"] else 3, "reached": UNLOCKED["v"], "reachedAt": None, "live": True}])
            if key in DATA: return ok(DATA[key])
            return ok([])
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    pg = mk(); pg.goto(f"{BASE}/members?view=sky"); pg.wait_for_selector("[data-testid=members-sky]"); pg.wait_for_selector("circle.sky-star[data-color]", timeout=4000)
    cols = pg.evaluate("()=>[...document.querySelectorAll('circle.sky-star')].map(c=>getComputedStyle(c).fill)")
    check(len(set(cols)) == 3, f"Unlocked: every star has its own colour {cols}")
    check("rgb(255, 0, 170)" in cols, "A chosen tint shows exactly")
    UNLOCKED["v"] = False; q = mk(); q.goto(f"{BASE}/members?view=sky"); q.wait_for_selector("[data-testid=members-sky]"); q.wait_for_timeout(500)
    cols2 = q.evaluate("()=>[...document.querySelectorAll('circle.sky-star')].map(c=>getComputedStyle(c).fill)")
    check(len(set(cols2)) == 1 and q.locator("circle.sky-star[data-color]").count() == 0, f"Before 25 members: the usual pale stars {set(cols2)}")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
