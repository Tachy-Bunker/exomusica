import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

patched = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, settings_extra=None):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/site-settings": return ok({**DATA["/api/site-settings"], **(settings_extra or {})})
            if key == "/api/admin/site-settings" and req.method == "PATCH": patched.append(json.loads(req.post_data)); return ok({})
            if key == "/api/landmarks": return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    col = lambda pg, sel, prop="borderTopColor": pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).{prop}")

    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/admin/visor"); admin.wait_for_selector("[data-testid=visor-preview]")
    check(col(admin, ".visor-preview .visor-hud") == "rgb(94, 242, 208)", f"Preview: starts in the default cyan ({col(admin, '.visor-preview .visor-hud')})")
    check(admin.locator("[data-testid=visor-save]").is_disabled(), "Save: off until something changes")
    admin.click("[data-testid=visor-presets] button:has-text('Combat red')")
    check(col(admin, ".visor-preview .visor-hud") == "rgb(255, 90, 77)", "Preview: a preset repaints the real visor at once")
    check(admin.evaluate("getComputedStyle(document.querySelector('.visor-preview .visor-beacon.mine .visor-dot'), '::before').borderTopColor") == "rgb(255, 211, 107)", "Preview: your own notes take the second colour")
    admin.fill("[data-testid=visor-main]", "#202020")
    check(admin.locator("[data-testid=visor-weak]").count() == 1, "Preview: a colour too dark to read is flagged")
    admin.fill("[data-testid=visor-main]", "#ff5a4d")
    check(admin.locator("[data-testid=visor-weak]").count() == 0, "Preview: and the flag goes when it is fixed")
    admin.click("[data-testid=visor-save]"); admin.wait_for_timeout(300)
    check(patched and patched[-1] == {"visorColor": "#ff5a4d", "visorMineColor": "#ffd36b"}, f"Save: sends both colours {patched[-1:]}")
    check(admin.evaluate("document.documentElement.style.getPropertyValue('--visor')") == "#ff5a4d", "Save: applies without a reload")
    admin.click("text=Reset to default"); admin.click("[data-testid=visor-save]"); admin.wait_for_timeout(300)
    check(patched[-1] == {"visorColor": None, "visorMineColor": None}, f"Reset: stores nothing, so the default stays the default {patched[-1]}")

    # the real visor in the site wears the saved colour
    page = mk(ME, {"visorColor": "#ff5a4d", "visorMineColor": "#ffd36b"})
    page.goto(f"{BASE}/"); page.evaluate("localStorage.setItem('exomusica_lens','1')"); page.goto(f"{BASE}/study/mine-1")
    page.wait_for_selector(".visor-hud")
    check(col(page, ".visor-hud") == "rgb(255, 90, 77)", f"Site: the live visor uses the saved colour ({col(page, '.visor-hud')})")
    plain = mk(ME)
    plain.goto(f"{BASE}/"); plain.evaluate("localStorage.setItem('exomusica_lens','1')"); plain.goto(f"{BASE}/study/mine-1"); plain.wait_for_selector(".visor-hud")
    check(col(plain, ".visor-hud") == "rgb(94, 242, 208)", "Site: with nothing chosen it stays cyan")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
