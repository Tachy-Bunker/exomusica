import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix289.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
src281 = open(__file__.replace("e2e_fix289.py", "e2e_fix281.py")).read()
exec(src281[src281.index("def S("):src281.index("traces = []")])
DATA["/api/channels/hall"] = {"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1}
DATA["/api/channels/hall/messages"] = []
DATA["/api/channels/hall/archive"] = []
DATA["/api/channels/hall/follow"] = {"following": False}
POCKET = [{"key": "study:other-1", "type": "study", "id": "other-1", "title": "Granular ice", "href": "/study/other-1"}]

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(w=1440, h=900):
        ctx = browser.new_context(viewport={"width": w, "height": h})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_pocket_v1', {json.dumps(json.dumps(POCKET))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if path.startswith("/api/atlas/around"):
                k = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":"); a = AROUND.get(k)
                return ok(a or {"error": "nf"}, 200 if a else 404)
            if path.startswith("/api/atlas/trace"): return route.fulfill(status=204, body="")
            if key == "/api/landmarks": return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # ---- Terminal: shows what you can do before typing; ghost completion; verbs complete
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=faceplate]")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-menu]")
    menu = page.locator("[data-testid=terminal-menu]").inner_text()
    check("Soundbay" in menu and "XenoLab" in menu and "lens" in menu and "where" in menu, "Terminal: nothing typed yet, yet places and commands are listed")
    page.locator(".term-chip-verb", has_text="lens").click()
    check(page.locator("[data-testid=terminal-input]").input_value() == "lens ", "Terminal: clicking a command chip fills it in")
    page.fill("[data-testid=terminal-input]", "")
    page.type("[data-testid=terminal-input]", "sound")
    check(page.locator("[data-testid=terminal-ghost]").count() == 1 and page.locator("[data-testid=terminal-ghost]").inner_text().endswith("bay"), "Terminal: a faint completion shows the rest")
    check(page.locator("[data-testid=terminal-tabhint]").is_visible(), "Terminal: a Tab key hint is shown")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_term.png")
    page.keyboard.press("Tab")
    check(page.locator("[data-testid=terminal-input]").input_value() == "soundbay", "Terminal: Tab accepts the completion")
    page.fill("[data-testid=terminal-input]", "len")
    check("lens" in page.locator("[data-testid=terminal-suggestions]").inner_text(), "Terminal: commands complete too")
    page.keyboard.press("Tab")
    check(page.locator("[data-testid=terminal-input]").input_value() == "lens ", "Terminal: Tab completes a command")
    page.keyboard.press("Enter"); page.wait_for_timeout(200)
    check(page.locator("[data-testid=terminal-menu]").count() == 1, "Terminal: after a command the options are shown again")
    page.keyboard.press("Escape")

    # ---- Trace lens explains itself
    page.evaluate("localStorage.setItem('exomusica_lens', '0')")
    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=fp-lens]")
    page.hover("[data-testid=fp-lens]")
    check(page.locator("[data-testid=fp-lens-tip]").is_visible() and "marks" in page.locator("[data-testid=fp-lens-tip]").inner_text(), "Trace: hovering says what the lens does")
    page.click("[data-testid=fp-lens]"); page.wait_for_selector("[data-testid=landmarks-nowhere]")
    check("can't hold marks" in page.locator("[data-testid=landmarks-nowhere]").inner_text(), "Trace: on a page that can't hold marks, it says so")
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=landmarks]")
    check("fade" in page.locator("[data-testid=landmarks]").inner_text(), "Trace: where marks can be left, the panel explains what marks are")
    page.click("[data-testid=fp-lens]")
    ctx.close()

    # ---- Dock open: relations move into the faceplate; pocket → chat
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=margin-chat]")
    check(page.locator("[data-testid=margins-right]").count() == 0 and page.locator("[data-testid=fp-rel-near]").count() == 1, "Dock closed: nearby is in the faceplate, not on the page edge")
    page.click("[data-testid=margin-chat]"); page.wait_for_selector("textarea.hud-reveal-textarea")
    page.wait_for_selector("[data-testid=fp-rels]")
    check(page.locator("[data-testid=margins-right]").count() == 0, "Dock open: still no edge margins")
    near = page.locator("[data-testid=fp-rel-near]")
    check(near.count() == 1, "Dock open: Nearby is in the faceplate")
    page.hover("[data-testid=fp-rel-near] .fp-rel-btn"); page.wait_for_timeout(150)
    drop = near.locator(".fp-rel-drop"); box = drop.bounding_box()
    dock_left = page.evaluate("document.querySelector('textarea.hud-reveal-textarea').getBoundingClientRect().left")
    top = page.evaluate("(b) => { const e = document.elementFromPoint(b.x + b.width/2, b.y + 20); return !!e && !!e.closest('.fp-rel-drop'); }", box)
    check(drop.is_visible() and top, "Hover: the list drops down and is on top of the page")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_dock.png")
    fb = page.locator("[data-testid=fp-pocket]").bounding_box()
    fp = page.locator("[data-testid=faceplate]").bounding_box()
    dock_top = page.evaluate("document.querySelector('textarea.hud-reveal-textarea').closest('div[style*=fixed]').getBoundingClientRect().top")
    check(fp["width"] > 1300 and fp["y"] + fp["height"] <= dock_top + 2, f"Faceplate keeps its full width, and the dock starts below it (w {fp['width']:.0f}, bottom {fp['y'] + fp['height']:.0f} <= {dock_top:.0f})")
    page.mouse.move(10, 600); page.wait_for_timeout(150)
    check(not drop.is_visible(), "Moving away closes it")
    # pocket: paste button
    page.click("[data-testid=fp-pocket]"); page.wait_for_selector("[data-testid=pocket-send]")
    page.click("[data-testid=pocket-send]")
    v = page.locator("textarea.hud-reveal-textarea").input_value()
    check(v.startswith("[Granular ice](") and v.rstrip().endswith("/study/other-1)"), f"Pocket: the button pastes a link into the chat ({v!r})")
    # pocket: drag into the composer
    page.fill("textarea.hud-reveal-textarea", "see ")
    page.locator("[data-testid=pocket-tray] [data-testid=plate]").drag_to(page.locator("textarea.hud-reveal-textarea"))
    v = page.locator("textarea.hud-reveal-textarea").input_value()
    check("[Granular ice](" in v and v.startswith("see "), f"Pocket: dragging an item into the chat works ({v!r})")
    ctx.close()

    # ---- Explore: the area under the card eases, never jumps
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/?branch=b1"); page.wait_for_selector("[data-testid=explore-module]"); page.wait_for_timeout(600)
    below = page.locator(".explore-below")
    check("open" not in (below.get_attribute("class") or "") and below.bounding_box()["height"] < 2, "Explore: a branch with nothing under the card takes no room")
    page.locator(".gtile[data-slug=b2]").click()
    page.wait_for_function("document.querySelector('.explore-below').classList.contains('open')")
    h0 = below.bounding_box()["height"]; page.wait_for_timeout(500); h1 = below.bounding_box()["height"]
    check(h1 > 60 and h0 < h1, f"Explore: it opens gradually ({h0:.0f} -> {h1:.0f}px)")
    page.locator(".gtile[data-slug=b1]").click(); page.wait_for_timeout(60)
    mid = below.bounding_box()["height"]; page.wait_for_timeout(500); end = below.bounding_box()["height"]
    check(0 <= end < 2 and mid > end and page.locator(".explore-below.open").count() == 0, f"Explore: and closes gradually ({mid:.0f} -> {end:.0f}px)")
    check(page.locator(".explore-below").evaluate("e => getComputedStyle(e).transitionDuration").split(",")[0] in ("0.32s", "0.32"), "Explore: one cheap CSS transition")
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
