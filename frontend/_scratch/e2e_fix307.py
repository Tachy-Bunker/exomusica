import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here and {scan second hush | quiet one}. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


CAT = [
 {"id": "lore", "title": "Lore", "entries": [{"key": "wiki:a", "title": "Open Wiki", "href": "/wiki/a"}, {"key": "wiki:b", "title": "Secret Wiki", "href": "/wiki/b"}, {"key": "study:s2", "title": "Hidden Study", "href": "/study/s2"}]},
 {"id": "creatures", "title": "Phenomena", "entries": [{"key": "phenom:x", "title": "Beating", "href": "/xenolab?tab=phenomena&item=x", "stages": [{"key": "phenom:x", "label": "Name"}, {"key": "phenom:x#body", "label": "Notes"}, {"key": "phenom:x#chain", "label": "Preset"}]}]},
 {"id": "recordings", "title": "Recordings", "entries": [{"key": "album:al1", "title": "First", "href": "/album/al1"}, {"key": "album:al9", "title": "Unheard Album", "href": "/album/al9"}]},
]
PH = [{"id": 1, "slug": "x", "title": "Beating", "summary": "Two close tones.", "body": "Some notes.", "chain": "abc", "published": True, "example": None}]

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block", accept_downloads=True)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))}); if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');" + (f"if(localStorage.getItem('exomusica_scans')===null)localStorage.setItem('exomusica_scans', {json.dumps(json.dumps(seed))});" if seed else ""))
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/field-log": return ok(CAT)
            if key == "/api/phenomena": return ok(PH)
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/scans":
                if req.method == "POST": scans.append(json.loads(req.post_data)); return route.fulfill(status=204, body="")
                return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    p0 = mk(ME)
    p0.goto(f"{BASE}/field-log"); p0.wait_for_selector("[data-testid=field-log]")
    check(p0.locator("[data-testid=log-locked]").count() == 6 and p0.locator("[data-testid=log-entry]").count() == 0, "Empty log: every entry is a ??? silhouette")
    txt = p0.inner_text("[data-testid=field-log]")
    check("Secret Wiki" not in txt and "Unheard Album" not in txt and "Beating" not in txt, "Empty log: locked names are not in the page")
    check("0/3 · 0%" in p0.inner_text("[data-testid=log-lore-count]"), "Empty log: per-section count")
    check(p0.locator("text=/overall|total complete/i").count() == 0, "No single global percentage")

    p1 = mk(ME, ["lore|wiki:a", "track|album:al1", "lore|phenom:x#body"])
    p1.goto(f"{BASE}/field-log"); p1.wait_for_selector("[data-testid=log-entry]"); p1.wait_for_timeout(400)
    check("1/3 · 33%" in p1.inner_text("[data-testid=log-lore-count]"), "Scanned: lore 1/3 · 33%")
    check("1/2 · 50%" in p1.inner_text("[data-testid=log-recordings-count]"), "Scanned: recordings 1/2")
    check("1/1" in p1.inner_text("[data-testid=log-creatures-count]") and p1.locator(".log-pips i.on").count() == 1 and p1.locator(".log-pips i").count() == 3, "Phenomenon: shows once any part is scanned, one of three parts lit")
    check("Open Wiki" in p1.inner_text("[data-testid=field-log]") and "Secret Wiki" not in p1.inner_text("[data-testid=field-log]"), "Scanned: opened entry is named, others stay hidden")
    check(any(s == {"kind": "lore", "key": "wiki:a"} for s in scans), "Sync: scans the account lacked are sent up")
    with p1.expect_download(timeout=5000) as dl: p1.click("[data-testid=log-share]")
    check(dl.value.suggested_filename == "field-log.png", "Share card downloads a PNG")

    # phenomena are probe-able in steps
    p1.goto(f"{BASE}/xenolab?tab=phenomena"); p1.wait_for_selector("[data-testid=phenomenon-card]"); p1.keyboard.press("i")
    check(p1.locator("[data-probe-key^='phenom:x']").count() == 3, "Phenomenon card: name, notes and preset are separate brackets")
    p1.hover("h3[data-probe-key='phenom:x']"); p1.wait_for_selector("[data-testid=probe-card]", timeout=4000)
    check("Beating" in p1.inner_text("[data-testid=probe-card]") and "Two close tones" in p1.inner_text("[data-testid=probe-card]"), "Phenomenon: scan reads out its summary")
    check(any(s["key"] == "phenom:x" for s in scans), "Phenomenon: scan recorded")
    check(p1.locator("[data-testid=probe-log]").count() == 1, "Probe HUD links to the Field Log")

    # missing-scans hint
    p2 = mk(ME)
    p2.goto(f"{BASE}/study/mine-1"); p2.wait_for_selector(".probe-point"); p2.wait_for_selector("[data-testid=missing-scans]", timeout=3000)
    check("2 scan points" in p2.inner_text("[data-testid=missing-scans]"), "Hint: two unfound points, no locations given")
    p2.keyboard.press("i"); p2.locator(".probe-point").first.hover(); p2.wait_for_selector("[data-testid=probe-card]", timeout=4000)
    p2.reload(); p2.wait_for_selector("[data-testid=missing-scans]", timeout=3000)
    check("1 scan point on this page" in p2.inner_text("[data-testid=missing-scans]"), "Hint: counts down after a scan")
    p2.evaluate("localStorage.setItem('exomusica_classic','1')"); p2.reload(); p2.wait_for_selector(".probe-point"); p2.wait_for_timeout(800)
    check(p2.locator("[data-testid=missing-scans]").count() == 0, "Classic mode: no hint")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
