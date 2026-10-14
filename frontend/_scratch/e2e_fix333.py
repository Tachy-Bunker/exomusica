import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
ON = {"echo": True, "index": True}; calls = {"echo": 0, "frag": 0}; frags = [{"text": "First fragment about slow detuning.", "title": "Detune", "href": "/wiki/detune"}, {"text": "Second fragment about grains.", "title": "Grains", "href": "/wiki/grains"}]
ECHO = {"text": "I keep coming back to how a single sine, slowly detuned, feels like a room breathing.", "by": "ann", "channelName": "Art You Like", "at": 1741514400000, "href": "/topic/art?day=2025-03-09#m-4"}
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk():
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/echo": calls["echo"] += 1; return ok({"locked": not ON["echo"], "echo": ECHO if ON["echo"] else None})
            if key == "/api/log/fragment": i = calls["frag"]; calls["frag"] += 1; return ok({"locked": False, "fragment": frags[i % 2]})
            if key == "/api/milestones": return ok([{"key": "m-index", "title": "Index", "perk": "x", "metric": "WIKIPAGES", "label": "wiki pages", "target": 200, "now": 210 if ON["index"] else 5, "reached": ON["index"], "reachedAt": None, "live": True}])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok([])
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or "volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    pg = mk(); pg.goto(f"{BASE}/"); pg.wait_for_selector("[data-testid=echo]", timeout=6000)
    check("room breathing" in pg.inner_text("[data-testid=echo]") and "ann in Art You Like" in pg.inner_text("[data-testid=echo]"), "Unlocked: the homepage shows the day's Echo with author and chat")
    check(pg.get_attribute("[data-testid=echo-link]", "href") == "/topic/art?day=2025-03-09#m-4", "…linking to the original message")
    ON["echo"] = False; q = mk(); q.goto(f"{BASE}/"); q.wait_for_selector("[data-testid=activity], .home-placeholder", timeout=6000); q.wait_for_timeout(600)
    check(q.locator("[data-testid=echo]").count() == 0, "Locked: no Echo section at all")

    r = mk(); r.goto(f"{BASE}/wiki"); r.wait_for_selector("[data-testid=fragment-btn]", timeout=6000)
    check(r.locator("[data-testid=fragment]").count() == 0, "Index: the button shows first, no fragment yet")
    r.click("[data-testid=fragment-btn]"); r.wait_for_selector("[data-testid=fragment]")
    check("slow detuning" in r.inner_text("[data-testid=fragment]") and r.get_attribute("[data-testid=fragment-link]", "href") == "/wiki/detune", "A click shows a passage and where it came from")
    check("Another" in r.inner_text("[data-testid=fragment-btn]"), "The button now offers another")
    r.click("[data-testid=fragment-btn]"); r.wait_for_function("()=>document.querySelector('[data-testid=fragment]').innerText.includes('grains')")
    check(True, "…and gets a different one")
    ON["index"] = False; s = mk(); s.goto(f"{BASE}/wiki"); s.wait_for_timeout(1000)
    check(s.locator("[data-testid=fragment-btn]").count() == 0, "Before the milestone: no Random fragment button")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
