import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    ctx = b.new_context(viewport={"width": 1100, "height": 700}, service_workers="block")
    ctx.add_init_script("localStorage.setItem('exomusica_classic','0');window.__starts=0;const S=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(){window.__starts++;return S.apply(this,arguments)};")
    def h(route):
        path = route.request.url.replace(BASE, ""); k = path.split("?")[0]
        ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
        if k == "/uploads/click.wav": return route.fulfill(status=200, content_type="audio/wav", body=open(WAV, "rb").read())
        if k == "/api/site-settings": return ok({"defaultFont": None, "ambienceUrl": None, "faviconUrl": None, "linkClickSfxUrl": "/uploads/click.wav", "chatSplashMessages": []})
        if k in DATA: return ok(DATA[k])
        return ok([] if k == "/api/chart" else {})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
    w = ctx.new_page(); errs = []; w.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
    w.goto(f"{BASE}/chart"); w.wait_for_selector("[data-testid=chart-page]"); w.wait_for_timeout(800)
    w.evaluate("()=>{const a=document.createElement('a');a.id='go';a.href='/field-log';a.textContent='go';a.style.cssText='position:fixed;top:400px;left:10px;z-index:99999';a.onclick=(e)=>{e.preventDefault();history.pushState({},'','/field-log');dispatchEvent(new PopStateEvent('popstate'))};document.body.appendChild(a)}")
    n0 = w.evaluate("window.__starts")
    w.click("#go")
    w.wait_for_selector("[data-testid=door-wipe]", timeout=1500)
    w.wait_for_selector("[data-testid=door-wipe]", state="detached", timeout=6000); w.wait_for_timeout(600)
    n1 = w.evaluate("window.__starts") - n0
    check(n1 == 1, f"One click, one sound, even though the door replays the click ({n1})")
    check(w.url.endswith("/field-log"), "…and the link still went through")
    check(not errs, f"No page errors {errs[:1]}")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
