import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


STUDY["body"] = "See [the album](%s/album/al1) first.\n\n" % BASE + "\n\n".join("Filler paragraph %d. " % i + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 6 for i in range(40))
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, classic="0"):
        ctx = browser.new_context(viewport={"width": 1280, "height": 700}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))}); if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','{classic}');")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if key == "/api/landmarks" or key == "/api/field-log" or key == "/api/branches": return ok([])
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    p = mk(ME)
    p.goto(f"{BASE}/study/mine-1"); p.wait_for_selector("[data-testid=faceplate]")
    check(p.locator("[data-testid=probe-toggle]").count() == 0, "One Probe button: the separate nav one is gone")
    labels = " ".join(p.locator(".fp-btn-label").all_inner_texts())
    check("Probe" in labels and "Scan" not in labels, f"Faceplate: Probe, no separate Scan ({labels})")
    p.click("[data-testid=fp-lens]")
    p.wait_for_selector("[data-testid=probe-hud]"); p.wait_for_selector("[data-testid=landmarks]")
    check(p.evaluate("document.body.classList.contains('probe')") and p.locator("[data-testid=visor-grid]").count() == 1, "One switch: brackets and the traces layer come on together")
    check(p.locator("[data-testid=visor-off]").count() == 0, "No second Off button")
    p.click("[data-testid=probe-off]"); p.wait_for_timeout(200)
    check(p.locator("[data-testid=landmarks]").count() == 0 and not p.evaluate("document.body.classList.contains('probe')"), "Off turns both off")
    p.keyboard.press("i"); p.wait_for_selector("[data-testid=landmarks]")
    check(True, "I turns on the traces layer too")
    # Esc closes the note box before it leaves the mode
    p.click("[data-testid=visor-write]"); p.keyboard.press("Escape"); p.wait_for_timeout(150)
    check(p.evaluate("document.body.classList.contains('probe')"), "Esc while writing stops writing, does not leave Probe")
    p.keyboard.press("Escape"); p.wait_for_timeout(150)
    check(not p.evaluate("document.body.classList.contains('probe')"), "Esc again leaves Probe")

    # the card scrolls with the page
    p.keyboard.press("i")
    p.hover("a[href$='/album/al1']"); p.wait_for_selector("[data-testid=probe-bar]", timeout=2000)
    check(p.evaluate("getComputedStyle(document.querySelector('[data-testid=probe-bar]')).position") == "absolute", "Progress bar is anchored to the page")
    p.wait_for_selector("[data-testid=probe-card]", timeout=3000)
    top0 = p.evaluate("document.querySelector('[data-testid=probe-card]').getBoundingClientRect().top")
    link0 = p.evaluate("document.querySelector('a[href$=\"/album/al1\"]').getBoundingClientRect().top")
    p.mouse.wheel(0, 300); p.wait_for_timeout(300)
    top1 = p.evaluate("document.querySelector('[data-testid=probe-card]').getBoundingClientRect().top")
    link1 = p.evaluate("document.querySelector('a[href$=\"/album/al1\"]').getBoundingClientRect().top")
    check(p.evaluate("window.scrollY") > 200 and abs((top0 - top1) - (link0 - link1)) < 2, f"Card moves with the page when scrolling ({top0:.0f} -> {top1:.0f}, link {link0:.0f} -> {link1:.0f})")

    # door: six panels, gone when loaded
    p.goto(f"{BASE}/field-log"); p.wait_for_selector("[data-testid=field-log]"); p.click("a[href='/chart']"); p.wait_for_selector("[data-testid=door-wipe]", timeout=1500)
    check(p.locator("[data-testid=door-wipe] .dw-p").count() == 6, "Door has six panels")
    p.wait_for_selector("[data-testid=door-wipe]", state="detached", timeout=5000)
    check(True, "Door opens and goes away once loaded")

    c = mk(ME, "1")
    c.goto(f"{BASE}/study/mine-1"); c.wait_for_selector("[data-testid=faceplate]"); c.wait_for_timeout(300)
    check(c.locator("[data-testid=fp-lens]").count() == 0, "Classic mode: no Probe button")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
