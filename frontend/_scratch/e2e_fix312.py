import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None, mobile=False):
        kw = dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True) if mobile else dict(viewport={"width": 1280, "height": 800})
        ctx = browser.new_context(service_workers="block", **kw)
        init = ""
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        for k, v in (seed or {}).items(): init += f"if(localStorage.getItem({json.dumps(k)})===null)localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
        init += "if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if key == "/api/landmarks": return ok([])
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    probe_on = lambda pg: pg.evaluate("document.body.classList.contains('probe')")
    tour = lambda pg: pg.evaluate("localStorage.getItem('exomusica_tour')")
    step = lambda pg: pg.inner_text("[data-testid=tour-card] .tour-step")

    g = mk(None)
    g.goto(f"{BASE}/"); g.wait_for_selector("[data-testid=tour-invite]")
    check(True, "Visitor: the invitation is on the first visit")
    g.click("[data-testid=tour-no]")
    check(g.locator("[data-testid=tour-invite]").count() == 0 and tour(g) == "skipped", "No thanks: gone, and remembered")
    g.reload(); g.wait_for_selector("[data-testid=home-page]"); g.wait_for_timeout(400)
    check(g.locator("[data-testid=tour-invite]").count() == 0, "No thanks: not asked again")

    t = mk(None)
    t.goto(f"{BASE}/"); t.wait_for_selector("[data-testid=tour-start]"); t.wait_for_selector("[data-testid=home-stats] a"); t.click("[data-testid=tour-start]")
    t.wait_for_selector("[data-testid=tour-card]")
    check(step(t).endswith("1/5") and probe_on(t), f"Start: five stops, Probe comes on ({step(t)})")
    check(t.locator("[data-probe-key='tour:hero']").count() == 1 and t.locator(".tour-cur").count() == 1, "Only the current stop is marked")
    t.locator("[data-probe-key='tour:hero']").hover(); t.wait_for_selector("[data-testid=probe-card]", timeout=4000)
    check("The core" in t.inner_text("[data-testid=probe-card]"), "Scanning the stop reads out its text")
    t.wait_for_function("document.querySelector('[data-testid=tour-card] .tour-step').textContent.endsWith('2/5')", timeout=4000)
    check(t.locator("[data-probe-key='tour:hero']").count() == 0 and t.locator("[data-probe-key='tour:stats']").count() == 1, "Scan advanced it; the old stop is unmarked")
    t.click("[data-testid=tour-next]"); t.click("[data-testid=tour-next]"); t.click("[data-testid=tour-next]")
    check(step(t).endswith("5/5") and "Finish" in t.inner_text("[data-testid=tour-next]") and t.locator("[data-testid=tour-join]").count() == 1, "Fifth stop: Finish, and a Join button")
    t.click("[data-testid=tour-next]"); t.wait_for_timeout(200)
    check(tour(t) == "done" and not probe_on(t) and t.locator("[data-testid=tour-card]").count() == 0, "Finish: remembered, Probe goes back off")
    check(t.locator("[data-probe-key^='tour:']").count() == 0, "Nothing left marked on the page")

    s = mk(None)
    s.goto(f"{BASE}/?tour=1"); s.wait_for_selector("[data-testid=tour-card]")
    s.click("[data-testid=tour-skip]"); s.wait_for_timeout(200)
    check(tour(s) == "skipped" and not probe_on(s), "Skip: ends at once")
    s.goto(f"{BASE}/?tour=1"); s.wait_for_selector("[data-testid=tour-card]"); s.keyboard.press("Escape"); s.wait_for_timeout(200)
    check(s.locator("[data-testid=tour-card]").count() == 0, "Esc skips too")
    check("tour=1" not in s.url, "The ?tour=1 is tidied away")

    m = mk(ME)
    m.goto(f"{BASE}/"); m.wait_for_selector("[data-testid=home-page]"); m.wait_for_timeout(500)
    check(m.locator("[data-testid=tour-invite]").count() == 0, "Members are not invited")
    m.goto(f"{BASE}/account"); m.wait_for_selector("[data-testid=tour-redo]"); m.click("[data-testid=tour-redo]"); m.wait_for_selector("[data-testid=tour-card]")
    check(step(m).split("·")[1].strip().startswith("1/"), f"Redo from Account works ({step(m)})")

    c = mk(None, {"exomusica_classic": "1"})
    c.goto(f"{BASE}/"); c.wait_for_selector("[data-testid=home-page]"); c.wait_for_timeout(400)
    check(c.locator("[data-testid=tour-invite]").count() == 0, "Classic mode: no invitation")
    c.goto(f"{BASE}/?tour=1"); c.wait_for_selector("[data-testid=tour-card]")
    check(not probe_on(c) and c.locator(".tour-cur").count() == 1, "Classic mode: plain highlight, Probe stays off")
    c.click("[data-testid=tour-next]")
    check(step(c).endswith("2/5"), "Classic mode: Next works")

    # ---- phone
    ph = mk(ME, None, True)
    ph.goto(f"{BASE}/study/mine-1"); ph.wait_for_selector("[data-testid=fp-lens]")
    ph.tap("[data-testid=fp-lens]"); ph.wait_for_selector("[data-testid=probe-hud]")
    check("tap a bracket" in ph.inner_text("[data-testid=probe-hud]"), "Phone: the HUD speaks in taps")
    ph.tap("a[href$='/album/al1']"); ph.wait_for_selector("[data-testid=probe-card]", timeout=3000)
    check(ph.url.endswith("/study/mine-1") and "First" in ph.inner_text("[data-testid=probe-card]"), "Phone: one tap scans, it does not follow the link")
    box = ph.locator("[data-testid=probe-card]").bounding_box()
    check(box["x"] >= 0 and box["x"] + box["width"] <= 391, f"Phone: the card fits the screen {box}")
    check(ph.locator("[data-testid=probe-open]").count() == 1, "Phone: the card has an Open button")
    ph.screenshot(path="/tmp/ph_probe.png")
    ph.tap("[data-testid=probe-open]"); ph.wait_for_url("**/album/al1")
    check(True, "Phone: Open follows the link")
    ph.go_back(); ph.wait_for_selector("[data-testid=fp-lens]")
    ph.tap("[data-testid=fp-lens]"); ph.tap("a[href$='/album/al1']"); ph.wait_for_selector("[data-testid=probe-card]")
    ph.tap("[data-testid=probe-close]"); ph.wait_for_timeout(150)
    check(ph.locator("[data-testid=probe-card]").count() == 0, "Phone: Close puts it away")
    ph.tap("a[href$='/album/al1']"); ph.wait_for_selector("[data-testid=probe-card]")
    ph.tap("h1"); ph.wait_for_timeout(200)
    check(ph.locator("[data-testid=probe-card]").count() == 0, "Phone: tapping elsewhere puts it away")

    pt = mk(None, None, True)
    pt.goto(f"{BASE}/"); pt.wait_for_selector("[data-testid=tour-start]"); pt.wait_for_selector("[data-testid=home-stats] a"); pt.tap("[data-testid=tour-start]"); pt.wait_for_selector("[data-testid=tour-card]")
    pt.wait_for_timeout(900)
    b = pt.locator("[data-testid=tour-card]").bounding_box()
    check(b["y"] >= 0 and b["y"] + b["height"] <= 845 and b["x"] >= 0 and b["x"] + b["width"] <= 391, f"Phone: tour card on screen {b}")
    pt.screenshot(path="/tmp/ph_tour.png")
    pt.tap("[data-testid=tour-next]")
    check(step(pt).endswith("2/5"), "Phone: Next works")
    pt.tap("[data-testid=tour-skip]")
    check(tour(pt) == "skipped", "Phone: Skip works")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
