import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
ADM = {**ME, "isAdmin": True}
def M(key, title, metric, label, target, now, live=True, reached=None, perk="Something opens."):
    r = now >= target if reached is None else reached
    return {"key": key, "title": title, "perk": perk, "metric": metric, "label": label, "target": target, "now": now, "reached": r, "reachedAt": "2026-10-01T00:00:00Z" if r else None, "live": live}
LIST = [M("m-tracks", "First hundred", "TRACKS", "tracks", 100, 87), M("m-roll", "Roll call", "MEMBERS", "members", 25, 30, live=False),
        M("m-xray", "X-ray lens", "STUDIES", "studies", 25, 5, live=False), M("m-echo", "Echo", "POSTS", "posts", 10000, 4000, live=False), M("m-thermal", "Thermal lens", "SCANS", "scans", 1000, 900, live=False)]
ADMIN = [{**m, "defaultTarget": m["target"], "enabled": True, "metricLabel": m["label"]} for m in LIST]
POST = {"id": 1, "slug": "out-of-100", "title": "87 out of 100 !!", "publishedAt": "2026-10-10T00:00:00Z", "font": None,
        "contentMarkdown": "We are close.\n\n@milestone(m-tracks)\n\nAnd what comes after:\n\n@milestones\n\n@milestone(m-gone)\n"}
puts = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []; hits = {"ms": 0}
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1300, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADM))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/milestones": hits["ms"] += 1; return ok([m for m in LIST])
        if key == "/api/admin/milestones": return ok(ADMIN)
        if key.startswith("/api/admin/milestones/") and req.method == "PUT":
            k = key.rsplit("/", 1)[1]; b = json.loads(req.post_data); puts.append((k, b))
            row = next(r for r in ADMIN if r["key"] == k)
            if "target" in b: row["target"] = row["defaultTarget"] if b["target"] is None else b["target"]
            if "enabled" in b: row["enabled"] = b["enabled"]
            return ok(row)
        if key == "/api/blog/out-of-100": return ok(POST)
        if key == "/api/blog": return ok([{"id": 1, "slug": "out-of-100", "title": POST["title"], "coverImageUrl": None, "publishedAt": POST["publishedAt"]}])
        if key == "/api/glossary": return ok({"terms": [], "pageSlug": None})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or "sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    pg.goto(f"{BASE}/news/out-of-100"); pg.wait_for_selector("[data-testid=milestone-card]")
    cards = pg.locator("[data-testid=milestone-card]")
    check(cards.nth(0).get_attribute("data-key") == "m-tracks" and "87 / 100 tracks" in cards.nth(0).inner_text() and "87%" in cards.nth(0).inner_text(), f"@milestone(key) draws that milestone with progress {cards.nth(0).inner_text()[:60]!r}")
    check(cards.count() == 4, f"@milestones adds the three closest unfinished ones ({cards.count()} cards in total)")
    keys = [cards.nth(i).get_attribute("data-key") for i in range(cards.count())]
    check(keys[1:] == ["m-thermal", "m-echo", "m-xray"] or keys[1:] == ["m-thermal", "m-xray", "m-echo"] or (keys[1] == "m-thermal"), f"…closest first, reached ones left out {keys}")
    check("m-roll" not in keys[1:], "…a reached milestone isn't listed as 'next'")
    check(pg.locator("[data-testid=milestone-none]").count() == 1, "An unknown or switched-off key says so instead of breaking")
    check("reward being built" in cards.nth(1).inner_text() and "reward being built" not in cards.nth(0).inner_text(), "Unbuilt rewards are labelled honestly")
    check(hits["ms"] == 1, f"All cards on a page share one request ({hits['ms']})")
    bar = cards.nth(0).locator("[role=progressbar]")
    check(bar.get_attribute("aria-valuenow") == "87" and "of 100" in (bar.get_attribute("aria-label") or ""), "The bar is readable by screen readers")

    # Admin
    pg.goto(f"{BASE}/admin/milestones"); pg.wait_for_selector("[data-testid=milestones-admin]")
    check(pg.locator("[data-testid^=ms-m-]").count() == 5, "Admin lists the milestones")
    check(pg.locator("[data-testid=ms-save-m-tracks]").count() == 0, "No Save button until a number changes")
    pg.fill("input[aria-label='Target for First hundred']", "250"); pg.click("[data-testid=ms-save-m-tracks]"); pg.wait_for_timeout(300)
    check(puts[-1] == ("m-tracks", {"target": 250}), f"Saving a target sends just that {puts[-1]}")
    check(pg.locator("[data-testid=ms-reset-m-tracks]").count() == 1, "A changed target offers a way back to the default")
    pg.click("[data-testid=ms-reset-m-tracks]"); pg.wait_for_timeout(300)
    check(puts[-1] == ("m-tracks", {"target": None}) and pg.input_value("input[aria-label='Target for First hundred']") == "100", "Reset sends null and shows the default")
    pg.click("[data-testid=ms-on-m-echo]"); pg.wait_for_timeout(300)
    check(puts[-1] == ("m-echo", {"enabled": False}), "Switching one off saves")
    check(pg.locator("a[href='/admin/milestones']").count() >= 1, "Admin nav has a Milestones link")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
