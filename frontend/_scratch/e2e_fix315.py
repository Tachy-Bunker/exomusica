import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
NOW = time.time()
iso = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - ago))
BR = [{"id": 1, "slug": "hot", "name": "Hot", "lastActivityAt": iso(3600), "channel": None}, {"id": 2, "slug": "cold", "name": "Cold", "lastActivityAt": iso(90 * 86400), "channel": None}, {"id": 3, "slug": "none", "name": "None", "lastActivityAt": None, "channel": None}]
CH = [{"slug": "tw", "kind": "DISCUSSION", "lastMessageAt": int(NOW - 2 * 86400)}]
ALBUM = {"id": 1, "slug": "al1", "title": "First", "composer": "Ghost", "branch": {"name": "Full Branch", "slug": "full"}, "galleryImages": [], "collaborators": [], "links": [], "tracks": [{"id": 1, "source": "upload", "title": "t", "composer": "c", "durationSeconds": 60, "album": {"slug": "al1"}}]}
backreq = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(w=1280):
        ctx = browser.new_context(viewport={"width": w, "height": 700}, service_workers="block")
        ctx.add_init_script("if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/branches": return ok(BR)
            if key == "/api/channels": return ok(CH)
            if key == "/api/studies": return ok([])
            if key in ("/api/landmarks", "/api/field-log", "/api/chart", "/api/scans"): return ok([])
            if key == "/api/backlinks": backreq.append(path); return ok([{"type": "study", "slug": "s1", "title": "Beating", "href": "/study/s1"}])
            if key.startswith("/api/wiki/"): return ok({"error": "no"}, 404)
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    ADD = "()=>{const w=document.createElement('div');w.innerHTML='<a id=h href=\"/branch/hot\">h</a><a id=c href=\"/branch/cold\">c</a><a id=n href=\"/branch/none\">n</a><a id=t href=\"/topic/tw\">t</a><a id=o href=\"/about\">o</a><input id=in>';document.body.appendChild(w)}"
    p = mk(); p.goto(f"{BASE}/chart"); p.wait_for_selector("[data-testid=chart-page]"); p.evaluate(ADD)
    check(p.locator("[data-testid=lens-thermal]").count() == 0, "No lens chips while Probe is off")
    p.keyboard.press("i"); p.wait_for_selector("[data-testid=probe-hud]")
    check(p.locator(".lens-chips button").count() == 3 and p.get_attribute("[data-testid=lens-normal]", "aria-pressed") == "true", "Probe on: three lens chips, Normal pressed")
    p.keyboard.press("2"); p.wait_for_selector("a#h[data-heat]", timeout=4000)
    hs = p.evaluate("()=>['h','c','n','t','o'].map(i=>document.getElementById(i).dataset.heat??null)")
    check(hs == ["4", "0", None, "3", None], f"Thermal: hot 4, cold 0, unknown and unrelated untouched, topic 3 {hs}")
    col = p.evaluate("()=>[getComputedStyle(document.getElementById('h')).color,getComputedStyle(document.getElementById('c')).color]")
    check(col[0] != col[1], f"Hot and cold links look different {col}")
    check(p.locator("[data-testid=heat-legend]").count() == 1 and p.evaluate("()=>document.body.classList.contains('lens-thermal')"), "Legend shown, body class on")
    p.evaluate("()=>{const a=document.createElement('a');a.id='late';a.href='/branch/hot';a.textContent='late';document.body.appendChild(a)}")
    p.wait_for_function("()=>document.getElementById('late').dataset.heat==='4'", timeout=3000); check(True, "Links added later are tinted too")
    p.focus("#in"); p.keyboard.type("3"); check(p.evaluate("()=>document.body.classList.contains('lens-thermal')"), "Typing 3 in a text box does not switch lens")
    p.evaluate("()=>document.getElementById('in').blur()")
    p.keyboard.press("3"); p.wait_for_selector("[data-testid=xray-panel]")
    check(p.evaluate("()=>!document.body.classList.contains('lens-thermal') && document.body.classList.contains('lens-xray')") and p.evaluate("()=>document.querySelectorAll('[data-heat]').length") == 0, "X-ray replaces Thermal and clears the tints")
    check("Nothing to trace" in p.inner_text("[data-testid=xray-panel]"), "X-ray on /chart explains it can't trace that page")
    p.evaluate("()=>{window.history.pushState({}, '', '/wiki/missing'); window.dispatchEvent(new PopStateEvent('popstate'))}")
    p.wait_for_selector("[data-testid=xray-hit]", timeout=4000)
    check(p.inner_text("[data-testid=xray-hit]").lower().startswith("study") and backreq and "path=%2Fwiki%2Fmissing" in backreq[-1], f"X-ray on a page lists who links to it {backreq[-1:]}")
    p.evaluate("()=>{window.history.pushState({}, '', '/wiki/missing'); window.dispatchEvent(new PopStateEvent('popstate'))}"); n = len(backreq)
    p.keyboard.press("1"); p.keyboard.press("3"); p.wait_for_selector("[data-testid=xray-hit]"); check(len(backreq) == n, "Backlinks are cached per page")
    p.keyboard.press("Escape")
    p.wait_for_function("()=>!document.body.classList.contains('probe')")
    check(p.evaluate("()=>!document.body.classList.contains('lens-xray') && !document.body.classList.contains('lens-thermal')") and p.locator("[data-testid=xray-panel]").count() == 0, "Esc leaves Probe and clears every lens")
    p.keyboard.press("i"); p.wait_for_selector("[data-testid=probe-hud]")
    check(p.get_attribute("[data-testid=lens-normal]", "aria-pressed") == "true", "Probe starts back on Normal")
    p.keyboard.press("2"); p.click("[data-testid=probe-off]"); p.wait_for_timeout(300)
    check(p.evaluate("()=>document.querySelectorAll('[data-heat]').length") == 0 and p.evaluate("()=>!document.body.classList.contains('lens-thermal')"), "Off button clears Thermal")
    # classic mode: no lens at all
    p.evaluate("()=>localStorage.setItem('exomusica_classic','1')"); p.goto(f"{BASE}/chart"); p.wait_for_selector("[data-testid=chart-page]"); p.keyboard.press("i"); p.keyboard.press("2")
    check(p.locator("[data-testid=probe-hud]").count() == 0 and not p.evaluate("()=>document.body.classList.contains('lens-thermal')"), "Classic mode: no Probe, no lens")
    # phone
    m = mk(390); m.goto(f"{BASE}/chart"); m.wait_for_selector("[data-testid=chart-page]"); m.keyboard.press("i"); m.wait_for_selector("[data-testid=probe-hud]")
    m.click("[data-testid=lens-xray]"); m.wait_for_selector("[data-testid=xray-panel]")
    ov = m.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth")
    vis = m.evaluate("()=>{const r=document.querySelector('[data-testid=lens-xray]').getBoundingClientRect();return r.right<=window.innerWidth&&r.left>=0}")
    check(ov <= 0 and vis, f"Phone 390px: no sideways scroll, all chips reachable (overflow {ov}, visible {vis})")
    offv = m.evaluate("()=>{const r=document.querySelector('[data-testid=probe-off]').getBoundingClientRect();return r.right<=window.innerWidth&&r.left>=0}")
    check(offv, "Phone: the Off button is still on screen")
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
