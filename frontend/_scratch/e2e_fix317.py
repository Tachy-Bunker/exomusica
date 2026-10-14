import json, re, sys
from playwright.sync_api import sync_playwright
D = __file__.rsplit("/", 1)[0]
src = open(D + "/e2e_fix277.py").read()
exec(src.split("def run(playwright):")[0])
def M(i, text, author="ghost9", aid=2, **k):
    d = {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None}
    d.update(k); return d
MSGS = [M(1, "first words"), M(2, "> an old quote\nsecond words here"), M(3, "gone", isDeleted=True)]
EM = [{"id": i, "name": f"em{i}", "imageUrl": "/uploads/e.png"} for i in range(1, 4)]
calls = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user=ME, counts=None):
        ctx = browser.new_context(viewport={"width": 1100, "height": 800})
        init = "localStorage.setItem('exomusica_classic','0');"
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))}); localStorage.setItem('exomusica_seen_hall','10');"
        if counts: init += f"if(!localStorage.getItem('exomusica_quick'))localStorage.setItem('exomusica_quick', {json.dumps(json.dumps(counts))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if req.method == "POST" and ("/reactions" in key or "/bookmark" in key): calls.append((key, req.post_data)); return ok({"ok": True}, 201)
            if key == "/api/channels/hall/messages": return ok(MSGS)
            if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1})
            if key == "/api/channels/hall/archive": return ok([])
            if key == "/api/channels/hall/follow": return ok({"following": False})
            if key == "/api/emojis": return ok(EM)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    def open_on(p, mid):
        p.evaluate("()=>document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        b = p.locator(f"#m-{mid}").bounding_box(); p.mouse.move(b["x"] + 60, b["y"] + b["height"] / 2); p.keyboard.press("a")
    p = mk(); p.goto(f"{BASE}/topic/hall"); p.wait_for_selector("#m-2"); p.wait_for_timeout(400)
    p.mouse.move(5, 5); p.keyboard.press("a"); check(p.locator("[data-testid=radial]").count() == 0, "A over nothing does nothing")
    open_on(p, 2); p.wait_for_selector("[data-testid=radial]")
    labels = p.locator(".radial-btn small").all_inner_texts()
    check(len(labels) == 4 and "Reply" in labels[0] and "R" in labels[0] and "E" in labels[1] and "Q" in labels[2] and "P" in labels[3], f"Fan opens: four slots with their letters {labels}")
    p.keyboard.press("Escape"); check(p.locator("[data-testid=radial]").count() == 0, "Esc closes it")
    open_on(p, 2); p.keyboard.press("r"); p.wait_for_selector("text=Replying to")
    check("ghost9" in p.inner_text("body") and p.locator("[data-testid=radial]").count() == 0, "R replies to the message under the pointer and closes")
    open_on(p, 2); p.keyboard.press("q"); p.wait_for_timeout(300)
    val = p.locator("textarea").first.input_value()
    check(val.startswith("> ghost9: second words here"), f"Q puts a one-line quote in the box, nested quote dropped ({val!r})")
    check(p.evaluate("()=>document.activeElement.tagName") == "TEXTAREA", "…and focuses the box")
    p.evaluate("()=>document.activeElement.blur()")
    calls.clear(); open_on(p, 1); p.keyboard.press("p"); p.wait_for_timeout(300)
    check(any(k == "/api/messages/1/bookmark" for k, _ in calls), "P pins (bookmarks) that message")
    check(not p.evaluate("()=>document.body.classList.contains('x')") and p.locator("[data-testid=radial]").count() == 0, "P did not leak to the player shuffle (fan closed, one action)")
    calls.clear(); open_on(p, 1); p.keyboard.press("e"); p.wait_for_selector("[data-testid=radial-e0]")
    check(p.locator(".radial-btn").count() == 3, "E switches to the emoji fan (3 emoji)")
    p.keyboard.press("2"); p.wait_for_timeout(300)
    check(any(k == "/api/messages/1/reactions" and '"emojiId": 2' in (d or "").replace('"emojiId":2', '"emojiId": 2') for k, d in calls), f"Digit picks that emoji {calls[-1:]}")
    # usage ordering
    counts = json.loads(p.evaluate("()=>localStorage.getItem('exomusica_quick')"))
    check(counts.get("pin") == 1 and counts.get("reply") == 1 and counts.get("quote") == 1 and counts.get("react") == 1, f"Each use is counted {counts}")
    open_on(p, 1); p.keyboard.press("p"); open_on(p, 1); p.keyboard.press("p"); open_on(p, 2)
    p.wait_for_selector("[data-testid=radial]"); first = p.locator(".radial-btn small").first.inner_text()
    check(first.startswith("Pin"), f"The fan reorders: most used first ({first!r})")
    keys = p.locator(".radial-btn small kbd").all_inner_texts(); check(keys[0].strip() == "P" and "R" in " ".join(keys), "…but each letter stays the same")
    p.keyboard.press("2")  # second slot by position
    p.wait_for_timeout(200)
    # click works too
    open_on(p, 2); p.click("[data-testid=radial-pin]"); p.wait_for_timeout(200)
    check(p.locator("[data-testid=radial]").count() == 0, "Clicking a slot works")
    # typing in the box never opens it
    p.locator("textarea").first.focus(); p.keyboard.type("a"); check(p.locator("[data-testid=radial]").count() == 0, "Typing an 'a' in the box does not open it")
    p.evaluate("()=>document.activeElement.blur()")
    # deleted messages: nothing
    b = p.locator("#m-3").bounding_box()
    if b: p.mouse.move(b["x"] + 30, b["y"] + b["height"] / 2); p.keyboard.press("a"); check(p.locator("[data-testid=radial]").count() == 0, "Deleted message: no fan")
    # stored counts from before decide the order on load
    q = mk(counts={"quote": 9}); q.goto(f"{BASE}/topic/hall"); q.wait_for_selector("#m-1"); q.wait_for_timeout(300); open_on(q, 1); q.wait_for_selector("[data-testid=radial]")
    check(q.locator(".radial-btn small").first.inner_text().startswith("Quote"), "A returning visitor's habits are remembered")
    # guests get nothing
    g = mk(user=None); g.goto(f"{BASE}/topic/hall"); g.wait_for_selector("#m-1"); g.wait_for_timeout(300); open_on(g, 1); check(g.locator("[data-testid=radial]").count() == 0, "Guests: no quick actions")
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
