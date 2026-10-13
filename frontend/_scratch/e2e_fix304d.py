import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

steps = [[0]*16 for _ in range(4)]
for s in (0, 4, 8, 12): steps[0][s] = 1
for s in (2, 6, 10, 14): steps[1][s] = 1
STATE = {"tempo": 100, "root": 110, "scale": "minor-pent", "swing": 0, "steps": steps, "muted": [False]*4, "epoch": 0}
FAKE = """
(() => {
  const Real = window.WebSocket; window.__jamSent = []; window.__jamState = %s; window.__jamClose = %s;
  class Fake {
    constructor(url) { this.url = url; this.readyState = 1; window.__ws = this; setTimeout(() => {
      if (window.__jamClose) { this.onclose && this.onclose({ code: window.__jamClose }); return; }
      this.onmessage({ data: JSON.stringify({ type: 'state', state: window.__jamState, members: ['tachy', 'neo'], now: Date.now(), you: 'tachy' }) }); }, 30); }
    send(d) { const m = JSON.parse(d); window.__jamSent.push(m); if (m.type === 'ping') setTimeout(() => this.onmessage({ data: JSON.stringify({ type: 'pong', now: Date.now() }) }), 5); }
    close() {}
  }
  window.WebSocket = function (url, ...a) { return String(url).includes('/ws/jam/') ? new Fake(url) : new Real(url, ...a); };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
})();
"""

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(closecode=0):
        ctx = browser.new_context(viewport={"width": 1280, "height": 1000}, service_workers="block", accept_downloads=True)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        ctx.add_init_script(FAKE % (json.dumps(STATE), closecode))
        def handle(route):
            req = route.request; key = req.url.replace(BASE, "").split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/jam" and req.method == "POST": return ok({"code": "K7QX"}, 201)
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    sent = lambda pg: pg.evaluate("window.__jamSent.filter(m => m.op).map(m => m.op)")

    page = mk()
    page.goto(f"{BASE}/jam"); page.wait_for_selector("[data-testid=jam-create]")
    page.click("[data-testid=jam-create]"); page.wait_for_selector("[data-testid=jam-room]")
    check(page.url.endswith("/jam/K7QX") and page.inner_text("[data-testid=jam-code]") == "K7QX", "Lobby: Start a room opens it by its code")
    check(page.locator("[data-testid=jam-on]").count() == 8, f"Room: the starting pattern is drawn ({page.locator('[data-testid=jam-on]').count()} cells)")
    check("neo" in page.inner_text("[data-testid=jam-members]"), "Room: who is in it")

    page.click("[aria-label='Lead step 3 note 5']")
    check({"t": "step", "lane": 3, "step": 2, "v": 5} in sent(page) and page.locator("[aria-label='Lead step 3 note 5'][aria-pressed=true]").count() == 1, f"Edit: a note cell sends the change and shows at once {sent(page)[-1:]}")
    page.click("[aria-label='Lead step 3 note 5']")
    check(sent(page)[-1] == {"t": "step", "lane": 3, "step": 2, "v": 0}, "Edit: clicking it again clears it")
    page.click("[aria-label='Kick step 2']")
    check(sent(page)[-1] == {"t": "step", "lane": 0, "step": 1, "v": 1}, "Edit: kick is on/off")
    page.evaluate("window.__ws.onmessage({data: JSON.stringify({type:'op', op:{t:'step', lane:2, step:7, v:3}, by:'neo', epoch:0})})")
    check(page.locator("[aria-label='Bass step 8 note 3'][aria-pressed=true]").count() == 1, "Sync: someone else's edit appears")
    page.select_option("[data-testid=jam-scale]", "dorian")
    check(sent(page)[-1] == {"t": "scale", "v": "dorian"}, "Controls: scale change is shared")
    page.click("[data-testid=jam-mute-1]")
    check(sent(page)[-1] == {"t": "mute", "lane": 1, "v": True} and "muted" in page.inner_text("[data-testid=jam-mute-1]"), "Controls: mute a lane")
    tempo = page.locator("[data-testid=jam-tempo]")
    tempo.focus(); page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowRight"); page.wait_for_timeout(100)
    check(any(o.get("t") == "tempo" and o["v"] > 100 for o in sent(page)), f"Controls: tempo change is committed ({[o for o in sent(page) if o.get('t')=='tempo'][:2]})")

    page.click("[data-testid=jam-sound]"); page.wait_for_timeout(1200)
    x1 = page.evaluate("getComputedStyle(document.querySelector('.jam-head')).transform")
    page.wait_for_timeout(500)
    x2 = page.evaluate("getComputedStyle(document.querySelector('.jam-head')).transform")
    check(x1 != "none" and x1 != x2, f"Sound: the playhead moves while playing ({x1[:24]} -> {x2[:24]})")
    check("Stop" in page.inner_text("[data-testid=jam-sound]"), "Sound: button turns into Stop")
    page.click("[data-testid=jam-sound]")
    with page.expect_download(timeout=20000) as dl: page.click("[data-testid=jam-save]")
    path = dl.value.path(); data = open(path, "rb").read()
    check(dl.value.suggested_filename.startswith("jam-K7QX") and data[:4] == b"RIFF" and len(data) > 100000, f"Save: a WAV is rendered ({len(data)} bytes)")
    check(sum(1 for b in data[44:] if b) > 1000, "Save: it is not silent")

    closed = mk(4404)
    closed.goto(f"{BASE}/jam/ZZZZ"); closed.wait_for_selector("[data-testid=jam-closed]")
    check("No room" in closed.inner_text("[data-testid=jam-closed]"), "Join: an unknown code says so")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
