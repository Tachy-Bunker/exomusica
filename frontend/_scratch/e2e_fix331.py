import json, re, sys, os, base64
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
ADM = {**ME, "isAdmin": True}
SELF_ID = ADM["id"]
USERS = [{"id": 77, "username": "sam", "isAdmin": False, "isGhost": False, "createdAt": "2026-05-01T00:00:00Z", "storageUsedBytes": 1048576, "storageLimitBytes": 524288000, "_count": {"messages": 3}},
         {"id": SELF_ID, "username": ADM["username"], "isAdmin": True, "isGhost": False, "createdAt": "2026-01-01T00:00:00Z", "storageUsedBytes": 0, "storageLimitBytes": 0, "_count": {"messages": 9}}]
DETAIL = {77: {"id": 77, "username": "sam", "email": "sam@x.io", "avatarUrl": None, "bio": "hi", "links": [{"label": "site", "url": "https://sam.io"}], "isAdmin": False, "isGhost": False, "createdAt": "2026-05-01T00:00:00Z", "frame": "frame-spark", "tint": "#ff00aa", "storageLimitMb": 500, "storageUsedMb": 1},
          SELF_ID: {"id": SELF_ID, "username": ADM["username"], "email": "me@x.io", "avatarUrl": "/uploads/avatars/me.png", "bio": None, "links": None, "isAdmin": True, "isGhost": False, "createdAt": "2026-01-01T00:00:00Z", "frame": None, "tint": None, "storageLimitMb": 500, "storageUsedMb": 0}}
patches = []; avatars = []
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1300, "height": 1000}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADM))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/admin/users":
            return ok({"users": [] if "ghostsOnly" in path else USERS, "total": len(USERS)})
        m = re.match(r"/api/admin/users/(\d+)$", key)
        if m:
            uid = int(m.group(1))
            if req.method == "PATCH": b = json.loads(req.post_data); patches.append((uid, b)); return ok({"id": uid}, 400 if b.get("password") == "short" else 200) if b.get("password") != "short" else ok({"error": "Password: 8 to 200 characters"}, 400)
            return ok(DETAIL[uid])
        if re.match(r"/api/admin/users/\d+/avatar$", key):
            body = req.post_data_buffer or b""
            avatars.append({"size": len(body), "head": body[:400].decode("latin1")})
            return ok({"avatarUrl": "/uploads/avatars/new.webp"})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or "sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    pg.goto(f"{BASE}/admin/users"); pg.wait_for_selector("tr:has-text('sam')")
    pg.locator("tr:has-text('sam')").first.get_by_role("button", name="Manage").click(); pg.wait_for_selector("[data-testid=user-editor]")
    check(pg.input_value("[aria-label=Email]") == "sam@x.io" and pg.input_value("[aria-label='Storage limit in MB']") == "500", "The editor shows email and storage limit")
    check(pg.locator("[data-testid=suit-moderation]").count() == 1, "A worn frame and tint are shown for moderation")

    # change several details: only the changed ones are sent
    pg.fill("[aria-label=Email]", "sam@new.io"); pg.fill("[aria-label='Storage limit in MB']", "750"); pg.fill("[aria-label='New password']", "a-long-password")
    pg.check("[data-testid=suit-moderation] label:has-text('clear') input >> nth=0")
    pg.click("[data-testid=user-save]"); pg.wait_for_timeout(500)
    uid, body = patches[-1]
    check(uid == 77 and body == {"email": "sam@new.io", "storageLimitMb": 750, "password": "a-long-password", "clearFrame": True}, f"Save sends only what changed {body}")

    # paste a big image: shrunk before upload
    pg.locator("tr:has-text('sam')").first.get_by_role("button", name="Manage").click(); pg.wait_for_selector("[data-testid=user-editor]")
    pg.evaluate("""async () => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d');
      for (let i = 0; i < 4000; i++) { x.fillStyle = `rgb(${i*7%256},${i*13%256},${i*29%256})`; x.fillRect((i*37)%1600, (i*91)%1200, 40, 40); }
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); window.__big = blob.size;
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
      document.querySelector('[data-testid=avatar-drop]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }""")
    pg.wait_for_timeout(1200)
    big = pg.evaluate("window.__big")
    check(len(avatars) == 1 and avatars[0]["size"] < 900_000 and avatars[0]["size"] < big, f"A pasted image is shrunk before upload ({big} → {avatars[0]['size'] if avatars else None} bytes)")
    check("image/webp" in avatars[0]["head"] or "image/jpeg" in avatars[0]["head"], "…and sent as webp/jpeg")
    check(pg.locator("[data-testid=avatar-drop] img").get_attribute("src") == "/uploads/avatars/new.webp", "The new picture shows at once")

    # paste an address of a hosted file: own origin full URL and bare path
    pg.evaluate("""(t) => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.querySelector('[data-testid=avatar-drop]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", f"{BASE}/uploads/avatars/old.png")
    pg.wait_for_timeout(400)
    check(patches[-1] == (77, {"avatarUrl": "/uploads/avatars/old.png"}), f"Pasting a hosted address sets it {patches[-1]}")
    n = len(patches)
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'https://evil.example/a.png'); document.querySelector('[data-testid=avatar-drop]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    pg.wait_for_timeout(300)
    check(len(patches) == n and pg.locator("[role=alert]").count() == 1, "An outside address is refused with a hint")
    pg.click("[data-testid=avatar-remove]"); pg.wait_for_timeout(400)
    check(patches[-1] == (77, {"avatarUrl": None}) and pg.locator("[data-testid=avatar-remove]").count() == 0, "Remove clears the picture")

    # server rejection is shown
    pg.fill("[aria-label='New password']", "short"); pg.click("[data-testid=user-save]"); pg.wait_for_timeout(400)
    check("8 to 200" in pg.inner_text("[role=alert]"), "A server refusal is shown in the editor")

    # no changes
    pg.reload(); pg.wait_for_selector("tr:has-text('sam')"); pg.locator("tr:has-text('sam')").first.get_by_role("button", name="Manage").click(); pg.wait_for_selector("[data-testid=user-editor]")
    n = len(patches); pg.click("[data-testid=user-save]"); pg.wait_for_timeout(300)
    check(len(patches) == n and "Nothing changed" in pg.inner_text("[data-testid=user-editor]"), "Saving with no changes sends nothing")

    # self: can't demote
    pg.locator(f"tr:has-text('{ADM['username']}')").first.get_by_role("button", name="Manage").click(); pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=user-editor] input[type=checkbox][disabled]").count() >= 1, "Your own Admin box is locked")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
