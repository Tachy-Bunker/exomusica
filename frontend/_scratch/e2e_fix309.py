import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


import time
NOW = int(time.time())
CH = [{"slug": "old", "name": "Old Thread", "description": None, "category": None, "contentMarkdown": None, "lastMessageAt": NOW - 100 * 86400},
      {"slug": "fresh", "name": "Fresh Thread", "description": None, "category": None, "contentMarkdown": None, "lastMessageAt": NOW - 3 * 86400},
      {"slug": "revisited", "name": "Revisited Thread", "description": None, "category": None, "contentMarkdown": None, "lastMessageAt": NOW - 200 * 86400},
      {"slug": "empty", "name": "Empty Thread", "description": None, "category": None, "contentMarkdown": None, "lastMessageAt": None}]
held = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        for k, v in (seed or {}).items(): init += f"if(localStorage.getItem({json.dumps(k)})===null)localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
        init += "if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/field-log":
                held.append(route); return
            if key == "/api/channels": return ok(CH)
            if key == "/api/branches" or key.startswith("/api/channels/"): return ok([])
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    v = lambda pg, n: pg.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('{n}').trim()")
    p = mk(ME)
    p.goto(f"{BASE}/account"); p.wait_for_selector("[data-testid=skin-select]")
    check(v(p, "--bg") == "#0a0e1c" and p.evaluate("document.documentElement.dataset.skin") is None, "Default: no palette overrides")
    p.select_option("[data-testid=skin-select]", "chozo")
    check(v(p, "--bg") == "#17120a" and p.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(23, 18, 10)", "Chozo: warm palette applied to the page")
    p.reload(); p.wait_for_selector("[data-testid=skin-select]")
    check(p.evaluate("document.documentElement.dataset.skin") == "chozo" and p.input_value("[data-testid=skin-select]") == "chozo", "Chozo: remembered after reload")
    p.select_option("[data-testid=skin-select]", "phazon")
    check(v(p, "--accent-forum") == "#19e0c8" and v(p, "--radius") == "2px", "Phazon: cold teal and sharp corners")
    p.select_option("[data-testid=skin-select]", "")
    check(v(p, "--bg") == "#0a0e1c" and v(p, "--radius") == "10px" and p.evaluate("document.documentElement.style.getPropertyValue('--bg') + document.documentElement.style.getPropertyValue('--radius')") == "", "Back to default: nothing left behind")

    # visor frame
    cont = lambda pg: pg.evaluate("getComputedStyle(document.body,'::after').content")
    check(cont(p) in ("none", "normal"), "Visor frame: off by default")
    p.check("[data-testid=hud-toggle]")
    check(p.evaluate("document.documentElement.classList.contains('hud')") and cont(p) == '""', "Visor frame: scanline layer on")
    check(p.evaluate("getComputedStyle(document.body,'::after').pointerEvents") == "none", "Visor frame: never intercepts clicks")
    p.check("[data-testid=classic-toggle]")
    check(cont(p) in ("none", "normal"), "Visor frame: classic mode turns it off")

    # fog loading
    f = mk(ME)
    f.goto(f"{BASE}/field-log"); f.wait_for_selector(".fog-load")
    check(f.evaluate("getComputedStyle(document.querySelector('.fog-load'),'::after').animationName") == "fog-wipe", "Loading: condensation wipe runs")
    check(f.locator(".fog-load[role=status]").count() == 1, "Loading: announced to screen readers")
    fc = mk(ME, {"exomusica_classic": "1"})
    fc.goto(f"{BASE}/field-log"); fc.wait_for_selector(".fog-load")
    check(fc.evaluate("getComputedStyle(document.querySelector('.fog-load'),'::after').animationName") == "none", "Loading: still in classic mode")

    # forgotten threads
    t = mk(ME, {"exomusica_thread_visits": json.dumps({"revisited": NOW - 2 * 86400})})
    t.goto(f"{BASE}/discussion"); t.wait_for_selector(".forums-columns li:has-text('Old Thread')")
    cls = lambda name: t.locator(f".forums-columns li:has-text('{name}')").first.get_attribute("class") or ""
    check("forgotten" in cls("Old Thread"), "Forgotten: quiet 100 days, never visited")
    check("forgotten" not in cls("Fresh Thread") and "forgotten" not in cls("Empty Thread"), "Not forgotten: recent, or no messages yet")
    check("forgotten" not in cls("Revisited Thread"), "Not forgotten: old, but you visited lately")
    t.click("a:text-is('Old Thread')"); t.wait_for_timeout(1000)
    vis = t.evaluate("localStorage.getItem('exomusica_thread_visits')")
    check(vis and "old" in json.loads(vis), f"Opening it records the visit {vis}")
    t2 = mk(ME, {"exomusica_thread_visits": vis})
    t2.goto(f"{BASE}/discussion"); t2.wait_for_selector(".forums-columns li:has-text('Old Thread')")
    check("forgotten" not in (t2.locator(".forums-columns li:has-text('Old Thread')").first.get_attribute("class") or ""), "Visiting clears it")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
