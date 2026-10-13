import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

def trk(i, title): return {"id": i, "title": title, "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 6, "position": 0, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": []}
asked = []; added = []
BLOCKS = [{"id": 1, "startHour": 6, "hours": 6, "branch": {"slug": "b2", "name": "Full Branch"}}]

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.startswith("/uploads/rain.wav"):
                data = open(WAV, "rb").read(); rng = req.headers.get("range")
                if rng:
                    m = re.match(r"bytes=(\d*)-(\d*)", rng); a = int(m.group(1) or 0); b = int(m.group(2)) if m.group(2) else len(data) - 1; b = min(b, len(data) - 1)
                    return route.fulfill(status=206, headers={"Content-Range": f"bytes {a}-{b}/{len(data)}", "Accept-Ranges": "bytes", "Content-Type": "audio/wav"}, body=data[a:b + 1])
                return route.fulfill(status=200, headers={"Accept-Ranges": "bytes"}, content_type="audio/wav", body=data)
            if key == "/api/radio/now":
                asked.append(time.time())
                first = len(asked) <= 2
                return ok({"branch": {"slug": "b2", "name": "Full Branch", "channelSlug": None}, "track": trk(1 if first else 2, "Rain One" if first else "Rain Two"), "offset": 3.0 if first else 0.2, "remaining": 2.0 if first else 600, "upcoming": [{"id": 9, "title": "Later", "albumTitle": "First"}], "blockEndsAt": int(time.time() * 1000) + 7500000, "serverNow": int(time.time() * 1000)})
            if key == "/api/branches/b2": return ok({"id": 2, "slug": "b2", "name": "Full Branch", "identityColor": "#4fa8e0", "visibility": "VISIBLE", "channel": None})
            if key == "/api/admin/radio":
                if req.method == "POST": added.append(json.loads(req.post_data)); return ok({"id": 2}, 201)
                return ok(BLOCKS)
            if key == "/api/admin/branches": return ok([{"id": 2, "name": "Full Branch"}])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    page = mk(ME)
    page.goto(f"{BASE}/radio"); page.wait_for_selector("[data-testid=radio-card]")
    check("Rain One" in page.locator("[data-testid=radio-title]").inner_text() and "Full Branch" in page.locator("[data-testid=radio-card]").inner_text(), "Radio: shows what is on and which branch")
    check("Later" in page.locator("[data-testid=radio-card]").inner_text(), "Radio: shows what is next")
    check("themed" in page.locator("[data-testid=top-nav]").get_attribute("class"), "Radio: the header wears the branch on air")
    check(page.locator(".player-bar-wrapper audio").count() == 0 or not page.evaluate("!document.querySelector('.player-bar-wrapper audio').paused"), "Radio: silent until you tune in")
    page.click("[data-testid=radio-tune]"); page.wait_for_timeout(900)
    t = page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    check(t >= 2.5, f"Radio: joins mid-song at the broadcast position ({t:.1f}s)")
    page.wait_for_timeout(2600)
    check("Rain Two" in page.locator("[data-testid=radio-title]").inner_text(), "Radio: moves on to the next song when this one ends")
    check(len(asked) >= 2, f"Radio: asked the server again at the end ({len(asked)})")
    page.click("[data-testid=radio-leave]"); page.wait_for_timeout(300)
    check(page.evaluate("document.querySelector('.player-bar-wrapper audio').paused"), "Radio: Leave stops the sound")
    check(page.locator(".nav-radio[href=\"/radio\"]").count() == 1, "Radio: reachable from the top bar")

    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/admin/radio"); admin.wait_for_selector("[data-testid=radio-block]")
    check("06:00 → 12:00" in admin.locator("[data-testid=radio-block]").inner_text(), "Admin: block shown as a time range")
    admin.fill("[aria-label='Start hour']", "22"); admin.fill("[aria-label=Hours]", "4"); admin.click("button:has-text('Add block')"); admin.wait_for_timeout(400)
    check(added and added[0] == {"branchId": 2, "startHour": 22, "hours": 4}, f"Admin: block added {added[:1]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
