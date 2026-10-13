import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BR = {"id": 2, "slug": "b2", "name": "Full Branch", "description": "d", "identityColor": "#e8814a", "identityGlyph": "wave", "visibility": "VISIBLE", "channel": None, "children": [], "posX": None, "posY": None, "coverArtUrl": None}
CAP = {"day": "2026-10-13", "years": [
    {"year": 2025, "yearsAgo": 1, "albums": [{"slug": "al1", "title": "First", "composer": "Ghost"}], "studies": [], "chat": {"count": 12, "channels": [{"slug": "hall", "name": "The Hall", "count": 12}], "highlights": [{"id": 77, "author": "neo", "text": "tuning the drone to 55 Hz", "channelSlug": "hall", "day": "2025-10-13"}]}},
    {"year": 2023, "yearsAgo": 3, "albums": [], "studies": [{"slug": "s1", "title": "Beating", "owner": "tachy"}], "chat": None}]}
caps = []
STUDY = {"id": 5, "slug": "mine-1", "title": "Beating tones", "body": "text", "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/branches/b2": return ok(BR)
        if key == "/api/capsule": caps.append(path); return ok(CAP)
        if key == "/api/studies/mine-1": return ok(STUDY)
        if key == "/api/studies/mine-1/citations": return ok([])
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=top-nav]")
    check(page.locator("[data-testid=hdr-branch]").count() == 0 and "themed" not in page.locator("[data-testid=top-nav]").get_attribute("class"), "Header: plain on the homepage")
    page.goto(f"{BASE}/branch/b2"); page.wait_for_selector("[data-testid=hdr-branch]")
    check("themed" in page.locator("[data-testid=top-nav]").get_attribute("class"), "Header: themed inside a branch")
    check("#e8814a" in (page.locator("[data-testid=top-nav]").get_attribute("style") or "").lower().replace("rgb(232, 129, 74)", "#e8814a"), f"Header: carries the branch colour ({page.locator('[data-testid=top-nav]').get_attribute('style')})")
    check("full branch" in page.locator("[data-testid=hdr-branch]").inner_text().lower(), "Header: names the branch")
    href = page.locator("[data-testid=feed-link] a").first.get_attribute("href")
    check(href == "/api/feed/branch/b2", f"Feed: branch page links its feed {href}")
    check(page.locator("link[rel=alternate][type='application/atom+xml']").count() == 1, "Feed: discoverable via <link rel=alternate>")
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=feed-link]")
    check(page.locator("[data-testid=feed-link] a").first.get_attribute("href") == "/api/feed/study/mine-1", "Feed: study page links its feed")
    check(page.locator("[data-testid=hdr-branch]").count() == 0, "Header: back to normal outside a branch")

    page.goto(f"{BASE}/capsule?md=10-13"); page.wait_for_selector("[data-testid=capsule-year]")
    check(caps and "md=10-13" in caps[-1], f"Capsule: asks for the chosen day {caps[-1:]}")
    check(page.locator("[data-testid=capsule-year]").count() == 2 and "1 year ago" in page.locator("[data-testid=capsule-year]").first.inner_text(), "Capsule: one block per year, newest first")
    check(page.locator("a[href='/topic/hall?day=2025-10-13#m-77']").count() == 1, "Capsule: a highlight links to that message on its day")
    check(page.locator("a[href='/album/al1']").count() == 1 and page.locator("a[href='/study/s1']").count() == 1, "Capsule: albums and studies listed")
    page.fill("[aria-label='Pick a day']", "2026-03-05"); page.wait_for_timeout(400)
    check("md=03-05" in caps[-1], f"Capsule: picking another day re-queries {caps[-1]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
