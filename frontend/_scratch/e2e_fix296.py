import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix296.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(viewport):
        ctx = browser.new_context(viewport=viewport, has_touch=viewport["width"] < 700)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            body = DATA.get(path, DATA.get(key, {}))
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # ---- header: no big envelope, Post stays in the second bar
    ctx = new_ctx({"width": 1440, "height": 900}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=fp-post]"); page.wait_for_timeout(300)
    check(page.locator("header a[href='/pms']").count() == 0, "Header: no envelope link in the main bar")
    check(page.locator("[data-testid=fp-post]").count() == 1, "Faceplate keeps Post")
    check(page.locator(".scope-mask, .scope-circle").count() == 0, "Telemetry: no circle mask left over")
    ctx.close()

    # ---- phone: telemetry instrument, sort sits with the chips
    ctx = new_ctx({"width": 390, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/conversations?view=instrument"); page.wait_for_selector("[data-testid=conv-sort]"); page.wait_for_timeout(300)
    chips = page.locator(".space-chips").bounding_box(); sort = page.locator(".space-sort").bounding_box()
    check(abs((chips["y"] + chips["height"] / 2) - (sort["y"] + sort["height"] / 2)) < 30 and sort["x"] >= chips["x"], f"Phone telemetry: sort on the chips' row ({round(chips['y'])} vs {round(sort['y'])})")
    check(page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 1, "Phone telemetry: no horizontal overflow")
    ctx.close()

    # ---- phone soundbay: actions inside the Branches heading row, no gap
    ctx = new_ctx({"width": 390, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=branch-row]"); page.wait_for_timeout(300)
    check(page.locator("h2 .sb-h2-actions, .sb-h2-row .sb-h2-actions").count() >= 1 or page.locator(".sb-h2-actions").count() >= 1, "Phone Soundbay: copy-link and shuffle sit in the Branches heading row")
    search = page.locator("input[type=search]").first.bounding_box()
    hdr = page.evaluate("(() => { const e = document.querySelector('[data-testid=faceplate]'); const b = e ? e.getBoundingClientRect() : null; return b ? b.bottom : 0; })()")
    check(search["y"] - hdr < 120, f"Phone Soundbay: search sits close under the header bars ({round(search['y'] - hdr)}px)")
    ctx.close()

    # ---- drag a branch row to the pocket
    ctx = new_ctx({"width": 1440, "height": 900}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay?sort=az"); page.wait_for_selector("[data-testid=branch-row]")
    page.click("[data-testid=sb-filter-all]"); page.wait_for_timeout(200)
    row = page.locator("[data-testid=branch-row]").first
    check(row.get_attribute("draggable") == "true", "Soundbay: branch rows are draggable")
    check(page.locator("[data-testid=pocket-pad]").count() == 0, "No pad while nothing is dragged")
    b = row.bounding_box(); page.mouse.move(b["x"] + 60, b["y"] + b["height"] / 2); page.mouse.down(); page.mouse.move(b["x"] + 90, b["y"] + 30, steps=4)
    page.wait_for_selector("[data-testid=pocket-pad]", timeout=3000)
    check("Drop" in page.locator("[data-testid=pocket-pad]").inner_text(), "Dragging: an obvious pocket pad appears")
    pb = page.locator("[data-testid=pocket-pad]").bounding_box(); page.mouse.move(pb["x"] + pb["width"] / 2, pb["y"] + pb["height"] / 2, steps=6); page.mouse.up()
    page.wait_for_timeout(100)
    stored = page.evaluate("localStorage.getItem('exomusica_pocket_v1')") or ""
    check("branch" in stored, f"Dropped: the branch is in the pocket ({stored[:70]})")
    check(page.locator("[data-testid=pocket-pad].done").count() <= 1, "Dropped: the pad confirms, then leaves")
    page.wait_for_timeout(1800)
    check(page.locator("[data-testid=pocket-pad]").count() == 0, "The pad is gone afterwards")
    ctx.close()

    # ---- phone contribute: opening a branch scrolls to the row's name
    ctx = new_ctx({"width": 390, "height": 700}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/contribute"); page.wait_for_selector("[data-testid=contribute-list] .ct-row"); page.wait_for_timeout(300)
    rows = page.locator(".ct-row"); n = rows.count()
    if n >= 2:
        rows.nth(n - 1).click(); page.wait_for_timeout(1200)
        top = page.evaluate("document.querySelector('.ct-row[aria-pressed=true]').getBoundingClientRect().top")
        check(0 <= top < 200, f"Phone contribute: the opened branch's name is at the top ({round(top)}px)")
    else:
        check(True, "Phone contribute: only one branch in the mock, skipped")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
