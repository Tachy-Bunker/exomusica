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
    def mk(user, classic=None):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});" + (f"if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','{classic or '0'}');"))
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if key == "/api/scans":
                if req.method == "POST": scans.append(json.loads(req.post_data)); return route.fulfill(status=204, body="")
                return ok([])
            if key == "/api/community-albums/pend": return ok(COMM)
            if key == "/api/admin/site-settings" and req.method == "PATCH": patched.append(json.loads(req.post_data)); return ok({})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    oc = lambda pg, sel: pg.evaluate(f"getComputedStyle(document.querySelector({json.dumps(sel)})).outlineColor")
    page = mk(ME)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector(".probe-point")
    check("probe" not in (page.evaluate("document.body.className") or "") and oc(page, ".probe-point") != "rgb(255, 157, 60)", "Off: the page is plain and a scan point reads as ordinary words")
    page.keyboard.press("i"); page.wait_for_selector("[data-testid=probe-hud]")
    check(page.evaluate("document.body.classList.contains('probe')"), "On: I turns Probe mode on")
    check(oc(page, "a[href$='/album/al1']") == "rgb(255, 77, 77)", "Brackets: tracks are red")
    check(oc(page, "a[href$='/study/s2']") == "rgb(255, 157, 60)" and oc(page, ".probe-point") == "rgb(255, 157, 60)", "Brackets: lore and scan points are orange")
    check(oc(page, "a[href$='/u/neo']") == "rgb(77, 163, 255)", "Brackets: people are blue")
    page.hover("a[href$='/album/al1']"); page.wait_for_selector("[data-testid=probe-bar]", timeout=2000)
    check(page.locator("[data-testid=probe-card]").count() == 0, "Scan: nothing opens the instant you arrive")
    page.wait_for_selector("[data-testid=probe-card]", timeout=3000)
    t = page.inner_text("[data-testid=probe-card]")
    check("First" in t and "2 tracks · 2:05" in t and "Full Branch" in t and "new" in t.lower(), f"Scan: resting on an album reads it out ({t[:60]!r})")
    check(scans and scans[-1] == {"kind": "track", "key": "album:al1"}, f"Scan: recorded on the account {scans[-1:]}")
    page.mouse.move(5, 300); page.wait_for_timeout(200)
    page.hover("a[href$='/album/al1']"); page.wait_for_timeout(1300)
    check("new" not in page.inner_text("[data-testid=probe-card]").lower(), "Scan: the second time it is not 'new'")
    page.keyboard.press("Escape")
    check(page.locator("[data-testid=probe-card]").count() == 0 and page.evaluate("document.body.classList.contains('probe')"), "Esc: first closes the card")

    # hold on a link: reads out and does not follow it
    box = page.locator("a[href$='/study/s2']").bounding_box()
    page.mouse.move(box["x"] + 5, box["y"] + 5); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up(); page.wait_for_timeout(300)
    check(page.url.endswith("/study/mine-1"), f"Hold: a completed scan does not follow the link ({page.url})")
    check(page.locator("[data-testid=probe-card]").count() == 1, "Hold: pressing and holding scans")
    page.keyboard.press("Escape")

    # authored scan point + keyboard sweep
    page.mouse.move(5, 500)
    page.keyboard.press("]"); page.keyboard.press("]")
    check(page.locator(".probe-cur").count() == 1, "Sweep: ] steps to the next bracket")
    page.keyboard.press("Enter"); page.wait_for_selector("[data-testid=probe-card]")
    check(page.locator("[data-testid=probe-card]").count() == 1, "Sweep: Enter scans the chosen one")
    page.keyboard.press("["); page.keyboard.press("[")
    page.keyboard.press("Enter"); page.wait_for_timeout(300)
    page.locator(".probe-point").hover(); page.wait_for_timeout(1300)
    check("contact-mic recording of ice" in page.inner_text("[data-testid=probe-card]") and any(s["kind"] == "point" for s in scans), "Scan point: the author's note shows, and is recorded")
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    check(not page.evaluate("document.body.classList.contains('probe')") and page.locator("style[data-probe]").count() == 0, "Off again: classes and stylesheet are gone")

    # moderation flags are for admins only
    page.goto(f"{BASE}/community-album/pend"); page.wait_for_selector("[data-probe=mod]"); page.keyboard.press("i")
    check(oc(page, "[data-probe=mod]") != "rgb(255, 61, 240)", "Flags: a member sees no flag bracket")
    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/community-album/pend"); admin.wait_for_selector("[data-probe=mod]"); admin.keyboard.press("i")
    check(oc(admin, "[data-probe=mod]") == "rgb(255, 61, 240)", "Flags: an admin sees it")

    # classic mode
    cl = mk(ME, "1")
    cl.goto(f"{BASE}/study/mine-1"); cl.wait_for_selector(".probe-point"); cl.keyboard.press("i"); cl.wait_for_timeout(200)
    check(not cl.evaluate("document.body.classList.contains('probe')") and cl.locator("[data-testid=probe-toggle]").count() == 0, "Classic: no Probe mode, no button")
    cl.goto(f"{BASE}/account"); cl.wait_for_selector("[data-testid=classic-toggle]")
    cl.uncheck("[data-testid=classic-toggle]"); cl.goto(f"{BASE}/study/mine-1"); cl.wait_for_selector(".probe-point"); cl.keyboard.press("i")
    check(cl.evaluate("document.body.classList.contains('probe')"), "Classic: switching it off brings Probe mode back")

    # admin colours
    admin.goto(f"{BASE}/admin/visor"); admin.wait_for_selector("[data-testid=probe-preview]")
    check(oc(admin, "[data-testid=pp-track]") == "rgb(255, 77, 77)", "Admin: the preview shows the default red")
    admin.fill("[data-testid=probe-track]", "#00ff88")
    check(oc(admin, "[data-testid=pp-track]") == "rgb(0, 255, 136)", "Admin: changing a colour repaints the preview")
    admin.fill("[data-testid=probe-person]", "#101010")
    check(admin.locator("[data-testid=probe-weak]").count() == 1, "Admin: a colour too dark is flagged")
    admin.fill("[data-testid=probe-person]", "#4da3ff"); admin.click("[data-testid=probe-save]"); admin.wait_for_timeout(300)
    check(patched and patched[-1]["probeColors"] == {"lore": "#ff9d3c", "track": "#00ff88", "person": "#4da3ff", "mod": "#ff3df0"}, f"Admin: saved {patched[-1:]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
