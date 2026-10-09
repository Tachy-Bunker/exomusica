import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix284.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

DOC = {"bg": "night", "items": [{"t": "s", "c": "#e5484d", "w": 4, "p": [10, 10, 200, 200, 400, 100]}, {"t": "x", "x": 500, "y": 300, "r": 10, "s": 40, "c": "#f4efe3", "k": 40, "v": "hello"}, {"t": "m", "x": 800, "y": 500, "r": 0, "s": 90, "c": "#f5a524", "g": "cq"}]}
MARKS = [{"id": 11, "doc": DOC, "by": "ghost9", "mine": False, "at": "2026-10-01T00:00:00Z", "expiresAt": "2026-11-01T00:00:00Z"},
         {"id": 12, "doc": DOC, "by": None, "mine": False, "at": "2026-10-02T00:00:00Z", "expiresAt": "2026-11-01T00:00:00Z"}]
INBOX = {"got": [{"id": 5, "from": "ghost9", "at": "2026-10-05T00:00:00Z", "opened": False}], "sent": [{"id": 6, "to": "ghost9", "state": "in the post", "deliverAt": "2026-10-10T00:00:00Z"}]}
posts, landmark_calls = [], []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(logged_in=True, viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        if logged_in: ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/landmarks": landmark_calls.append(path); return ok(MARKS)
            if key == "/api/letters/unread": return ok({"n": 2})
            if key == "/api/letters/inbox": return ok(INBOX)
            if key == "/api/letters" and req.method == "POST": posts.append(json.loads(req.post_data)); return ok({"ok": True}, 201)
            if re.match(r"/api/letters/\d+$", key) and req.method == "GET": return ok({"id": 5, "doc": DOC, "from": "ghost9", "at": "2026-10-05T00:00:00Z", "mine": False, "canBlock": True})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # lens off: nothing, and no request
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=faceplate]"); page.wait_for_timeout(500)
    check(page.locator("[data-testid=landmarks]").count() == 0 and not landmark_calls, "Lens off: no panel and no request")
    check(page.locator("[data-testid=fp-letters] em").inner_text() == "2", "Faceplate: unread letters badge")
    page.click("[data-testid=fp-lens]"); page.wait_for_selector("[data-testid=landmarks]"); page.wait_for_selector("[data-testid=landmark]")
    check(page.locator("[data-testid=landmark]").count() == 2 and "key=study%3Amine-1" in landmark_calls[-1], "Lens on: the marks for this place")
    page.locator("[data-testid=landmark]").first.click()
    check(page.locator("[data-testid=landmark-open]").count() == 1 and "ghost9" in page.locator("[data-testid=landmark-open]").inner_text(), "Lens: open a mark, see its author")
    page.locator("[data-testid=landmark]").nth(1).click()
    check("unsigned" in page.locator("[data-testid=landmark-open]").inner_text(), "Lens: an unsigned mark shows no author")
    check(page.locator("[data-testid=landmark] svg textPath").count() >= 1 or page.locator("svg textPath").count() >= 1, "Letter: curved text renders on a path")
    page.reload(); page.wait_for_selector("[data-testid=landmarks]")
    check(True, "Lens: remembered after reload")
    page.click("[data-testid=leave-mark]"); page.wait_for_url("**/letters?at=study%3Amine-1")
    # compose: ink, text, stamp
    page.wait_for_selector("[data-testid=comp-sheet]")
    box = page.locator("[data-testid=comp-sheet]").bounding_box()
    page.mouse.move(box["x"] + 100, box["y"] + 100); page.mouse.down()
    for i in range(1, 40): page.mouse.move(box["x"] + 100 + i * 8, box["y"] + 100 + (i % 7) * 6)
    page.mouse.up(); page.wait_for_timeout(100)
    check(page.locator("[data-testid=comp-sheet] path[data-i]").count() == 1, "Composer: an ink stroke is committed")
    page.click("[data-testid=tool-text]"); page.fill("[data-testid=comp-text]", "73 de tachy")
    page.mouse.click(box["x"] + 300, box["y"] + 300); page.wait_for_selector("[data-testid=comp-inspect]")
    check(page.locator("[data-testid=comp-sheet] text").count() >= 1, "Composer: text placed")
    page.locator("[data-testid=comp-curve]").fill("50"); page.wait_for_timeout(100)
    check(page.locator("[data-testid=comp-sheet] textPath").count() == 1, "Composer: curving text switches to an arc")
    page.click("[data-testid=tool-stamp]"); page.mouse.click(box["x"] + 600, box["y"] + 400)
    check(page.locator("[data-testid=comp-sheet] g[data-i]").count() == 2, "Composer: stamp placed")
    page.click("[data-testid=comp-undo]")
    check(page.locator("[data-testid=comp-sheet] g[data-i]").count() == 1, "Composer: undo removes the last mark")
    page.click("[data-testid=comp-submit]"); page.wait_for_timeout(500)
    p = posts[-1]
    check(p["at"] == "study:mine-1" and len(p["doc"]["items"]) == 2 and p["doc"]["items"][0]["t"] == "s" and len(p["doc"]["items"][0]["p"]) < 200, f"Send: a mark with thinned ink ({len(p['doc']['items'][0]['p'])//2} points)")
    ctx.close()

    # inbox and send
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/letters"); page.wait_for_selector("[data-testid=letters-got]")
    check("from ghost9" in page.locator("[data-testid=letters-got]").inner_text() and "in the post" in page.locator("[data-testid=letters-sent]").inner_text(), "Post: arrived and in-the-post lists")
    page.click("[data-testid=letters-got] button"); page.wait_for_selector("[data-testid=letter-open]")
    check(page.locator("[data-testid=letter-block]").count() == 1, "Post: a received letter can be blocked")
    page.click("[data-testid=tab-write]"); page.wait_for_selector("[data-testid=comp-sheet]")
    check(page.locator("[data-testid=comp-submit]").is_disabled(), "Write: Send disabled until there is a mark and a recipient")
    box = page.locator("[data-testid=comp-sheet]").bounding_box()
    page.click("[data-testid=tool-stamp]"); page.mouse.click(box["x"] + 200, box["y"] + 200)
    page.fill("[data-testid=comp-to]", "ghost9"); page.select_option("select[aria-label='Slow post']", "24")
    page.click("[data-testid=comp-submit]"); page.wait_for_timeout(400)
    check(posts[-1]["to"] == "ghost9" and posts[-1]["hours"] == 24, "Write: slow post sends hours")
    # terminal
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("lens off"); page.keyboard.press("Enter")
    check("off" in page.locator("[data-testid=terminal-out]").inner_text(), "Terminal: lens off")
    page.keyboard.type("go letters"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check(page.url.endswith("/letters"), "Terminal: go letters")
    ctx.close()
    ctx = new_ctx(viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/letters?at=study%3Amine-1"); page.wait_for_selector("[data-testid=comp-sheet]"); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
