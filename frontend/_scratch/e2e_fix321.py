import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
steps = [[0]*16 for _ in range(4)]
STATE = {"tempo": 100, "root": 110, "scale": "minor-pent", "swing": 0, "steps": steps, "muted": [False]*4, "epoch": 0}
FAKE = """
(() => {
  const Real = window.WebSocket; window.__jamSent = [];
  class Fake {
    constructor(url) { this.url = url; this.readyState = 1; window.__ws = this; window.__wsUrl = url; setTimeout(() => {
      this.onmessage({ data: JSON.stringify({ type: 'state', state: %s, members: ['guest-0042', 'neo'], now: Date.now(), you: 'guest-0042', guest: true, chat: [{by: 'neo', text: 'hi <i>there</i>', at: 1}] }) }); }, 30); }
    send(d) { const m = JSON.parse(d); window.__jamSent.push(m); if (m.type === 'ping') setTimeout(() => this.onmessage({ data: JSON.stringify({ type: 'pong', now: Date.now() }) }), 5); }
    close() {}
  }
  window.WebSocket = function (url, ...a) { return String(url).includes('/ws/jam/') ? new Fake(url) : new Real(url, ...a); };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
})();
"""
ROOMS = [{"code": "K7QX", "people": 2, "tempo": 120, "full": False}, {"code": "FULL", "people": 6, "tempo": 90, "full": True}]

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, w=1280, h=1000, touch=False):
        kw = dict(viewport={"width": w, "height": h}, service_workers="block")
        if touch: kw.update(has_touch=True, is_mobile=True)
        ctx = browser.new_context(**kw)
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + (f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});" if user else ""))
        ctx.add_init_script(FAKE % json.dumps(STATE))
        posted = []
        def handle(route):
            req = route.request; key = req.url.replace(BASE, "").split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/jam/rooms": return ok(ROOMS)
            if key == "/api/jam" and req.method == "POST": posted.append(json.loads(req.post_data)); return ok({"code": "K7QX"}, 201)
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or "volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        pg.posted = posted
        return pg
    msg = lambda pg, o: pg.evaluate("(o) => window.__ws.onmessage({data: JSON.stringify(o)})", o)
    sent = lambda pg, t: pg.evaluate("(t) => window.__jamSent.filter(m => m.type === t)", t)

    # --- lobby as a guest
    g = mk(None); g.goto(f"{BASE}/jam"); g.wait_for_selector("[data-testid=jam-open-room]")
    check(g.locator("[data-testid=jam-open-room]").count() == 2 and "2/6" in g.locator("[data-testid=jam-open-room]").first.inner_text(), "Lobby: the open rooms are listed for a guest")
    check(g.locator("[data-testid=jam-create]").count() == 0 and "Joining needs no account" in g.inner_text("[data-testid=jam-lobby]"), "Guest: no Start button, but joining is open")
    g.fill("[aria-label='Room code']", "k7qx"); g.press("[aria-label='Room code']", "Enter"); g.wait_for_selector("[data-testid=jam-room]")
    check(g.url.endswith("/jam/K7QX"), "Guest: joins by code without logging in")
    check("guest-0042" in g.inner_text("[data-testid=jam-guest-note]") and g.locator("[data-testid=jam-guest-note] a[href='/join']").count() == 1, "Guest: told their name, with a way to join")
    check("token=" in g.evaluate("window.__wsUrl"), "Socket still opens (server decides guest vs member)")
    # chat
    check("hi <i>there</i>" in g.inner_text("[data-testid=jam-chat-lines]") and g.locator("[data-testid=jam-chat-lines] i").count() == 0, "Chat: history shows, as plain text")
    g.fill("[data-testid=jam-chat-input]", "hello room"); g.press("[data-testid=jam-chat-input]", "Enter")
    check(sent(g, "chat") == [{"type": "chat", "text": "hello room"}] and g.input_value("[data-testid=jam-chat-input]") == "", "Chat: sending posts the line and clears the box")
    msg(g, {"type": "chat", "line": {"by": "neo", "text": "second", "at": 2}}); g.wait_for_timeout(100)
    check("second" in g.inner_text("[data-testid=jam-chat-lines]"), "Chat: a new line from someone else appears")
    # cursors in
    msg(g, {"type": "cur", "u": "neo", "x": 0.25, "y": 0.5}); g.wait_for_timeout(120)
    cur = g.locator(".jam-cursor")
    check(cur.count() == 1 and "neo" in cur.inner_text(), "Cursors: a glowing glyph with the name appears")
    box = g.locator("[data-testid=jam-room]").bounding_box(); cb = g.locator(".jam-cursor-glyph").bounding_box()
    check(abs((cb["x"] + cb["width"] / 2) - (box["x"] + box["width"] * 0.25)) < 12 and abs((cb["y"] + cb["height"] / 2) - (box["y"] + box["height"] * 0.5)) < 12, f"Cursors: placed at the same spot of the room ({cb['x']:.0f},{cb['y']:.0f})")
    msg(g, {"type": "cur", "u": "neo", "x": 0.75, "y": 0.2}); g.wait_for_timeout(200)
    check(g.locator(".jam-cursor").count() == 1, "Cursors: moving reuses the same element")
    check(g.evaluate("getComputedStyle(document.querySelector('.jam-cursor-glyph')).textShadow") != "none" and g.evaluate("getComputedStyle(document.querySelector('.jam-cursors')).pointerEvents") == "none", "Cursors: glow, and they never block clicks")
    g.wait_for_timeout(4400)
    check(g.locator(".jam-cursor.idle").count() == 1, "Cursors: fade when the pointer rests")
    msg(g, {"type": "gone", "u": "neo"}); g.wait_for_timeout(100)
    check(g.locator(".jam-cursor").count() == 0, "Cursors: removed when the person leaves")
    # cursors out
    g.mouse.move(box["x"] + 100, box["y"] + 100)
    for i in range(30): g.mouse.move(box["x"] + 100 + i * 5, box["y"] + 100 + i * 3); g.wait_for_timeout(8)
    n = len(sent(g, "cur"))
    check(3 <= n <= 14, f"Sending: my pointer goes out throttled ({n} messages for 30 moves)")
    c0 = sent(g, "cur")[0]; check(0 <= c0["x"] <= 1 and 0 <= c0["y"] <= 1.2, f"Sending: positions are fractions of the room {c0}")
    # logged-in member sees the Start checkbox
    m = mk(ME); m.goto(f"{BASE}/jam"); m.wait_for_selector("[data-testid=jam-create]")
    m.uncheck("[data-testid=jam-listed]"); m.click("[data-testid=jam-create]"); m.wait_for_selector("[data-testid=jam-room]")
    check(m.posted == [{"listed": False}], f"Member: can start an unlisted room {m.posted}")
    # phone
    p = mk(None, 390, 800, touch=True); p.goto(f"{BASE}/jam/K7QX"); p.wait_for_selector("[data-testid=jam-chat]")
    p.mouse.move(100, 300); p.wait_for_timeout(200)
    check(len(sent(p, "cur")) == 0, "Phone: no cursor traffic")
    msg(p, {"type": "cur", "u": "neo", "x": 0.5, "y": 0.5}); p.wait_for_timeout(100)
    check(not p.locator(".jam-cursor-glyph").is_visible(), "Phone: cursors are not drawn")
    check(p.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Phone: no sideways scroll with the chat open")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
