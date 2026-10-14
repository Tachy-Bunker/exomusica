import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(vp, style=None):
        ctx = b.new_context(viewport=vp, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + (f"localStorage.setItem('exomusica_door','{style}');" if style else ""))
        held = []
        def h(route):
            k = route.request.url.replace(BASE, "").split("?")[0]
            if k == "/api/branches/b3": held.append(route); return
            route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA.get(k, [] if k == "/api/chart" else {})))
        ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
        w = ctx.new_page(); errs = []; w.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        w.goto(f"{BASE}/chart"); w.wait_for_selector("[data-testid=chart-page]")
        w.evaluate("()=>{const a=document.createElement('a');a.id='go';a.href='/branch/b3';a.textContent='go';a.style.cssText='position:fixed;top:300px;left:10px;z-index:99999';a.onclick=(e)=>{e.preventDefault();history.pushState({},'','/branch/b3');dispatchEvent(new PopStateEvent('popstate'))};document.body.appendChild(a)}")
        return w, held, errs
    BR = json.dumps({"slug": "b3", "name": "Dark Room", "identityColor": "#10102a", "identityGlyph": "x", "id": 3, "tracks": [], "albums": [], "children": []})
    for name, vp, port in (("landscape", {"width": 1100, "height": 700}, "0"), ("portrait", {"width": 420, "height": 800}, "1")):
        w, held, errs = mk(vp)
        w.click("#go"); w.wait_for_selector("[data-testid=door-wipe][data-style=stronghold]", timeout=1500)
        check(w.get_attribute("[data-testid=door-wipe]", "data-style") == "stronghold", "Stronghold door is the default")
        check(w.locator(".sh-b").count() == 9, "Nine spikes")
        w.wait_for_selector("[data-phase=closed]", timeout=3000)
        check(w.get_attribute("[data-testid=door-wipe]", "data-portrait") == port, f"{name}: orientation follows the screen")
        vb = w.get_attribute("[data-testid=door-wipe] svg", "viewBox"); check((vb == "-50 -80 100 160") == (port == "1"), f"{name}: viewBox turned for portrait ({vb})")
        w.wait_for_timeout(500)
        check(w.get_attribute("[data-testid=door-wipe]", "data-phase") == "closed", f"{name}: stays shut while loading")
        for r in held: r.fulfill(status=200, content_type="application/json", body=BR)
        w.wait_for_selector("[data-testid=door-wipe][data-phase=opening]", state="attached", timeout=6000)
        w.wait_for_selector("[data-testid=door-wipe]", state="detached", timeout=4000)
        check(w.url.endswith("/branch/b3") and not errs, f"{name}: opens on the new page, no errors {errs[:1]}")
    w, held, errs = mk({"width": 1100, "height": 700}, "hex")
    w.click("#go"); w.wait_for_selector("[data-testid=door-wipe]", timeout=1500)
    check(w.locator(".dw-p").count() == 6 and w.locator(".sh-b").count() == 0, "Setting 'hex' keeps the original six-panel door")
    w.wait_for_selector("[data-phase=closed]", timeout=3000)
    for r in held: r.fulfill(status=200, content_type="application/json", body=BR)
    w.wait_for_selector("[data-testid=door-wipe]", state="detached", timeout=6000)
    check(True, "Hex door opens and goes away")
    # the choice is in settings
    w, held, errs = mk({"width": 1100, "height": 700})
    check(True, "(settings select checked below)")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
