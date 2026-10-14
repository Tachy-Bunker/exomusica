import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
_s292 = open(D + "/e2e_fix292.py").read()
__file__ = D + "/e2e_fix292.py"
exec(_s292.split("\ndef run(playwright):")[0])
_s288 = open(D + "/e2e_fix288.py").read()
exec(_s288[_s288.index("import zlib"):_s288.index("comments = [")])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
albums = [{"id": 7, "slug": "mine-a", "title": "My Album", "composer": "tachy", "coverArtUrl": "/uploads/old.png"}, {"id": 8, "slug": "mine-b", "title": "Plain", "composer": "tachy", "coverArtUrl": None}]
puts = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, w=1440, h=900, touch=False):
        kw = dict(viewport={"width": w, "height": h})
        if touch: kw.update(has_touch=True, is_mobile=True)
        ctx = browser.new_context(**kw)
        init = "localStorage.setItem('exomusica_classic','0');"
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
            if key == "/api/tracks/1/spectrogram": return route.fulfill(status=200, content_type="application/octet-stream", body=STRIP)
            if key == "/api/tracks/1/comments": return ok([])
            if key.startswith("/uploads/") and key.endswith(".png"): return route.fulfill(status=200, content_type="image/png", body=RED)
            if key == "/api/community-albums" and "mine=true" in path: return ok(albums)
            if key in ("/api/community-albums/mine-a", "/api/community-albums/mine-b"): return ok({"tracks": []})
            m = re.match(r"/api/community-albums/(\d+)/cover-link$", key)
            if m: puts.append((req.method, int(m.group(1)), json.loads(req.post_data))); return ok({"ok": True})
            if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    def play(pg):
        pg.goto(f"{BASE}/soundbay?sort=az"); pg.wait_for_selector("[data-testid=branch-row]")
        pg.click("[data-testid=sb-filter-all]"); pg.wait_for_timeout(200)
        pg.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").click(force=True)
        pg.wait_for_selector(".spec-canvas", timeout=10000)
        pg.click(".player-bar-row .track-info"); pg.wait_for_selector(".spec-comment")
    # --- player: guest
    g = mk(None); play(g)
    check(g.locator("[data-testid=player-join]").count() == 1 and g.get_attribute("[data-testid=player-join]", "href") == "/join", "Guest: the comment form has a Join button")
    check("Post" not in g.inner_text(".spec-comment"), "Guest: no Post button")
    check(g.locator("[data-testid=ab-panel]").count() == 0 and g.locator("[data-testid=note-as-region]").count() == 0, "A/B panel and Region are gone from the player")
    check(g.locator(".ab-region, [data-testid=ab-regions]").count() == 0, "No A/B stretches drawn on the strip")
    g.keyboard.press("Backslash"); check(g.locator("[data-testid=ab-panel]").count() == 0, "The \\ key does nothing now")
    # --- player: member
    m = mk(ME); play(m)
    check(m.locator("[data-testid=player-join]").count() == 0 and "Post" in m.inner_text(".spec-comment"), "Member: Post, no Join")
    check(m.locator("[data-testid=ab-panel]").count() == 0 and m.locator("[data-testid=note-as-region]").count() == 0, "Member: A/B and Region gone too")
    # --- covers by link
    c = mk(ME); c.goto(f"{BASE}/my-music"); c.wait_for_selector("[data-testid=cover-link-7]")
    check(c.locator("[data-testid=cover-link-save-7]").is_disabled(), "Cover link: Use link is off while the box is empty")
    c.fill("[data-testid=cover-link-7]", "  https://i.example.org/cover.jpg  "); c.click("[data-testid=cover-link-save-7]"); c.wait_for_timeout(300)
    check(puts and puts[-1] == ("PUT", 7, {"url": "https://i.example.org/cover.jpg"}), f"Cover link: the trimmed address is sent {puts[-1:]}")
    check(c.locator("[data-testid=cover-link-7]").input_value() == "", "Cover link: the box clears after saving")
    c.fill("[data-testid=cover-link-8]", "https://x.example.org/b.png"); c.press("[data-testid=cover-link-8]", "Enter"); c.wait_for_timeout(300)
    check(puts[-1][1] == 8, "Cover link: Enter saves too")
    check(c.locator("[data-testid=cover-remove-7]").count() == 1 and c.locator("[data-testid=cover-remove-8]").count() == 0, "Remove cover shows only for albums that have one")
    c.click("[data-testid=cover-remove-7]"); c.wait_for_timeout(300)
    check(puts[-1] == ("PUT", 7, {"url": ""}), "Remove cover sends a blank link")
    # --- phone sheets sit above the player
    D2 = DATA
    ctx = browser.new_context(viewport={"width": 390, "height": 760}, has_touch=True, is_mobile=True)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_classic','0'); if (!sessionStorage.getItem('exomusica_trail_v1')) sessionStorage.setItem('exomusica_trail_v1', {json.dumps(json.dumps(TRAIL))});")
    def h2(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if path.startswith("/api/atlas/around"):
            k = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":"); a = AROUND.get(k); return ok(a or {"error": "nf"}, 200 if a else 404)
        if path.startswith("/api/atlas/trace"): return route.fulfill(status=204, body="")
        if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart"): return ok([])
        if path in D2: return ok(D2[path])
        if key in D2: return ok(D2[key])
        if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), h2)
    p = ctx.new_page(); p.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e))))
    p.goto(f"{BASE}/study/mine-1"); p.wait_for_selector("[data-testid=faceplate]"); p.wait_for_timeout(500)
    p.evaluate("()=>document.documentElement.style.setProperty('--player-height','64px')")
    check(p.evaluate("()=>getComputedStyle(document.documentElement).overflowX") == "clip" and p.evaluate("()=>getComputedStyle(document.body).overflowX") == "clip", "Page can never scroll sideways (overflow-x: clip)")
    p.tap("[data-testid=fp-around]"); p.wait_for_selector("[data-testid=around-sheet]"); p.wait_for_timeout(300)
    b = p.locator("[data-testid=around-sheet]").bounding_box()
    check(abs(b["y"] + b["height"] - (760 - 64)) < 2 and b["x"] >= 0 and b["x"] + b["width"] <= 390.5, f"Around Here: the sheet ends where the player begins ({b['y'] + b['height']:.0f} of {760 - 64})")
    p.tap("[data-testid=fp-panel-close]"); p.wait_for_timeout(250)
    p.tap("button:has-text('Pocket')"); p.wait_for_timeout(400)
    b = p.locator(".fp-panel").bounding_box(); check(abs(b["y"] + b["height"] - (760 - 64)) < 2, f"Pocket: the same ({b['y'] + b['height']:.0f})")
    p.tap("[data-testid=fp-panel-close]"); p.wait_for_timeout(250)
    p.tap("[data-testid=fp-terminal]"); p.wait_for_timeout(400)
    b = p.locator(".term").bounding_box(); check(b["y"] + b["height"] <= 760 - 64 and b["x"] + b["width"] <= 390.5, f"Terminal: inside the free area ({b['y'] + b['height']:.0f} ≤ {760 - 64})")
    p.keyboard.press("Escape"); p.wait_for_timeout(250)
    p.tap("[data-testid=fp-lens]"); p.wait_for_selector("[data-testid=probe-hud]"); p.wait_for_timeout(300)
    b = p.locator("[data-testid=probe-hud]").bounding_box(); check(b["y"] + b["height"] <= 760 - 64 and b["x"] >= 0 and b["x"] + b["width"] <= 390.5, f"Probe bar: above the player ({b['y'] + b['height']:.0f} ≤ {760 - 64})")
    p.tap("[data-testid=lens-xray]"); p.wait_for_timeout(300)
    b = p.locator("[data-testid=xray-panel]").bounding_box(); hud = p.locator("[data-testid=probe-hud]").bounding_box()
    check(b["y"] + b["height"] <= hud["y"] + 1, "X-ray panel sits above the Probe bar")
    check(p.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth") <= 0, "No sideways scroll with everything open")
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
