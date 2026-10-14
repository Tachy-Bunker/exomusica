import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def M(reached): return [{"key": "m-founders", "title": "Founders' door", "perk": "x", "metric": "MEMBERS", "label": "members", "target": 50, "now": 60 if reached else 10, "reached": reached, "reachedAt": None, "live": True}]
ENT = [{"id": i, "at": 1500000000 + i * 86400, "author": f"ghost{i}", "channel": "general", "text": f"line {i}"} for i in range(1, 13)]
def run(playwright):
    browser = playwright.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(reached):
        hits = {"v": 0}
        ctx = browser.new_context(viewport={"width": 1100, "height": 800}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok(M(reached))
            if key == "/api/vault": hits["v"] += 1; return ok({"locked": not reached, "entries": ENT if reached else []})
            if key == "/api/field-log": return ok([{"id": "ancients", "title": "Ancients", "entries": []}])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, hits, errs
    pg, hits, errs = mk(False)
    pg.goto(f"{BASE}/vault"); pg.wait_for_selector("[data-testid=vault-locked]")
    check(pg.locator("[data-testid=vault-line]").count() == 0, "Locked: a closed door, no lines")
    pg, hits, errs = mk(True)
    pg.goto(f"{BASE}/vault"); pg.wait_for_selector("[data-testid=vault-page]")
    check(pg.locator("[data-testid=vault-line]").count() == 1 and "line 1" in pg.inner_text("[data-testid=vault-lines]"), "Starts at the first line")
    pg.click("[data-testid=vault-next]"); pg.click("[data-testid=vault-next]")
    check(pg.locator("[data-testid=vault-line]").count() == 3 and "3/12" in pg.inner_text("[data-testid=vault-when]"), "Next reveals lines in order")
    pg.fill("[data-testid=vault-scrub]", "11") if False else pg.evaluate("(()=>{const r=document.querySelector('[data-testid=vault-scrub]');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(r,'11');r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))})()")
    pg.wait_for_timeout(200)
    check("12/12" in pg.inner_text("[data-testid=vault-when]") and pg.locator("[data-testid=vault-line]").count() == 10, "The scrubber jumps; only the last 10 lines are in the page")
    check(pg.get_attribute("[data-testid=vault-next]", "disabled") is not None, "Next is off at the end")
    pg.click("[data-testid=vault-play]"); pg.wait_for_timeout(300)
    check("1/12" in pg.inner_text("[data-testid=vault-when]"), "Play at the end starts over")
    pg.wait_for_timeout(2900)
    check("2/12" in pg.inner_text("[data-testid=vault-when]"), "…and steps on its own")
    pg.click("[data-testid=vault-play]"); a = pg.inner_text("[data-testid=vault-when]"); pg.wait_for_timeout(2900)
    check(pg.inner_text("[data-testid=vault-when]") == a, "Pause stops it")
    check(hits["v"] == 1, "One request in total")
    check(not errs, f"No page errors {errs[:1]}")
    pg.goto(f"{BASE}/field-log"); pg.wait_for_selector("[data-testid=vault-link]")
    check(pg.locator("[data-testid=vault-link]").count() == 1, "Field Log's Ancients section links to the vault once it's open")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
