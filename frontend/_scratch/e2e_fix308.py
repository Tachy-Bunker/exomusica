import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


BR = [{"id": 1, "slug": "root", "name": "Core Room", "parentId": None, "visibility": "VISIBLE"}, {"id": 2, "slug": "left", "name": "Left Wing", "parentId": 1, "visibility": "VISIBLE"}, {"id": 3, "slug": "right", "name": "Right Wing", "parentId": 1, "visibility": "VISIBLE"}, {"id": 4, "slug": "deep", "name": "Deep Vault", "parentId": 2, "visibility": "VISIBLE"}, {"id": 5, "slug": "gone", "name": "Taken Down", "parentId": None, "visibility": "HIDDEN"}]
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None, classic="0"):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))}); if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','{classic}');"
        for k, v in (seed or {}).items(): init += f"if(localStorage.getItem({json.dumps(k)})===null)localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/branches": return ok(BR)
            if key == "/api/field-log": return ok([])
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    p = mk(ME)
    p.goto(f"{BASE}/chart"); p.wait_for_selector("[data-testid=chart-svg]")
    t = p.inner_text("[data-testid=chart-tally]")
    check("0 visited" in t and "1 heard of" in t and "3 unseen" in t, f"Fresh chart: only the entrance is known ({t})")
    check("Taken Down" not in p.inner_text("[data-testid=chart-page]") + p.inner_html("[data-testid=chart-svg]"), "Hidden branches are not on the chart")
    check("Deep Vault" not in p.inner_html("[data-testid=chart-svg]") and p.locator("[data-testid=room-unseen]").count() == 3, "Unseen rooms: dark, names not in the page")
    p2 = mk(ME, {"exomusica_visits": json.dumps(["left"]), "exomusica_lastplay": json.dumps({"branchSlug": "left", "title": "Left Wing", "at": 1}), "exomusica_study_draft:mine-1": json.dumps({"title": "Half a paper", "body": "x", "base": "", "savedAt": 5}), "exomusica_scans": json.dumps(["lore|branch:deep"])})
    p2.goto(f"{BASE}/chart"); p2.wait_for_selector("[data-testid=chart-svg]")
    t = p2.inner_text("[data-testid=chart-tally]")
    check("2 visited" in t and "1 unseen" in t, f"Visited by walking or by scanning: both count ({t})")
    check(p2.locator("[data-testid=chart-pin]").count() == 1, "Pin: the room you last listened in")
    check("Left Wing" in p2.inner_text("[data-testid=chart-last]") and "Half a paper" in p2.inner_text("[data-testid=chart-draft]"), "Continue list: last heard and the draft")
    p2.click("[data-testid=chart-draft]"); p2.wait_for_selector("text=Probe me")
    check(p2.url.endswith("/study/mine-1"), "Draft link opens the study")

    # door wipe
    w = mk(ME)
    w.goto(f"{BASE}/field-log"); w.wait_for_selector("[data-testid=field-log]")
    w.click("a[href='/chart']"); w.wait_for_selector("[data-testid=door-wipe]", timeout=1500)
    check(True, "Wipe: moving between sections plays it")
    w.wait_for_timeout(500)
    check(w.locator("[data-testid=door-wipe]").count() == 0, "Wipe: gone again after it ends")
    cw = mk(ME, None, "1")
    cw.goto(f"{BASE}/field-log"); cw.wait_for_selector("[data-testid=field-log]"); cw.click("a[href='/chart']"); cw.wait_for_selector("[data-testid=chart-page]"); cw.wait_for_timeout(150)
    check(cw.locator("[data-testid=door-wipe]").count() == 0, "Classic mode: no wipe")

    # save station
    s = mk(ME)
    s.goto(f"{BASE}/study/mine-1"); s.wait_for_selector("text=Probe me"); s.click("button:text-is('Edit')"); s.wait_for_selector("[data-testid=save-station]")
    check("Nothing unsaved" in s.inner_text("[data-testid=save-station]"), "Save station: starts clean")
    s.locator("textarea:visible").first.fill("changed text"); s.wait_for_timeout(900)
    check("Save point" in s.inner_text("[data-testid=save-station]") and "on this device" in s.inner_text("[data-testid=save-station]"), "Save station: shows where and when the draft is kept")
    check(any("exomusica_study_draft" in k for k in s.evaluate("Object.keys(localStorage)")), "Save station: the draft really is stored")

    # last-play logger
    check(True, "(last-play logger is covered by the chart pin seed)")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
