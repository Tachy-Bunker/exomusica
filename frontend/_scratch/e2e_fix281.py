import json, re, sys, os
from playwright.sync_api import sync_playwright

src = open(__file__.replace("e2e_fix281.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])  # BASE, DATA, hb, ME, ADMIN, WAV ... from the earlier harness

def S(slug, title, owner="ghost9"):
    return {"slug": slug, "title": title, "body": "", "status": "IN_PROGRESS", "owner": {"username": owner}, "branches": [], "files": [], "annotations": [], "charts": [], "channel": None}
DATA["/api/studies/other-1"] = S("other-1", "Granular ice")
DATA["/api/studies/third-1"] = S("third-1", "Third study")
DATA["/api/atlas/index"] = [["study", "mine-1", "Beating tones in a cave", "tachy"], ["study", "other-1", "Granular ice", "ghost9"], ["study", "third-1", "Third study", "ghost9"], ["branch", "b2", "Full Branch", ""], ["wiki", "start", "Start here", ""]]
def wire(t, k, title, sub=None): return {"type": t, "key": f"{t}:{k}", "title": title, "href": f"/{t}/{k}", "sub": sub, "image": None}
AROUND = {
  "study:mine-1": {"key": "study:mine-1", "title": "Beating tones in a cave", "context": [wire("branch", "b2", "Full Branch", "branch")],
                   "conversation": [{"slug": "hall", "name": "The Hall", "branchSlug": None, "href": "/topic/hall"}],
                   "neighbors": [wire("study", "other-1", "Granular ice", "same branch"), wire("study", "third-1", "Third study", "by tachy")]},
  "study:other-1": {"key": "study:other-1", "title": "Granular ice", "context": [], "conversation": [], "neighbors": [wire("study", "mine-1", "Beating tones in a cave")]},
}
traces = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(cond, msg):
        results.append((bool(cond), msg)); print(("ok   " if cond else "FAIL ") + msg)
    def new_ctx(logged_in=True, viewport=None, user=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        if logged_in:
            ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user or ME))});")
        def handle(route):
            req = route.request
            path = req.url.replace(BASE, "")
            if path.startswith("/api/atlas/around"):
                key = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":")
                a = AROUND.get(key)
                return route.fulfill(status=200 if a else 404, content_type="application/json", body=json.dumps(a or {"error": "nf"}))
            if path.startswith("/api/atlas/trace"):
                traces.append(json.loads(req.post_data or "{}")); return route.fulfill(status=204, body="")
            if req.method == "POST" and path.startswith("/api/studies"):
                return route.fulfill(status=201, content_type="application/json", body=json.dumps({"slug": "new-one"}))
            key = path.split("?")[0]
            if path in DATA: return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[path]))
            if key in DATA: return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[key]))
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return route.fulfill(status=200, content_type="application/json", body="{}")
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(page): page.on("pageerror", lambda e: (errors.append(page.url + " " + str(e)), print("PAGEERROR", page.url, str(e)[:200])))

    # ---- faceplate
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=faceplate]")
    check(page.locator("[data-testid=fp-readout]").inner_text().startswith("---.---"), "Faceplate: no frequency on a list page")
    check("Soundbay" in page.locator("[data-testid=fp-name]").inner_text(), "Faceplate: names the section")
    nav = page.evaluate("() => [parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')), document.querySelector('.top-nav').offsetHeight + document.querySelector('.faceplate').offsetHeight]")
    check(abs(nav[0] - nav[1]) < 1.5, f"--nav-height includes the faceplate {nav}")
    ctx.close()

    # ---- a thing: readout, context, margins, arrival, trail, trace
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=fp-context]", timeout=15000)
    ro = page.locator("[data-testid=fp-readout]").inner_text()
    check(re.match(r"^7\.\d{3}", ro) is not None, f"Faceplate: study sits in its band ({ro})")
    check("Beating tones in a cave" in page.locator("[data-testid=fp-name]").inner_text(), "Faceplate: shows the thing's name")
    check(page.locator("[data-testid=fp-context]").inner_text() == "Full Branch", "Faceplate: 'in' chip names the branch")
    check(page.locator("[data-testid=fp-rel-near] [data-testid=plate]").count() == 2, "Faceplate: two neighbours under Nearby")
    check(page.locator("[data-testid=margin-chat]").is_visible(), "Margins: conversation sits at the bottom edge")
    check(not page.locator("[data-testid=fp-rel-near] .fp-rel-drop").is_visible(), "Faceplate: Nearby is closed until hovered")
    page.hover("[data-testid=fp-rel-near] .fp-rel-btn"); page.wait_for_timeout(250)
    import os
    if os.environ.get("SHOT"): page.screenshot(path="/tmp/shot_study.png")
    box2 = page.locator("[data-testid=fp-rel-near] .plate-link").first.bounding_box()
    check(box2["width"] > 200, f"Faceplate: hover drops the cards down ({box2['width']:.0f}px)")
    page.evaluate("""() => { window.__arr = []; const m = document.querySelector('main.main-content'); new MutationObserver(() => { if (m.dataset.arrive) window.__arr.push(m.dataset.arrive); }).observe(m, { attributes: true, attributeFilter: ['data-arrive'] }); }""")
    page.locator("[data-testid=fp-rel-near] [data-testid=plate]").first.click()
    page.wait_for_url("**/study/other-1"); page.wait_for_timeout(200)
    arrive = page.evaluate("() => window.__arr[0] || null")
    check(arrive == "right", f"Arrival: the page slides in from the side it was reached from ({arrive})")
    page.wait_for_selector("[data-testid=fp-rel-there] [data-testid=plate]", state="attached", timeout=8000)
    check("Beating tones in a cave" in page.locator("[data-testid=fp-rel-there]").text_content(), "Faceplate: 'You were here' remembers where you came from")
    page.wait_for_timeout(500)
    page.evaluate("() => window.dispatchEvent(new Event('pagehide'))"); page.wait_for_timeout(300)
    check(any(["study:mine-1", "study:other-1"] in t.get("edges", []) for t in traces), f"Trace: the hop was reported as an anonymous pair {traces}")
    ctx.close()

    # ---- pocket
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=fp-rel-near] [data-testid=plate]", state="attached")
    page.hover("[data-testid=fp-rel-near] .fp-rel-btn"); page.wait_for_timeout(250)
    page.locator("[data-testid=fp-rel-near] [data-testid=plate-take]").first.click()
    check("1" in page.locator("[data-testid=fp-pocket]").inner_text(), "Pocket: picking up shows the count")
    page.reload(); page.wait_for_selector("[data-testid=faceplate]")
    check("1" in page.locator("[data-testid=fp-pocket]").inner_text(), "Pocket: survives a reload")
    page.click("[data-testid=fp-pocket]"); page.wait_for_selector("[data-testid=pocket-tray]")
    check("Granular ice" in page.locator("[data-testid=pocket-tray]").inner_text(), "Pocket: the tray lists it")
    drag = page.locator("[data-testid=pocket-tray] a[draggable=true]").count()
    check(drag == 1, "Pocket: items are draggable links (drop one into a chat to share it)")
    page.click("[data-testid=pocket-drop]")
    check(page.locator("[data-testid=pocket-tray]").inner_text().count("Granular ice") == 0, "Pocket: dropping removes it")
    page.click("[data-testid=pocket-take-here]")
    check("Beating tones in a cave" in page.locator("[data-testid=pocket-tray]").inner_text(), "Pocket: pick up this page")
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    check(page.locator("[data-testid=pocket-tray]").count() == 0, "Pocket: Escape closes the tray")
    ctx.close()

    # ---- terminal
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=faceplate]")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    check(page.evaluate("document.activeElement === document.querySelector('[data-testid=terminal-input]')"), "Terminal: Ctrl+K opens it focused")
    check(page.locator("[data-testid=terminal]").get_attribute("aria-modal") == "true", "Terminal: a modal dialog (the letter shortcuts stand down)")
    page.keyboard.type("gran"); page.wait_for_selector("[data-testid=terminal-suggestions] li")
    if os.environ.get("SHOT"): page.screenshot(path="/tmp/shot_term.png")
    check("Granular ice" in page.locator("[data-testid=terminal-suggestions]").inner_text(), "Terminal: suggests while typing")
    page.keyboard.press("ArrowDown"); page.keyboard.press("Enter")
    page.wait_for_url("**/study/other-1")
    check(page.locator("[data-testid=terminal]").count() == 0, "Terminal: closes after going somewhere")
    page.keyboard.press("`"); page.wait_for_selector("[data-testid=terminal-input]")
    check(True, "Terminal: backtick opens it")
    page.keyboard.type("?"); page.keyboard.press("Enter")
    check("tune" in page.locator("[data-testid=terminal-out]").inner_text(), "Terminal: ? lists the commands")
    page.keyboard.type("admin"); page.keyboard.press("Enter")
    check("Operators only" in page.locator("[data-testid=terminal-out]").inner_text(), "Terminal: admin is for operators")
    page.keyboard.type("find study"); page.keyboard.press("Enter")
    check(page.locator("[data-testid=terminal-out] [data-testid=plate]").count() >= 3, "Terminal: find lists clickable plates")
    page.keyboard.type("take"); page.keyboard.press("Enter")
    check("1" in page.locator("[data-testid=fp-pocket]").inner_text(), "Terminal: take puts this page in the pocket")
    f = page.locator("[data-testid=fp-readout]").inner_text().split("MHz")[0].strip()
    page.keyboard.type(f"tune {f}"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=terminal]").count() == 0 and "other-1" in page.url, "Terminal: tune <frequency> lands on that thing")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]"); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check(page.locator("[data-testid=terminal]").count() == 0, "Terminal: Escape closes")
    ctx.close()
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/xenolab"); page.wait_for_selector("[data-testid=studies-panel]")
    page.click("input[aria-label='Search studies']"); page.keyboard.type("`")
    check(page.locator("[data-testid=terminal]").count() == 0, "Terminal: typing a backtick in a field does not open it")
    ctx.close()

    # ---- narrow screens: no edge peeks, an Around sheet instead
    ctx = new_ctx(viewport={"width": 800, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=faceplate]"); page.wait_for_timeout(400)
    check(page.locator("[data-testid=fp-rels]").count() == 0, "Narrow: the faceplate has no hover relations (the Around sheet is used)")
    page.click("[data-testid=fp-around]"); page.wait_for_selector("[data-testid=around-sheet]")
    t = page.locator("[data-testid=around-sheet]").inner_text()
    check("Granular ice" in t and "Full Branch" in t and "The Hall" in t, "Narrow: the Around sheet lists belongs-to, conversation and nearby")
    ctx.close()
    ctx = new_ctx(viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    for url in ["/study/mine-1", "/soundbay", "/"]:
        page.goto(BASE + url); page.wait_for_selector("[data-testid=faceplate]"); page.wait_for_timeout(500)
        over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(over <= 1, f"{url} no horizontal overflow with the faceplate on a phone ({over}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p:
    run(p)
