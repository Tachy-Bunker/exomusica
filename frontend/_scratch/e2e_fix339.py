import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def M(): return [{"key": "m-jingle", "title": "Collective jingle", "perk": "x", "metric": "TRACKS", "label": "tracks", "target": 150, "now": 160, "reached": True, "reachedAt": None, "live": True}]
def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(on, ready, adm_urls=None):
        st = {"seed": 0, "posts": []}
        ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
        init = "localStorage.setItem('exomusica_classic','0');window.__osc=0;const o=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(){window.__osc++;return o.apply(this,arguments)};"
        if on: init += "localStorage.setItem('exomusica_jingles','1');"
        init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok(M())
            if key == "/api/site-settings": return ok({"jingleUrls": adm_urls})
            if key == "/api/collective-jingle":
                st["seed"] += 1
                return ok({"locked": False, "ready": True, "notes": [130.81, 196, 261.6, 311, 392, 523, 130.81, 196], "credits": [{"title": "a", "by": "neo"}, {"title": "b", "by": "ghost"}]} if ready else {"locked": False, "ready": False})
            if key == "/api/account/jingles-done":
                if req.method == "POST": st["posts"].append(json.loads(req.post_data)["event"]); return ok({"done": st["posts"]})
                return ok({"done": []})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or "volume" in str(e) or errs.append(str(e)))
        return pg, st, errs
    fire = lambda pg, ev: pg.evaluate("(e) => window.dispatchEvent(new CustomEvent('exo:jingle', {detail: e}))", ev)
    pg, st, errs = mk(False, True); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1000); fire(pg, "firstScan"); pg.wait_for_timeout(500)
    check(st["seed"] == 0 and pg.evaluate("window.__osc") == 0, "Pickup sounds off: nothing requested, nothing played")
    pg, st, errs = mk(True, False); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1000); fire(pg, "firstScan"); pg.wait_for_timeout(500)
    check(st["seed"] == 1 and pg.evaluate("window.__osc") == 0 and st["posts"] == [], "Motif not drawn yet: silence, and the moment is not used up")
    pg, st, errs = mk(True, True); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1000); fire(pg, "firstScan"); pg.wait_for_timeout(900)
    check(pg.evaluate("window.__osc") == 8 and st["posts"] == ["firstScan"], f"Plays the 8-note motif once and reports it ({pg.evaluate('window.__osc')} notes)")
    fire(pg, "firstScan"); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__osc") == 8 and st["seed"] == 1, "Only once per moment; the seed was asked for once")
    fire(pg, "firstListen"); pg.wait_for_timeout(700)
    check(pg.evaluate("window.__osc") == 16 and st["seed"] == 1, "Another moment plays it again from the same seed")
    pg, st, errs = mk(True, True, {"firstScan": "/uploads/x.wav"}); pg.goto(f"{BASE}/"); pg.wait_for_timeout(1000); fire(pg, "firstListen"); pg.wait_for_timeout(700)
    check(pg.evaluate("window.__osc") == 8, "A moment with no admin recording still gets the motif; one with a recording keeps its recording")
    pg, st, errs = mk(True, True); pg.goto(f"{BASE}/account"); pg.wait_for_selector("[data-testid=jingle-collective]"); pg.wait_for_timeout(500)
    check("neo, ghost" in pg.inner_text("[data-testid=jingle-collective]"), "Settings credit whose tracks the motif was read from")
    check(not errs, f"No page errors {errs[:1]}")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
