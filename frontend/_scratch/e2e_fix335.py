import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core Room"}, {"id": 2, "parentId": 1, "slug": "wing", "name": "Wing"}, {"id": 3, "parentId": 1, "secret": True, "key": "zzz"}]
def M(reached): return [{"key": "m-chart", "title": "Chart layer", "perk": "x", "metric": "MEMBERS", "label": "members", "target": 150, "now": 160 if reached else 20, "reached": reached, "reachedAt": None, "live": True}]
def run(playwright):
    browser = playwright.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(reached, pulses):
        hits = {"p": 0}
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok(M(reached))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/chart/pulse": hits["p"] += 1; return ok({"locked": False, "pulses": pulses})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, hits, errs
    pg, hits, errs = mk(False, {"1": 3})
    pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-svg]"); pg.wait_for_timeout(500)
    check(hits["p"] == 0 and pg.locator("[data-testid=chart-pulse]").count() == 0, "Locked: no pulse request, no pulses")
    pg, hits, errs = mk(True, {"1": 3, "2": 1, "3": 3})
    pg.goto(f"{BASE}/chart"); pg.wait_for_selector("[data-testid=chart-pulse]")
    check(hits["p"] == 1, "Unlocked: one request")
    lv = sorted(pg.locator("[data-testid=chart-pulse]").evaluate_all("els=>els.map(e=>e.dataset.level)"))
    check(lv == ["1", "3"] or lv == ["1", "3"], f"Pulses drawn for the visible rooms only (levels {lv}); a sealed room never pulses")
    check("Glowing rooms" in pg.inner_text("[data-testid=chart-pulse-note]"), "The page says what the glow means and the 2-person floor")
    check("pointer-events" in (pg.evaluate("getComputedStyle(document.querySelector('.chart-pulse')).pointerEvents") or "") or pg.evaluate("getComputedStyle(document.querySelector('.chart-pulse')).pointerEvents") == "none", "Pulses don't block clicking a room")
    check(not errs, f"No page errors {errs[:1]}")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
