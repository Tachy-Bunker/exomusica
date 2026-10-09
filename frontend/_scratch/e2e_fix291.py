import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix291.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
def M(i, text, author="ghost9", aid=2, **k):
    d = {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
    d.update(k); return d
MSGS = []
for i in range(1, 31):
    if i == 12: MSGS.append(M(i, "this one got love", "zed", 3, reactions=[{"emojiId": 1, "emojiName": "x", "usernames": ["a", "b", "c"]}]))
    elif i == 20: MSGS.append(M(i, "a long and thoughtful message about the second movement. " * 6))
    elif i == 26: MSGS.append(M(i, "[Poll] Which?", kind="poll", data={"q": "Which?", "options": ["a", "b"]}))
    elif i == 28: MSGS.append(M(i, "mine", ME["username"], ME["id"]))
    else: MSGS.append(M(i, "ok " * (1 + i % 5)))

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(w, h, seen=10):
        ctx = browser.new_context(viewport={"width": w, "height": h})
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});"
        if seen is not None: init += f" if (!localStorage.getItem('exomusica_seen_hall')) localStorage.setItem('exomusica_seen_hall', '{seen}');"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/channels/hall/messages": return ok(MSGS)
            if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1})
            if key == "/api/channels/hall/archive": return ok([])
            if key == "/api/channels/hall/follow": return ok({"following": False})
            if re.match(r"/api/messages/\d+/poll", key): return ok({"mine": None, "total": 0, "counts": None})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    ctx = new_ctx(390, 800); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=chat-strip]"); page.wait_for_selector("[data-testid=catchup]"); page.wait_for_timeout(500)
    txt = " ".join(page.locator("[data-testid=catchup]").inner_text().split())
    check("19 new" in txt and "ghost9" in txt and "zed" in txt, f"Reel: counts others' unread and names who spoke ({txt[:40]!r})")
    pick = page.locator("[data-testid=catchup-pick]")
    check(pick.count() == 3 and "love" in pick.nth(0).inner_text() and "thoughtful" in pick.nth(1).inner_text() and "Poll" in pick.nth(2).inner_text(), "Reel: the reacted, the substantial and the poll are the highlights")
    check(page.evaluate("localStorage.getItem('exomusica_seen_hall')") == "30", "Where you left off moves up to now")
    # strip
    px = page.evaluate("""() => { const c = document.querySelector('[data-testid=chat-strip] canvas'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let lit = 0, bright = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i+1] + d[i+2] > 60) lit++; if (d[i+2] > 150) bright++; } return {lit, bright, n: d.length/4}; }""")
    check(px["lit"] > px["n"] * 0.5 and px["bright"] > 0, f"Strip: painted through the gradient ({px['lit']}/{px['n']} lit, {px['bright']} bright)")
    vh = page.evaluate("parseFloat(document.querySelector('.chat-strip-view').style.height)")
    check(0 < vh < 100, f"Strip: the lit window is the part you are looking at ({vh:.0f}%)")
    mk = page.locator("[data-testid=strip-unread]")
    check(mk.evaluate("e => getComputedStyle(e).display") == "block", "Strip: a line marks the first unread")
    # click near the top of the strip scrolls the list up
    page.wait_for_timeout(500); before = page.evaluate("document.getElementById('chat-list').scrollTop")
    box = page.locator("[data-testid=chat-strip]").bounding_box()
    page.mouse.click(box["x"] + 5, box["y"] + 6); page.wait_for_timeout(200)
    after = page.evaluate("document.getElementById('chat-list').scrollTop")
    check(after < before - 50, f"Strip: clicking the top travels there ({before:.0f} -> {after:.0f})")
    # first unread / pick / dismiss
    page.click("[data-testid=catchup-first]"); page.wait_for_timeout(200)
    check(page.evaluate("(() => { const r = document.getElementById('m-11').getBoundingClientRect(), l = document.getElementById('chat-list').getBoundingClientRect(); return r.top >= l.top - 2 && r.top < l.bottom; })()"), "Reel: First unread scrolls to it")
    pick.nth(1).click()
    check(page.locator("[data-testid=catchup]").count() == 0, "Reel: picking a highlight goes there and closes the reel")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_strip.png")
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    page.reload(); page.wait_for_selector("[data-testid=chat-strip]"); page.wait_for_timeout(400)
    check(page.locator("[data-testid=catchup]").count() == 0, "Back again with nothing new: no reel")
    ctx.close()

    # nothing stored yet: no reel (first visit), strip still there
    ctx = new_ctx(390, 800, seen=None); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=chat-strip]"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=catchup]").count() == 0, "First visit: no reel")
    ctx.close()
    # few unread: no reel
    ctx = new_ctx(390, 800, seen=25); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=chat-strip]"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=catchup]").count() == 0, "A few unread: no reel (it only appears for 10+)")
    ctx.close()
    # wide screen: the same chat page has the strip too
    ctx = new_ctx(1440, 900, seen=None); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("textarea.hud-reveal-textarea"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=chat-strip]").count() == 1, "Wide screen: the strip is there too")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
