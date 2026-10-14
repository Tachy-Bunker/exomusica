import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix292.py").read()
__file__ = D + "/e2e_fix292.py"; exec(src.split("\ndef run(playwright):")[0].split("\ndef run(pw")[0])
def run(pw):
    browser = pw.chromium.launch()
    for W in (390, 340):
        ctx = browser.new_context(viewport={"width": W, "height": 760}, has_touch=True, is_mobile=True)
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_classic','0'); if (!sessionStorage.getItem('exomusica_trail_v1')) sessionStorage.setItem('exomusica_trail_v1', {json.dumps(json.dumps(TRAIL))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if path.startswith("/api/atlas/around"):
                k = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":"); a = AROUND.get(k)
                return ok(a or {"error": "nf"}, 200 if a else 404)
            if path.startswith("/api/atlas/trace"): return route.fulfill(status=204, body="")
            if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        p = ctx.new_page(); p.on("pageerror", lambda e: print("PAGEERROR", str(e)[:150]))
        p.goto(f"{BASE}/study/mine-1"); p.wait_for_selector("[data-testid=faceplate]"); p.wait_for_timeout(500)
        def scan(label, rootsel):
            r = p.evaluate("""(sel)=>{const W=window.innerWidth;const root=document.querySelector(sel);if(!root)return null;const rr=root.getBoundingClientRect();const sc=[];root.querySelectorAll('*').forEach(e=>{if(e.scrollWidth>e.clientWidth+1&&['auto','scroll'].includes(getComputedStyle(e).overflowX))sc.push((e.className||e.tagName)+':'+(e.scrollWidth-e.clientWidth))});const wide=[];root.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>W+1)wide.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+':'+Math.round(r.right))});return {l:Math.round(rr.left),r:Math.round(rr.right),b:Math.round(rr.bottom),doc:document.documentElement.scrollWidth-W,hscroll:sc.slice(0,5),wide:wide.slice(0,5)}}""", rootsel)
            print(W, label, r); p.screenshot(path=f"/tmp/s{W}_{label}.png")
        p.tap("[data-testid=fp-around]"); p.wait_for_timeout(500); scan("around", "[data-testid=around-sheet]")
        p.tap("[data-testid=fp-panel-close]"); p.wait_for_timeout(300)
        p.tap("button:has-text('Pocket')"); p.wait_for_timeout(500); scan("pocket", ".fp-panel")
        p.tap("[data-testid=fp-panel-close]") if p.locator("[data-testid=fp-panel-close]").count() else p.keyboard.press("Escape"); p.wait_for_timeout(300)
        p.tap("[data-testid=fp-terminal]"); p.wait_for_timeout(500); scan("terminal", ".term")
        p.keyboard.press("Escape"); p.wait_for_timeout(300)
        p.tap("[data-testid=fp-lens]"); p.wait_for_timeout(400); scan("probe", "[data-testid=probe-hud]")
with sync_playwright() as pw: run(pw)
