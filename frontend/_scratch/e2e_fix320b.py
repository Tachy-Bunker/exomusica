import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
_s = open(D + "/e2e_fix302.py").read()
__file__ = D + "/e2e_fix302.py"
exec(_s.split("\ndef run(playwright):")[0])
ADM = {**ME, "isAdmin": True}
patches = []; uploads = []
HITS = [{"source": "album", "title": "Rain Two", "fileUrl": "/uploads/rain2.wav", "format": "WAV", "durationSeconds": 6, "detail": "First"}]

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1300, "height": 1000}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADM))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/branches": return ok([{"id": 2, "slug": "b2", "name": "Full Branch", "parentId": None}])
        if key == "/api/branches/b2/albums": return ok([{"id": 1, "slug": "al1", "title": "First", "composer": "Ghost"}])
        if key == "/api/albums/al1": return ok(ALBUM)
        if key == "/api/admin/track-search": return ok(HITS)
        if key == "/api/admin/track-upload": uploads.append(1); return ok({"url": "/uploads/tracks/up.mp3", "format": "MP3", "title": "Up", "durationSeconds": 5}, 201)
        m = re.match(r"/api/admin/tracks/(\d+)$", key)
        if m and req.method == "PATCH": patches.append((int(m.group(1)), json.loads(req.post_data))); return ok({})
        if key in ("/api/collaborators", "/api/link-icons", "/api/community-albums", "/api/studies"): return ok([])
        if key.endswith("/sketches"): return ok([])
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    pg.goto(f"{BASE}/admin/albums"); pg.wait_for_selector("button:has-text('Manage')", timeout=10000)
    pg.locator("button:has-text('Manage')").first.click(); EDIT = "div:has(> span:text-is('Rain One')) > button:text-is('Edit')"
    pg.wait_for_selector(EDIT, timeout=8000)
    pg.locator(EDIT).click()
    pg.wait_for_selector("[data-testid=track-replace-audio]")
    check(True, "Admin: the track editor has a Replace the audio section")
    box = pg.locator("[data-testid=track-replace-audio]")
    box.locator("[data-testid=track-search]").fill("rain"); pg.wait_for_selector("[data-testid=track-hit]")
    box.locator("[data-testid=track-hit]").click()
    check("Press Save" in box.locator("[data-testid=track-source-msg]").inner_text(), "Picking a server track says to press Save (not Add track)")
    pg.locator("button.btn-primary:text-is('Save')").first.click(); pg.wait_for_timeout(500)
    check(patches and patches[-1][0] == 1 and patches[-1][1]["fileUrl"] == "/uploads/rain2.wav" and patches[-1][1]["format"] == "WAV", f"Save sends the new file {patches[-1:]}")
    pg.locator(EDIT).click(); pg.wait_for_selector("[data-testid=track-replace-audio]")
    pg.locator("[data-testid=track-replace-audio] [data-testid=track-upload]").set_input_files({"name": "n.mp3", "mimeType": "audio/mpeg", "buffer": b"ID3" + b"0" * 100}); pg.wait_for_timeout(600)
    pg.locator("button.btn-primary:text-is('Save')").first.click(); pg.wait_for_timeout(500)
    check(uploads and patches[-1][1]["fileUrl"] == "/uploads/tracks/up.mp3" and patches[-1][1]["format"] == "MP3", f"Re-upload: the new file replaces the old {patches[-1:]}")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
