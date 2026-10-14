import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
BODY = "See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo) and [branch](%s/branch/b2) and [wiki](%s/wiki/intro)." % ((BASE,) * 5)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 760}, has_touch=True, is_mobile=True)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_classic','0');")
    def handle(route):
        path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda x, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(x))
        if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
        if key == "/api/studies/mine-1": return ok(STUDY)
        if key.endswith("/spectrogram"): return ok({"error": "no"}, 501)
        if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart", "/api/studies/mine-1/citations"): return ok([])
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    p = ctx.new_page(); p.on("pageerror", lambda e: print("PAGEERROR", str(e)[:150]))
    p.goto(f"{BASE}/study/mine-1"); p.wait_for_selector("h1"); p.wait_for_timeout(800)
    def scan(label, rootsel):
        r = p.evaluate("""(sel)=>{const W=window.innerWidth;const root=document.querySelector(sel);const pl=document.querySelector('.player-bar-wrapper');const pt=pl&&getComputedStyle(pl).display!=='none'?pl.getBoundingClientRect().top:null;if(!root)return null;const rr=root.getBoundingClientRect();const sc=[];root.querySelectorAll('*').forEach(e=>{if(e.scrollWidth>e.clientWidth+1&&['auto','scroll'].includes(getComputedStyle(e).overflowX))sc.push((e.className||e.tagName)+':'+(e.scrollWidth-e.clientWidth))});return {l:Math.round(rr.left),r:Math.round(rr.right),t:Math.round(rr.top),b:Math.round(rr.bottom),playerTop:pt?Math.round(pt):null,docOverflow:document.documentElement.scrollWidth-W,hscroll:sc.slice(0,6)}}""", rootsel)
        print(label, r); p.screenshot(path=f"/tmp/s_{label}.png")
    p.tap("[data-testid=fp-around]"); p.wait_for_timeout(500); scan("around", "[data-testid=around-sheet]")
    for i in range(3):
        try: p.locator("[data-testid=around-sheet] .plate-take").nth(i).tap(timeout=1500)
        except Exception: break
    p.tap("[data-testid=fp-panel-close]"); p.wait_for_timeout(300)
    p.tap("button:has-text('Pocket')"); p.wait_for_timeout(500); scan("pocket", ".fp-panel, .pocket-sheet")
    p.tap("[data-testid=fp-panel-close]") if p.locator("[data-testid=fp-panel-close]").count() else p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.tap("[data-testid=fp-terminal]"); p.wait_for_timeout(500); scan("terminal", ".term")
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.tap("[data-testid=fp-lens]"); p.wait_for_timeout(400); scan("probe", "[data-testid=probe-hud]")
with sync_playwright() as pw: run(pw)
