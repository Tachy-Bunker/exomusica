import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix297.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/two.wav", "rb").read()
W, H = 250, 20
lv = [min(15, max(0, 15 - abs((x * H // W) - (H - 1 - y)) * 4)) for y in range(H) for x in range(W)]
STRIP = bytes((lv[i] << 4) | lv[i + 1] for i in range(0, len(lv), 2))
def M(i, text, **kw):
    d = {"id": i, "channelId": 1, "authorId": 2, "authorUsername": "ghost9", "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
    d.update(kw); return d
VOICE = {"id": 9, "filename": "voice-note-20261009-101010.m4a", "url": "/uploads/v9.m4a", "sizeBytes": 1000}
DATA["/api/channels/hall"] = {"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1, "branch": {"slug": "b2", "name": "Branch Two"}}
DATA["/api/channels/hall/messages"] = [M(1, "alpha"), M(2, "see [Granular ice](/study/other-1) now"), M(3, "listen", attachments=[VOICE]), M(4, "@0:01 nice bit", replyPreview={"id": 3, "authorUsername": "ghost9", "excerpt": "listen"}, authorUsername="zed"), M(5, "gamma")]
DATA["/api/channels/hall/archive"] = []
DATA["/api/channels/hall/follow"] = {"following": False}
DATA["/api/branches/b2"] = {"id": 2, "slug": "b2", "name": "Branch Two", "description": "a branch", "channel": {"slug": "hall"}}
DATA["/api/emojis"] = [{"id": 1, "name": "fire", "imageUrl": "/uploads/e1.png"}, {"id": 2, "name": "eyes", "imageUrl": "/uploads/e2.png"}]
reactions = []; strips = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(w=390, h=800, touch=True):
        ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/voice-notes/9/spectrogram": strips.append(1); return route.fulfill(status=200, content_type="application/octet-stream", body=STRIP)
            if key.endswith("/reactions") and req.method == "POST": reactions.append(json.loads(req.post_data)); return ok({"ok": True}, 201)
            if key.startswith("/uploads/") and key.endswith(".m4a"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
            if key.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    def touch(page, sel, kind, dx=0, dy=0, pid=1):
        page.evaluate("""([sel, kind, dx, dy, pid]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: pid, clientX: r.left + 40 + dx, clientY: r.top + 12 + dy, isPrimary: true })); }""", [sel, kind, dx, dy, pid])

    # ---- phone chat gestures
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("#m-1"); page.wait_for_timeout(400)
    m2 = "#m-2 .msg-gest"
    touch(page, m2, "pointerdown"); page.wait_for_timeout(650)
    check(page.locator("[data-testid=radial]").count() == 1, "Hold: the fan of actions opens")
    items = page.locator(".radial-btn").all_inner_texts()
    check(all(k in " ".join(items) for k in ["Reply", "Copy link", "Pocket"]), f"Fan has reply, copy link and pocket ({len(items)} buttons)")
    touch(page, m2, "pointerup"); page.wait_for_timeout(100)
    page.click("[data-testid=radial-reply]")
    check(page.locator("text=Replying to").count() == 1 and page.locator("[data-testid=radial]").count() == 0, "Fan: Reply sets the reply and closes")
    # react via the second ring
    touch(page, m2, "pointerdown", pid=2); page.wait_for_timeout(650); touch(page, m2, "pointerup", pid=2)
    page.click("[data-testid=radial-react]"); page.wait_for_selector("[data-testid=radial-e1]")
    page.click("[data-testid=radial-e1]"); page.wait_for_timeout(150)
    check(reactions and reactions[-1]["emojiId"] == 1, f"Fan: react with a site emoji {reactions[-1:]}")
    # swipe right on message 2 -> pocket
    touch(page, m2, "pointerdown", pid=3); touch(page, m2, "pointermove", dx=40, pid=3); touch(page, m2, "pointermove", dx=100, pid=3); touch(page, m2, "pointerup", dx=100, pid=3); page.wait_for_timeout(200)
    pocket = page.evaluate("localStorage.getItem('exomusica_pocket_v1')") or ""
    check("other-1" in pocket, f"Swipe right: the study it links to is in the pocket ({pocket[:60]})")
    m1 = "#m-1 .msg-gest"
    touch(page, m1, "pointerdown", pid=4); touch(page, m1, "pointermove", dx=100, pid=4); touch(page, m1, "pointerup", dx=100, pid=4); page.wait_for_timeout(200)
    check(page.locator("text=Nothing to pocket").count() >= 1, "Swipe right on a message without links says so")
    # pull-down catch-up
    page.evaluate("""() => { const l = document.getElementById('chat-list'); l.scrollTop = 0;
      const t = (y) => new Touch({ identifier: 1, target: l, clientX: 100, clientY: y });
      l.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(100)] }));
      l.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(230)] }));
      l.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })); }""")
    page.wait_for_selector("[data-testid=catchup]", timeout=3000)
    check(page.locator("[data-testid=catchup]").count() == 1, "Pull down at the top: the catch-up reel opens")
    # voice strip
    check(page.locator("[data-testid=voice-strip]").count() == 1 and page.locator(".voice-strip .spec-canvas").count() == 1 and strips, "Voice note: shown as a strip of measured points")
    page.wait_for_function("document.querySelector('.voice-strip audio').duration > 0")
    check(page.locator(".voice-strip .spec-pin").count() == 1, "Voice note: the reply '@0:01 …' is pinned on it")
    page.click("[data-testid=voice-play]"); page.wait_for_timeout(300)
    check(page.evaluate("!document.querySelector('.voice-strip audio').paused"), "Voice note: plays")
    page.click("[data-testid=voice-play]")
    page.click("[data-testid=voice-pin]"); page.wait_for_timeout(150)
    check(page.input_value("textarea").startswith("@0:0") and page.locator("text=Replying to").count() == 1, "Voice note: the pin button starts a timed reply")
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone chat: no horizontal overflow ({o}px)")
    ctx.close()

    # ---- bottom sheet on a branch page
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/branch/b2"); page.wait_for_selector("[data-testid=chat-sheet]"); page.wait_for_timeout(500)
    h0 = page.locator("[data-testid=chat-sheet]").bounding_box()["height"]
    check(page.locator("[data-testid=chat-sheet]").get_attribute("data-detent") == "peek" and h0 < 220, f"Branch on a phone: the chat starts as a peek ({round(h0)}px)")
    check(page.locator("[data-testid=chat-sheet] textarea").is_visible(), "Peek: the composer is there")
    page.click("[data-testid=sheet-handle]"); page.wait_for_timeout(400)
    h1 = page.locator("[data-testid=chat-sheet]").bounding_box()["height"]
    check(page.locator("[data-testid=chat-sheet]").get_attribute("data-detent") == "half" and 330 < h1 < 450, f"Tap the handle: half ({round(h1)}px)")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_sheet.png")
    hb = page.locator("[data-testid=sheet-handle]").bounding_box()
    page.mouse.move(hb["x"] + 100, hb["y"] + 15); page.mouse.down(); page.mouse.move(hb["x"] + 100, hb["y"] - 300, steps=8); page.mouse.up(); page.wait_for_timeout(400)
    check(page.locator("[data-testid=chat-sheet]").get_attribute("data-detent") == "full", "Drag the handle up: full")
    page.keyboard.press("Tab")
    page.focus("[data-testid=sheet-handle]"); page.keyboard.press("ArrowDown"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=chat-sheet]").get_attribute("data-detent") == "half", "Keyboard: ArrowDown steps down")
    page.reload(); page.wait_for_selector("[data-testid=chat-sheet]")
    check(page.locator("[data-testid=chat-sheet]").get_attribute("data-detent") == "half", "The detent is remembered for the visit")
    ctx.close()

    # ---- tether chip in the room header (desktop width, standalone room)
    ctx = new_ctx(1440, 900, touch=False); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=tether]")
    check("Branch Two" in page.locator("[data-testid=tether]").inner_text() and page.locator("[data-testid=tether]").get_attribute("href").startswith("/soundbay"), "Tether: the room shows the branch it belongs to")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
