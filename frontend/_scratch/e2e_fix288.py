import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix288.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
W, H = 1000, 40
STRIP = bytes(min(255, max(0, 255 - abs((x * H // W) - (H - 1 - y)) * 40)) if True else 0 for y in range(H) for x in range(W))  # a diagonal line, low-left to high-right
comments = [{"id": 1, "atSeconds": 2.0, "body": "that low thump", "createdAt": "2026-10-01T00:00:00Z", "user": "Ghost", "avatarUrl": None, "userId": 99}]
posted = []; deleted = []; mode = {"strip": "ok"}

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/tracks/1/spectrogram":
            if mode["strip"] == "ok": return route.fulfill(status=200, content_type="application/octet-stream", body=STRIP)
            return ok({"error": "the server has no ffmpeg"}, 501)
        if key == "/api/tracks/1/comments":
            if req.method == "POST":
                b = json.loads(req.post_data); posted.append(b)
                c = {"id": 50 + len(posted), "atSeconds": b["atSeconds"], "body": b["body"], "createdAt": "2026-10-09T00:00:00Z", "user": ME["username"], "avatarUrl": None, "userId": ME["id"]}
                comments.append(c); return ok(c, 201)
            return ok(comments)
        m = re.match(r"/api/tracks/1/comments/(\d+)$", key)
        if m and req.method == "DELETE": deleted.append(int(m.group(1))); return ok({"ok": True})
        if key.startswith("/uploads/") and key.endswith(".wav"):
            return route.fulfill(status=200, content_type="audio/wav", body=open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/two.wav", "rb").read())
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    errors = []
    page = ctx.new_page(); page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.goto(f"{BASE}/soundbay?sort=az"); page.wait_for_selector("[data-testid=branch-row]")
    page.click("[data-testid=sb-filter-all]"); page.wait_for_timeout(200)
    page.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").click(force=True)
    page.wait_for_selector(".spec-canvas", timeout=10000)
    check(page.locator(".player-seek-strip.has-spec").count() == 1, "docked bar: the strip is a spectrogram")
    px = page.evaluate("""() => { const c = document.querySelector('.spec-canvas'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const at = (x,y) => [d[(y*c.width+x)*4], d[(y*c.width+x)*4+1], d[(y*c.width+x)*4+2]];
      return {bright: at(500, 20), dark: at(500, 2)}; }""")
    # the diagonal passes through the middle; away from it the gradient bottoms out dark, on it the bright blue end shows
    check(px["bright"][2] > 180 and px["dark"][0] < 20, f"gradient: bright {px['bright']} on the line, dark {px['dark']} off it")
    check(page.locator(".spec-pin").count() == 1, "the existing comment is pinned on the strip")
    page.click(".player-bar-row .track-info"); page.wait_for_selector("[data-testid=spec-caption]")
    check(page.locator(".player-seek-strip--expanded.has-spec").count() == 1, "expanded: the strip is taller and still a spectrogram")
    check(page.locator("input[aria-label='Comment on this moment']").is_enabled(), "logged in: comment box on")
    # click the strip at 50%: seeks, and the comment time follows
    box = page.locator(".player-seek-strip--expanded").bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5); page.wait_for_timeout(300)
    t = page.locator(".spec-comment .mono").inner_text()
    check(t.startswith("@0:03") or t.startswith("@0:02"), f"clicking the strip picks the moment ({t})")
    page.fill("input[aria-label='Comment on this moment']", "  new   idea\n here "); page.click(".spec-comment button")
    page.wait_for_function("document.querySelectorAll('.spec-pin').length === 2")
    check(posted and abs(posted[0]["atSeconds"] - 3) < 0.6 and posted[0]["body"].strip().startswith("new"), f"posted at the chosen moment {posted[:1]}")
    check("new" in page.locator("[data-testid=spec-caption]").inner_text(), "the new comment shows in the caption")
    page.locator(".spec-pin").first.click(force=True); page.wait_for_timeout(200)
    check("that low thump" in page.locator("[data-testid=spec-caption]").inner_text(), "clicking a pin shows its comment")
    check(page.locator("[data-testid=spec-caption] button").count() == 0, "someone else's comment has no delete button")
    page.locator(".spec-pin").last.click(force=True); page.wait_for_timeout(200)
    page.click("[data-testid=spec-caption] button"); page.wait_for_function("document.querySelectorAll('.spec-pin').length === 1")
    check(deleted == [51], f"own comment can be deleted {deleted}")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_spec.png")
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    # server without ffmpeg: plain bar, no crash
    mode["strip"] = "none"
    page2 = ctx.new_page(); page2.on("pageerror", lambda e: errors.append(str(e)))
    page2.goto(f"{BASE}/soundbay?sort=az"); page2.wait_for_selector("[data-testid=branch-row]"); page2.click("[data-testid=sb-filter-all]")
    page2.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").click(force=True)
    page2.wait_for_selector(".player-seek-fill", timeout=10000); page2.wait_for_timeout(500)
    check(page2.locator(".spec-canvas").count() == 0, "no ffmpeg on the server: the plain seek bar stays")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
