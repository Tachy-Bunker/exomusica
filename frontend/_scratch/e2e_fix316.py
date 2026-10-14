import json, re, sys
from playwright.sync_api import sync_playwright
D = __file__.rsplit("/", 1)[0]
src = open(D + "/e2e_fix277.py").read()
exec(src.split("def run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(prefs=""):
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx.add_init_script("if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');" + prefs)
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.startswith("/uploads/") and key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
            if key.endswith("/spectrogram"): return ok({"error": "no"}, 501)
            if key in ("/api/landmarks", "/api/field-log", "/api/scans"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    def play(pg):
        pg.goto(f"{BASE}/soundbay?sort=az"); pg.wait_for_selector("[data-testid=branch-row]")
        pg.click("[data-testid=sb-filter-all]"); pg.wait_for_timeout(200)
        pg.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").click(force=True)
        pg.wait_for_selector(".player-seek-track", state="attached", timeout=10000)
    p = mk(); play(p)
    try:
        p.wait_for_selector("[data-testid=echo-ring]", state="attached", timeout=7000); got = True
    except Exception: got = False
    check(got, "Echo: rings appear while a track with hits plays")
    p.screenshot(path="/tmp/echo.png", clip={"x":0,"y":560,"width":1280,"height":240})
    n = p.evaluate("()=>document.querySelectorAll('[data-testid=echo-ring]').length")
    check(0 < n <= 4, f"At most four rings alive ({n})")
    pos = p.evaluate("()=>{const l=document.querySelector('[data-testid=echo-layer]');return l?l.style.left:null}")
    check(pos and pos.endswith("%"), f"Rings sit at the playhead ({pos})")
    anim = p.evaluate("()=>{const r=document.querySelector('[data-testid=echo-ring]');return r?getComputedStyle(r).animationName:null}")
    check(anim in (None, "echo-ring"), f"Ring animation is the compositor-only one ({anim})")
    # expanded toggle
    p.click(".player-bar-row .track-info"); p.wait_for_selector("[data-testid=echo-toggle]")
    check(p.get_attribute("[data-testid=echo-toggle]", "aria-pressed") == "true", "Expanded player: Echo toggle, on by default")
    p.click("[data-testid=echo-toggle]"); p.wait_for_timeout(1500)
    check(p.get_attribute("[data-testid=echo-toggle]", "aria-pressed") == "false" and p.evaluate("()=>localStorage.getItem('exomusica_echo')") == "0", "Toggle off is remembered")
    p.wait_for_timeout(1500)
    check(p.evaluate("()=>document.querySelectorAll('[data-testid=echo-ring]').length") == 0, "Off: no rings")
    p.click("[data-testid=echo-toggle]")
    try:
        p.wait_for_selector("[data-testid=echo-ring]", state="attached", timeout=5000); back = True
    except Exception: back = False
    check(back, "On again: rings return")
    # paused: nothing
    p.keyboard.press("Escape")
    p.evaluate("()=>document.querySelector('.play-toggle')?.click()"); p.wait_for_timeout(1200)
    check(p.evaluate("()=>document.querySelectorAll('[data-testid=echo-ring]').length") == 0, "Paused: rings stop")
    # classic mode
    c = mk("localStorage.setItem('exomusica_classic','1');"); play(c); c.wait_for_timeout(3500)
    check(c.evaluate("()=>document.querySelectorAll('[data-testid=echo-ring]').length") == 0, "Classic mode: no rings")
    # reduced motion
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
