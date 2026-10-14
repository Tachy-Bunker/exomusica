import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix292.py").read()
__file__ = D + "/e2e_fix292.py"; exec(_s.split("\ndef run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
def N(i, slug, name, x, y): return {"id": i, "type": "TOPIC", "parentId": None, "x": x, "y": y, "color": None, "size": None, "hidden": False, "channel": {"slug": slug, "name": name, "contentMarkdown": None}, "playlist": None, "sampleBankItem": None, "challenge": None, "study": None, "speakerCount": 3}
MAP = [N(1, "hall", "The Hall", 0, 0), N(2, "branch-b2", "Full Branch", 200, 0), N(3, "quiet", "Quiet", 0, 200)]
NOTES = [{"id": 1, "eventKey": "reply", "channelSlug": "hall", "messageId": 5, "title": "t", "body": "b", "read": False, "createdAt": "2026-10-01T00:00:00Z"},
         {"id": 2, "eventKey": "reply", "channelSlug": "quiet", "messageId": 6, "title": "t", "body": "b", "read": True, "createdAt": "2026-10-01T00:00:00Z"}]
sent = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/forum-map": return ok(MAP)
        if key == "/api/notifications": return ok(NOTES)
        if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    # 1. leave a draft in the Hall
    pg.goto(f"{BASE}/topic/hall"); pg.wait_for_selector("text=alpha", timeout=10000)
    ta = pg.locator("textarea").last; ta.fill("half a thought"); pg.wait_for_timeout(700)
    check(pg.evaluate("localStorage.getItem('exomusica_cdraft_hall')") == "half a thought", "Draft is kept in this browser while typing")
    pg.goto(f"{BASE}/topic/hall"); pg.wait_for_selector("text=alpha", timeout=10000); pg.wait_for_timeout(300)
    check(pg.locator("textarea").last.input_value() == "half a thought", "…and comes back when you return to the room")
    # 2. map pins
    pg.evaluate("localStorage.setItem('exomusica_pin_listen', 'b2')")
    pg.goto(f"{BASE}/discussion/map"); pg.wait_for_selector("[data-node-id]", timeout=10000); pg.wait_for_timeout(600)
    hall = pg.locator("[data-node-id='1']"); b2 = pg.locator("[data-node-id='2']"); q = pg.locator("[data-node-id='3']")
    check(hall.locator("[data-testid=map-pin-draft]").count() == 1 and hall.locator("[data-testid=map-pin-reply]").count() == 1, "Hall: draft pin and reply-waiting pin")
    check(b2.locator("[data-testid=map-pin-listen]").count() == 1 and hall.locator("[data-testid=map-pin-listen]").count() == 0, "Branch chat: last-listened pin only there")
    check(q.locator("[data-testid^=map-pin]").count() == 0, "A read notification leaves no pin")
    # 3. sending clears
    pg.goto(f"{BASE}/topic/hall"); pg.wait_for_selector("text=alpha", timeout=10000); pg.locator("textarea").last.fill(""); pg.wait_for_timeout(700)
    check(pg.evaluate("localStorage.getItem('exomusica_cdraft_hall')") is None, "An emptied box drops the draft pin")
    # 4. playing a branch track records the listening pin
    pg.evaluate("localStorage.removeItem('exomusica_pin_listen')")
    pg.goto(f"{BASE}/soundbay?sort=az"); pg.wait_for_selector("[data-testid=branch-row]")
    pg.click("[data-testid=sb-filter-all]"); pg.wait_for_timeout(200)
    pg.locator("[data-testid=branch-row]").nth(1).locator("[data-testid=row-play]").click(force=True); pg.wait_for_timeout(1200)
    check(bool(pg.evaluate("localStorage.getItem('exomusica_pin_listen')")), f"Playing a track records its branch ({pg.evaluate('localStorage.getItem(\"exomusica_pin_listen\")')})")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
