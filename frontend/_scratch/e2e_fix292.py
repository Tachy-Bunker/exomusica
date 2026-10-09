import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix292.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
src281 = open(__file__.replace("e2e_fix292.py", "e2e_fix281.py")).read()
exec(src281[src281.index("def S("):src281.index("traces = []")])
AROUND["study:mine-1"]["context"].append(wire("wiki", "notes", "Field notes", "in the Log"))
DATA["/api/wiki/start"] = {"slug": "start", "title": "Start here", "contentMarkdown": "hi", "parent": None, "children": [], "breadcrumbs": []}
def M(i, text):
    return {"id": i, "channelId": 1, "authorId": 2, "authorUsername": "ghost9", "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
DATA["/api/channels/hall"] = {"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1}
DATA["/api/channels/hall/messages"] = [M(1, "alpha"), M(2, "beta ✦ [Granular ice](http://localhost:4173/study/other-1)"), M(3, "gamma")]
DATA["/api/channels/hall/archive"] = []
DATA["/api/channels/hall/follow"] = {"following": False}
TRAIL = [{"type": "wiki", "id": "start", "title": "Start here", "href": "/wiki/start"}]

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(w, h, trail=True):
        ctx = browser.new_context(viewport={"width": w, "height": h})
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});"
        if trail: init += f" if (!sessionStorage.getItem('exomusica_trail_v1')) sessionStorage.setItem('exomusica_trail_v1', {json.dumps(json.dumps(TRAIL))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if path.startswith("/api/atlas/around"):
                k = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":"); a = AROUND.get(k)
                return ok(a or {"error": "nf"}, 200 if a else 404)
            if path.startswith("/api/atlas/trace"): return route.fulfill(status=204, body="")
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # ---- squelch: only when asked for
    ctx = new_ctx(1440, 900); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("textarea.hud-reveal-textarea")
    check(page.locator("[data-testid=squelch]").count() == 0, "Squelch: not on screen by default")
    page.click("[data-testid=squelch-toggle]")
    check(page.locator("[data-testid=squelch]").count() == 1, "Squelch: the button opens it")
    page.click("[data-testid=squelch-2]"); page.click("[data-testid=squelch-toggle]")
    check(page.locator("[data-testid=squelch]").count() == 1, "Squelch: stays visible while it is doing something")
    page.click("[data-testid=squelch-0]")
    check(page.locator("[data-testid=squelch]").count() == 0, "Squelch: hides itself again once set back to open")
    ctx.close()

    # ---- faceplate: full width with the dock; relations in the bar, nothing on the page edges
    ctx = new_ctx(1440, 900); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=fp-rels]")
    check(page.locator(".margins").count() == 0, "Desktop: nothing is laid over the page's own columns")
    page.click("[data-testid=margin-chat]"); page.wait_for_selector("textarea.hud-reveal-textarea")
    fp = page.locator("[data-testid=faceplate]").bounding_box()
    check(fp["width"] > 1400, f"Dock open: the bar keeps its full width ({fp['width']:.0f}px)")
    ctx.close()

    # ---- phone: sheets have a visible way out
    ctx = new_ctx(390, 800); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=faceplate]"); page.wait_for_timeout(300)
    page.click("[data-testid=fp-around]"); page.wait_for_selector("[data-testid=around-sheet]")
    sheet = page.locator("[data-testid=around-sheet]").bounding_box()
    check(abs(sheet["y"] + sheet["height"] - 800) < 2 and sheet["width"] > 385, f"Phone: Around is a sheet from the bottom ({sheet['height']:.0f}px tall)")
    check(page.locator("[data-testid=fp-backdrop]").is_visible() and page.locator("[data-testid=fp-panel-close]").is_visible(), "Phone: a dimmed backdrop and a Close button are there")
    page.mouse.click(190, 60); page.wait_for_timeout(200)
    check(page.locator("[data-testid=around-sheet]").count() == 0, "Phone: tapping outside closes it")
    page.click("[data-testid=fp-pocket]"); page.wait_for_selector("[data-testid=pocket-tray]")
    page.click("[data-testid=fp-panel-close]"); page.wait_for_timeout(200)
    check(page.locator("[data-testid=pocket-tray]").count() == 0, "Phone: the Close button closes the pocket")
    # QR sits above the bars
    page.click("[data-testid=fp-around]") if False else None
    page.locator("button", has_text="QR").first.click(); page.wait_for_selector("[data-testid=qr-modal]")
    top = page.evaluate("""() => { const m = document.querySelector('[data-testid=qr-modal]'); const r = m.getBoundingClientRect(); const e = document.elementFromPoint(190, 20); return {parent: m.parentElement === document.body, y: r.top, onTop: !!e && !!e.closest('[data-testid=qr-modal]')}; }""")
    check(top["parent"] and top["y"] <= 0 and top["onTop"], f"Phone: the QR dialog covers the bars instead of hiding behind them {top}")
    page.keyboard.press("Escape")
    ctx.close()

    # ---- telemetry on a phone
    ctx = new_ctx(390, 800); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/telemetry"); page.wait_for_selector("[data-testid=conversations-page]"); page.wait_for_timeout(300)
    check(page.locator(".conv-head [data-testid=view-list]").count() == 1 and page.locator(".conv-controls [data-testid=view-list]").count() == 0, "Telemetry phone: List/Instrument/Map are in the header row")
    order = page.evaluate("""() => { const h = document.querySelector('.conv-head'); return [...h.children].map(c => c.className.split(' ')[0] || c.tagName); }""")
    check(order.index("conv-members") < order.index("view-switch"), f"Telemetry phone: after the members button ({order})")
    sw = page.locator(".conv-head .view-switch").bounding_box(); head = page.locator(".conv-head").bounding_box()
    check(sw["y"] >= head["y"] - 1 and sw["y"] + sw["height"] <= head["y"] + head["height"] + 1, "Telemetry phone: on the same row as the stats")
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Telemetry phone: no horizontal overflow ({o}px)")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_tele.png")
    page.click("[data-testid=view-instrument]"); page.wait_for_timeout(200)
    check("instrument" in page.url, "Telemetry phone: the switch still works")
    ctx.close()
    ctx = new_ctx(1440, 900); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/telemetry"); page.wait_for_selector("[data-testid=conversations-page]"); page.wait_for_timeout(300)
    check(page.locator(".conv-controls [data-testid=view-list]").count() == 1, "Telemetry desktop: the switch stays with the controls")
    ctx.close()

    # ---- study → Log
    ctx = new_ctx(390, 800); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=log-links]")
    check("Start here" in page.locator("[data-testid=log-back]").inner_text(), "Study: a way back to the Log page you came from")
    check("Field notes" in page.locator("[data-testid=log-links]").inner_text(), "Study: other Log pages that mention it are offered")
    page.click("[data-testid=log-back]"); page.wait_for_url("**/wiki/start")
    check(True, "Study: the back chip goes to that Log page")
    ctx.close()
    ctx = new_ctx(390, 800, trail=False); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/other-1"); page.wait_for_selector("[data-testid=faceplate]"); page.wait_for_timeout(500)
    check(page.locator("[data-testid=log-links]").count() == 0, "Study: nothing to show when no Log page relates to it")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
