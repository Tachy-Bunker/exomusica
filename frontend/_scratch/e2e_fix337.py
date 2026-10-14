import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def M(reached): return [{"key": "m-commons", "title": "Commons pack", "perk": "x", "metric": "COMMUNITYTRACKS", "label": "tracks", "target": 500, "now": 520 if reached else 10, "reached": reached, "reachedAt": None, "live": True}]
def run(playwright):
    browser = playwright.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(reached, user=ME, avail=12):
        st = {"info": 0, "build": 0, "ready": False, "building": False}
        ctx = browser.new_context(viewport={"width": 1100, "height": 800}, service_workers="block")
        init = "localStorage.setItem('exomusica_classic','0');"
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok(M(reached))
            if key == "/api/commons-pack": st["info"] += 1; return ok({"locked": False, "month": "2026-10", "available": avail, "ready": st["ready"], "building": st["building"], "bytes": 5242880 if st["ready"] else None})
            if key == "/api/commons-pack/build": st["build"] += 1; st["building"] = True; return ok({"building": True}, 202)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok([])
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, st, errs
    pg, st, errs = mk(False)
    pg.goto(f"{BASE}/soundbay"); pg.wait_for_selector("[data-testid=soundbay-page]"); pg.wait_for_timeout(600)
    check(pg.locator("[data-testid=commons-pack]").count() == 0 and st["info"] == 0, "Locked: no box, no request")
    pg, st, errs = mk(True)
    pg.goto(f"{BASE}/soundbay"); pg.wait_for_selector("[data-testid=commons-pack]")
    check("12 tracks" in pg.inner_text("[data-testid=commons-pack]") and "2026-10" in pg.inner_text("[data-testid=commons-pack]"), "Shows the month and how many tracks are shared")
    check(pg.locator("[data-testid=commons-download]").count() == 0 and pg.locator("[data-testid=commons-build]").count() == 1, "Not built yet: offers to build")
    pg.click("[data-testid=commons-build]"); pg.wait_for_selector("[data-testid=commons-building]")
    check(st["build"] == 1, "Building starts once on request")
    st["ready"] = True; st["building"] = False
    pg.wait_for_selector("[data-testid=commons-download]", timeout=9000)
    a = pg.locator("[data-testid=commons-download]")
    check(a.get_attribute("href") == "/api/commons-pack/download" and "5 MB" in a.inner_text(), "When ready: a plain download link with its size")
    check(not errs, f"No page errors {errs[:1]}")
    pg, st, errs = mk(True, user=None)
    pg.goto(f"{BASE}/soundbay"); pg.wait_for_selector("[data-testid=commons-pack]")
    check(pg.locator("[data-testid=commons-build]").count() == 0 and "Log in" in pg.inner_text("[data-testid=commons-pack]"), "A guest is asked to log in to build")
    pg, st, errs = mk(True, avail=0)
    pg.goto(f"{BASE}/soundbay"); pg.wait_for_selector("[data-testid=commons-pack]")
    check(pg.locator("[data-testid=commons-build]").count() == 0, "Nothing shared yet: no build button")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
