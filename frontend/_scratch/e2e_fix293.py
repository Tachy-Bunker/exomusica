import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix293.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

DOC = {"bg": "night", "items": [{"t": "m", "x": 800, "y": 500, "r": 0, "s": 90, "c": "#f5a524", "g": "cq"}]}
MARKS = [{"id": i, "doc": DOC, "by": "ghost9" if i % 2 else None, "mine": i == 3, "at": "2026-10-01T00:00:00Z", "expiresAt": "2099-11-01T00:00:00Z"} for i in (1, 2, 3)]
CONVS = [{"partner": "ana", "lastMessage": "hi there", "sentAt": 1790000000, "unread": True}]
BOX = {"got": [{"id": 5, "from": "zed", "at": "2026-10-05T00:00:00Z", "opened": False}], "sent": [{"id": 6, "to": "ana", "state": "in the post", "deliverAt": "2026-10-20T00:00:00Z"}]}
TEXT = "## Title\n- one\n- two\n1. first\n---\n```py\nx = 1\n```\nhear https://x.test/a.mp3\n![ok](/uploads/pic1.png)\n![bad](https://evil.test/t.png)"
THREAD = [{"id": 1, "fromMe": False, "contentRaw": TEXT, "sentAt": 1790000000, "attachments": []}]
posts, pms = [], []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/landmarks": return ok(MARKS)
            if key == "/api/letters/unread": return ok({"n": 1})
            if key == "/api/letters/inbox": return ok(BOX)
            if key == "/api/letters" and req.method == "POST": posts.append(json.loads(req.post_data)); return ok({"ok": True}, 201)
            if re.match(r"/api/letters/\d+$", key) and req.method == "GET": return ok({"id": 5, "doc": DOC, "from": "zed", "at": "2026-10-05T00:00:00Z", "mine": False, "canBlock": True})
            if key == "/api/pms": return ok(CONVS)
            if key == "/api/pms/ana" and req.method == "GET": return ok(THREAD)
            if key == "/api/pms/ana" and req.method == "POST": pms.append(json.loads(req.post_data)); return ok({"id": 2, "sentAt": 1790000100}, 201)
            if key.startswith("/api/pms/"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # ---- one inbox, texts and letters together
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/pms"); page.wait_for_selector("[data-testid=post-row]")
    names = page.locator("[data-testid=post-row] b").all_inner_texts()
    check(sorted(n.strip() for n in names) == ["ana", "zed"], "Post: PM partners and letter-only partners share one list")
    check(page.locator("[data-testid=fp-post] em").inner_text() == "2", "Faceplate: one badge for unread letters + messages")
    page.goto(f"{BASE}/letters?to=ana"); page.wait_for_url("**/pms/ana"); page.wait_for_selector("[data-testid=post-thread]")
    check(page.locator("[data-testid=mode-letter]").get_attribute("aria-selected") == "true", "Post: /letters?to= lands on the person, in letter mode")
    page.click("[data-testid=mode-msg]")
    check(page.locator("[data-testid=post-letter]").count() == 1 and "in the post" in page.locator("[data-testid=post-letter]").inner_text(), "Post: a slow letter shows in the thread")

    # ---- markdown rendering of what was received
    th = page.locator("[data-testid=post-msg]").first
    check(th.locator("h3").count() == 1 and th.locator("ul.msg-list li").count() == 2 and th.locator("ol.msg-list li").count() == 1, "Markdown: heading and lists")
    check(th.locator("pre.msg-code").inner_text().strip().endswith("x = 1") and th.locator("pre.msg-code").get_attribute("data-lang") == "py", "Markdown: fenced code with language")
    check(th.locator("hr.msg-hr").count() == 1, "Markdown: divider")
    check(th.locator("audio.msg-audio").count() == 1, "Markdown: an audio link plays inline")
    check(th.locator("img.msg-img").count() == 1 and th.locator("img.msg-img").get_attribute("src") == "/uploads/pic1.png", "Markdown: pictures from this site draw inline")
    check(th.locator("img[src*='evil']").count() == 0 and th.locator("a[href*='evil']").count() == 1, "Markdown: a remote picture stays a link (no tracking)")

    # ---- the writing box
    ta = page.locator("[data-testid=mdbox] textarea")
    ta.fill("make this bold"); ta.evaluate("e => e.setSelectionRange(5, 9)")
    page.click("[data-testid=md-bold]")
    check(ta.input_value() == "make **this** bold", "Toolbar: bold wraps the selection")
    ta.press("Control+a"); page.click("[data-testid=md-ul]")
    check(ta.input_value().startswith("- make"), "Toolbar: bullet list")
    page.click("[data-testid=md-preview]")
    check(page.locator("[data-testid=md-view] ul li").count() == 1 and page.locator("[data-testid=md-view] strong").count() == 1, "Toolbar: live preview renders it")
    page.click("[data-testid=md-preview]")
    ta.press("Enter"); page.wait_for_timeout(300)
    check(len(pms) == 1 and pms[0]["contentRaw"] == "- make **this** bold" and ta.input_value() == "", "Composer: Enter sends the raw markdown and clears")
    ta.fill("a"); ta.press("Shift+Enter"); ta.type("b")
    check(ta.input_value() == "a\nb" and len(pms) == 1, "Composer: Shift+Enter makes a new line")

    # ---- letter mode in the same place
    page.click("[data-testid=mode-letter]"); page.wait_for_selector("[data-testid=comp-sheet]")
    box = page.locator("[data-testid=comp-sheet]").bounding_box()
    page.click("[data-testid=tool-stamp]"); page.mouse.click(box["x"] + 200, box["y"] + 200)
    page.select_option("select[aria-label='Slow post']", "6"); page.click("[data-testid=comp-submit]"); page.wait_for_timeout(400)
    check(posts and posts[-1]["to"] == "ana" and posts[-1]["hours"] == 6, "Letter mode: sends to the person you are talking to")
    check(page.locator("[data-testid=mode-msg]").get_attribute("aria-selected") == "true", "Letter mode: back to message after sending")

    # ---- a letter opens inside the thread
    page.goto(f"{BASE}/pms/zed"); page.wait_for_selector("[data-testid=post-letter]")
    page.click("[data-testid=letter-open-btn]"); page.wait_for_selector("[data-testid=letter-open]")
    check(page.locator("[data-testid=letter-block]").count() == 1, "Thread: received letter opens in place, can be blocked")

    # ---- terminal and compat
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("go post"); page.keyboard.press("Enter"); page.wait_for_url("**/pms")
    check(True, "Terminal: go post")
    ctx.close()

    # ---- phone: list first, then the thread
    ctx = new_ctx(viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/pms"); page.wait_for_selector("[data-testid=post-row]")
    check(page.locator("[data-testid=post-thread]").count() == 0, "Phone: the list alone at first")
    page.locator("[data-testid=post-row]").first.click(); page.wait_for_selector("[data-testid=post-compose]")
    check(page.locator("[data-testid=post-row]").count() == 0, "Phone: the thread replaces the list")
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    ctx.close()

    # ---- the Trace lens as a scan
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.evaluate("0"); page.goto(f"{BASE}/study/mine-1"); page.evaluate("localStorage.setItem('exomusica_lens','1')"); page.reload()
    page.wait_for_selector("[data-testid=landmarks]"); page.wait_for_selector("[data-testid=landmark]")
    t = page.locator("[data-testid=landmarks]").inner_text()
    check("LONG-RANGE SCAN" in t and "MHz" in t and page.locator("[data-testid=lm-count]").inner_text() == "3", "Lens: scan header, sector frequency, contact count")
    check(page.locator("[data-testid=landmarks] .scope-sweep").count() == 1 and page.locator("[data-testid=landmark]").count() == 3, "Lens: scope with a sweep and one blip per beacon")
    xs = set(page.locator("[data-testid=landmark]").evaluate_all("els => els.map(e => e.style.left + e.style.top)"))
    check(len(xs) == 3, "Lens: blips sit at different places")
    page.locator("[data-testid=landmark]").nth(2).click()
    check("decays in" in page.locator("[data-testid=landmark-open]").inner_text(), "Lens: opening a blip shows its decay time")
    check(page.locator("[data-testid=leave-mark]").get_attribute("href").startswith("/pms?at=study%3Amine-1"), "Lens: dropping a beacon goes to the Post page")
    page.click("[data-testid=leave-mark]"); page.wait_for_selector("[data-testid=comp-sheet]")
    check(page.locator("[data-testid=mode-msg]").count() == 0, "Post: a beacon is letter-only (no message tab)")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
