import json, re, sys, os
from playwright.sync_api import sync_playwright

src = open(__file__.replace("e2e_fix282.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

BAL = {"v": 12}
CLAIMS = []
REWARDS = [
  {"id": 1, "title": "Locked kit", "description": "Unlocks the kit", "cost": 20, "stock": 3, "perUser": 1, "itemId": 8, "itemTitle": "Locked kit", "mine": 0},
  {"id": 2, "title": "Name in credits", "description": "A line in the next release", "cost": 5, "stock": None, "perUser": 1, "itemId": None, "itemTitle": None, "mine": 0},
]
ADM_REWARDS = [dict(r, active=True, claimCount=0) for r in REWARDS]
LOCKED = {"id": 8, "title": "Locked kit", "description": "d", "tags": [], "kind": "AUDIO", "fileUrl": None, "filename": "kit.wav", "owner": "ghost9", "paid": True, "locked": True, "price": "5 USD", "payNote": None, "paypalUrl": None,
          "previewUrl": "https://example.org/prev.mp3", "pointsReward": {"id": 1, "cost": 20, "stock": 3}}
OWN = dict(LOCKED, id=9, title="My kit", owner="tachy", pointsReward=None, previewUrl=None, gallery=["/uploads/a.png"])
DATA["/api/sample-bank"] = DATA["/api/sample-bank"] + [LOCKED, OWN]
DATA["/api/rewards"] = REWARDS
DATA["/api/admin/rewards"] = ADM_REWARDS
DATA["/api/admin/reward-claims"] = [{"id": 5, "username": "ghost9", "title": "Name in credits", "cost": 5, "status": "pending", "note": None, "createdAt": "2026-10-01T00:00:00Z"}]
DATA["/api/admin/resources"] = [{"id": 8, "title": "Locked kit", "paid": True}]

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(cond, msg):
        results.append((bool(cond), msg)); print(("ok   " if cond else "FAIL ") + msg)
    posts = []
    def new_ctx(user=None, viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user or ME))});")
        def handle(route):
            req = route.request
            path = req.url.replace(BASE, "")
            key = path.split("?")[0]
            if key == "/api/account/points":
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"balance": BAL["v"], "entries": [{"id": 1, "points": 12, "reason": "Accepted submission", "createdAt": "2026-10-01T00:00:00Z"}], "claims": CLAIMS}))
            m = re.match(r"/api/rewards/(\d+)/claim", key)
            if m and req.method == "POST":
                rid = int(m.group(1)); r = next(x for x in REWARDS if x["id"] == rid)
                posts.append(rid)
                if BAL["v"] < r["cost"]: return route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": "Not enough points"}))
                BAL["v"] -= r["cost"]
                if r["itemId"]: return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "balance": BAL["v"], "opened": True, "itemId": 8, "fileUrl": "/uploads/rain.wav", "filename": "kit.wav"}))
                CLAIMS.append({"id": 1, "title": r["title"], "itemId": None, "cost": r["cost"], "status": "pending", "note": None, "createdAt": "2026-10-08T00:00:00Z"})
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "balance": BAL["v"], "opened": False, "itemId": None}))
            if req.method != "GET" and path.startswith("/api/admin/"):
                posts.append(path); return route.fulfill(status=200, content_type="application/json", body="{}")
            if path in DATA: return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[path]))
            if key in DATA: return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[key]))
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return route.fulfill(status=200, content_type="application/json", body="{}")
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(page): page.on("pageerror", lambda e: (errors.append(page.url + " " + str(e)), print("PAGEERROR", str(e)[:200])))

    # Resources: locked item with preview + points
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/xenolab?tab=resources"); page.wait_for_selector("#resource-8 [data-testid=res-unlock]")
    c8 = page.locator("#resource-8")
    check(c8.locator("[data-testid=sample-play]").count() == 1, "Preview: a locked item shows its Play button")
    check(c8.locator("a[download]").count() == 0, "Preview: still no download while locked")
    sp = c8.locator("[data-testid=res-spend]")
    check(sp.inner_text() == "Unlock with 20 points" and sp.is_disabled(), "Points: button disabled when short")
    check("8 more to go" in c8.locator("[data-testid=res-points]").inner_text(), "Points: says how many more are needed")
    check(c8.locator("[data-testid=preview-editor]").count() == 0, "Preview editor: not shown to a non-owner")
    BAL["v"] = 25; page.reload(); page.wait_for_selector("#resource-8 [data-testid=res-spend]")
    check(not page.locator("#resource-8 [data-testid=res-spend]").is_disabled(), "Points: enabled with enough")
    page.click("#resource-8 [data-testid=res-spend]"); page.wait_for_timeout(500)
    check(posts == [1] and page.locator("#resource-8 a[download]").count() == 1 and page.locator("#resource-8 [data-testid=res-unlock]").count() == 0, "Points: spending unlocks the file")
    # owner
    o = page.locator("#resource-9")
    check(o.locator("[data-testid=preview-editor]").count() == 1, "Preview editor: shown to the owner")
    o.locator("[data-testid=preview-editor] summary, [data-testid=preview-editor] button").first.click(force=True)
    check(page.locator("#resource-9 [data-testid=preview-file]").count() == 1 and page.locator("#resource-9 [data-testid=preview-link]").count() == 1, "Preview editor: file and link inputs")
    ctx.close()

    # Rewards page
    BAL["v"] = 12; posts.clear()
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/rewards"); page.wait_for_selector("[data-testid=reward]")
    check("12" in page.locator("[data-testid=points-balance]").inner_text(), "Rewards: shows the balance")
    check(page.locator("[data-testid=reward]").count() == 2, "Rewards: lists both")
    cl = page.locator("[data-testid=claim]")
    check(cl.nth(0).is_disabled() and not cl.nth(1).is_disabled(), "Rewards: the too-expensive one is disabled")
    check(page.locator("[data-testid=ledger]").count() == 1, "Rewards: ledger shown")
    cl.nth(1).click(); page.wait_for_selector("[data-testid=claims]")
    check(posts == [2] and "7" in page.locator("[data-testid=points-balance]").inner_text(), "Rewards: claiming spends and refreshes")
    check("waiting" in page.locator("[data-testid=claims]").inner_text(), "Rewards: the claim shows as waiting")
    for vp in [{"width": 375, "height": 800}]:
        page.set_viewport_size(vp); page.wait_for_timeout(300)
        over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(over <= 1, f"Rewards: no overflow on a phone ({over}px)")
    ctx.close()

    # Admin
    ctx = new_ctx(user=ADMIN); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/admin/rewards"); page.wait_for_selector("[data-testid=rewards-admin]")
    page.wait_for_selector("[data-testid=reward-admin]")
    check(page.locator("[data-testid=reward-admin]").count() == 2, "Admin: lists rewards")
    check(page.locator("[data-testid=reward-form]").count() == 1 and page.locator("[data-testid=claims-queue] li").count() == 1, "Admin: form and claims queue")
    check(page.locator("a[href='/admin/rewards']").count() >= 1, "Admin: nav link")
    # terminal
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=faceplate]")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("admin rewards"); page.keyboard.press("Enter"); page.wait_for_url("**/admin/rewards")
    check(True, "Terminal: admin rewards")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("go rewards"); page.keyboard.press("Enter"); page.wait_for_url("**/rewards")
    check(True, "Terminal: go rewards")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p:
    run(p)
