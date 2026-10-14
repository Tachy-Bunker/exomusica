import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_classic','0');")
    def handle(route):
        path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda x, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(x))
        if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
        if key.endswith("/spectrogram"): return ok({"error": "no"}, 501)
        if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart"): return ok([])
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    p = ctx.new_page(); p.on("pageerror", lambda e: print("PAGEERROR", str(e)[:150]))
    def m(label):
        r = p.evaluate("""()=>{const W=window.innerWidth;const wide=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&r.right>W+1&&getComputedStyle(e).position!=='static'||r.width>0&&r.right>W+1&&e.closest('.probe-ui,.term,.pocket-pad,.around,.fp-bar,.faceplate'))wide.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+':'+Math.round(r.right))});return {sw:document.documentElement.scrollWidth,W,bw:document.body.scrollWidth,wide:wide.slice(0,6)}}""")
        print(label, "overflow", r["sw"] - r["W"], "body", r["bw"] - r["W"], r["wide"])
    p.goto(f"{BASE}/soundbay?sort=az&show=all"); p.wait_for_selector("[data-testid=branch-row]"); p.wait_for_timeout(300)
    m("soundbay, no player")
    p.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").tap(force=True); p.wait_for_selector(".player-bar-wrapper", state="visible", timeout=8000); p.wait_for_timeout(500)
    m("soundbay + player")
    def geo(label, sel):
        r = p.evaluate("""(sel)=>{const W=window.innerWidth,H=window.innerHeight;const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();const pl=document.querySelector('.player-bar-wrapper');const pr=pl&&getComputedStyle(pl).display!=='none'?pl.getBoundingClientRect():null;return {l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),W,H,playerTop:pr?Math.round(pr.top):null,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,sx:e.scrollWidth-e.clientWidth}}""", sel)
        print(label, r)
    p.screenshot(path="/tmp/m0.png")
    p.tap("[data-testid=fp-terminal]") if p.locator("[data-testid=fp-terminal]").count() else None
    p.wait_for_timeout(500); geo("terminal", ".term"); p.screenshot(path="/tmp/m3.png")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    if p.locator("[data-testid=fp-around]:not([disabled])").count():
        p.tap("[data-testid=fp-around]"); p.wait_for_timeout(500); geo("around", "[data-testid=around-sheet]"); p.screenshot(path="/tmp/m4.png"); p.keyboard.press("Escape")
    else: print("around disabled here")
    p.tap("button:has-text('Pocket')"); p.wait_for_timeout(500); geo("pocket", ".pocket-pad, [data-testid=pocket-sheet], .fp-panel"); p.screenshot(path="/tmp/m2.png")
    p.keyboard.press("Escape"); p.wait_for_timeout(200)
    p.tap("[data-testid=fp-lens]"); p.wait_for_timeout(500); geo("probe hud", "[data-testid=probe-hud]"); p.screenshot(path="/tmp/m5.png")
with sync_playwright() as pw: run(pw)
