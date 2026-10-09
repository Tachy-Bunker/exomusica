import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix285.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

def M(i, text, kind="text", data=None, author="ghost9", aid=2, **k):
    d = {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": kind, "data": data}
    d.update(k); return d
MSGS = [
  M(1, "lol"),
  M(2, "I think the second movement drags a bit, honestly"),
  M(3, "[CQ] ice drones (looking for: feedback)", "cq", {"topic": "ice drones", "wants": ["feedback"]}),
  M(4, "[Report] https://x.y/a.mp3: R5 S7 T6", "report", {"target": "https://x.y/a.mp3", "r": 5, "s": 7, "t": 6, "note": "warm"}),
  M(5, "[Poll] Which?", "poll", {"q": "Which?", "options": ["red", "blue"]}),
  M(6, "[A/B] Warmer?", "ab", {"q": "Warmer?", "a": "https://a/1.mp3", "b": "https://a/2.mp3"}),
  M(7, "[Clip] swell 0:12-0:20 https://a/x.mp3", "clip", {"url": "https://a/x.mp3", "from": 12, "to": 20, "label": "swell"}),
  M(8, "check this https://a.b/c"),
]
POLL = {"mine": None, "total": 3, "counts": None}
sent, votes = [], []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx():
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/channels/hall/messages":
                if req.method == "POST":
                    b = json.loads(req.post_data); sent.append(b)
                    if b.get("kind") == "poll" and len(b["data"]["options"]) > 5: return ok({"error": "x"}, 400)
                    return ok(M(99, "[CQ] posted", b.get("kind", "text"), b.get("data"), author="tachy", aid=1), 201)
                return ok(MSGS)
            if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1})
            if key == "/api/channels/hall/archive": return ok([])
            if key == "/api/channels/hall/follow": return ok({"following": False})
            m = re.match(r"/api/messages/(\d+)/poll", key)
            if m: return ok(POLL)
            m = re.match(r"/api/messages/(\d+)/vote", key)
            if m:
                votes.append(json.loads(req.post_data)); POLL.update(mine=votes[-1]["option"], total=4, counts=[1, 3] if votes[-1]["option"] == 1 else [3, 1]); return route.fulfill(status=204, body="")
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=card-cq]")
    for k, name in [("cq", "CQ call"), ("report", "signal report"), ("poll", "poll"), ("ab", "A/B"), ("clip", "clip")]:
        check(page.locator(f"[data-testid=card-{k}]").count() == 1, f"Card: {name} renders")
    check(page.locator("[data-testid=card-report] .kcard-rst b").all_inner_texts() == ["5", "7", "6"], "Report: R S T shown")
    check("12" in page.locator("[data-testid=card-clip] audio").get_attribute("src") or page.locator("[data-testid=card-clip] audio").get_attribute("src").endswith("#t=12,20"), "Clip: plays only the marked seconds (media fragment)")
    check(page.locator("[data-testid=card-poll] .poll-n").count() == 0 and "results show after you vote" in page.locator("[data-testid=card-poll]").inner_text(), "Poll: counts hidden before voting")
    page.locator("[data-testid=card-poll] [data-testid=poll-opt]").nth(1).click(); page.wait_for_timeout(300)
    check(votes[-1] == {"option": 1} and page.locator("[data-testid=card-poll] .poll-n").all_inner_texts() == ["1", "3"], "Poll: vote sent, counts appear")
    # squelch
    n0 = page.locator(".message").count()
    page.click("[data-testid=squelch-1]"); page.wait_for_timeout(200)
    t = page.locator(".message-list").inner_text()
    check("lol" not in t and "second movement" in t, "Squelch quiet: one-liners held back, real messages stay")
    check(page.locator("[data-testid=squelch-held]").inner_text().startswith("1 held back"), "Squelch: says how many are held back")
    page.click("[data-testid=squelch-2]"); page.wait_for_timeout(200)
    t = page.locator(".message-list").inner_text()
    check("second movement" not in t and "check this" in t and page.locator("[data-testid=card-cq]").count() == 1, "Squelch signal: links and calls stay")
    page.click("[data-testid=squelch-3]"); page.wait_for_timeout(200)
    check("check this" not in page.locator(".message-list").inner_text() and page.locator("[data-testid=card-clip]").count() == 1, "Squelch calls: only structured messages")
    page.reload(); page.wait_for_selector("[data-testid=squelch]")
    check(page.locator("[data-testid=squelch-3]").get_attribute("aria-pressed") == "true", "Squelch: remembered")
    page.click("[data-testid=squelch-0]")
    # commands
    ta = page.locator("textarea").first
    ta.fill("/"); page.wait_for_selector("[data-testid=cmd-hints]")
    check(page.locator("[data-testid=cmd-hints] li").count() == 5, "Commands: typing / lists them")
    ta.fill("/poll Pick? | one"); page.keyboard.press("Enter"); page.wait_for_selector("[data-testid=cmd-error]")
    check("Usage: /poll" in page.locator("[data-testid=cmd-error]").inner_text() and not sent, "Commands: bad usage is explained, nothing sent")
    ta.fill("/cq ice drones +feedback"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
    check(sent and sent[-1]["kind"] == "cq" and sent[-1]["data"]["wants"] == ["feedback"], "Commands: /cq sends a structured message")
    ta.fill("/report https://x.y/a.mp3 5/7/6 warm"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check(sent[-1]["kind"] == "report" and sent[-1]["data"]["t"] == 6, "Commands: /report parsed")
    ta.fill("just a normal message"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check("kind" not in sent[-1], "Commands: ordinary text is unchanged")
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
