import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


def fnv(s):
    h = 2166136261
    for ch in s.encode("utf-16-le")[::2] if all(ord(c) < 256 for c in s) else []:
        h ^= ch; h = (h * 16777619) & 0xFFFFFFFF
    n = h; out = ""
    while n: out = "0123456789abcdefghijklmnopqrstuvwxyz"[n % 36] + out; n //= 36
    return out or "0"
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core Room"}, {"id": 2, "parentId": 1, "secret": True, "key": fnv("vault")}, {"id": 3, "parentId": 1, "slug": "wing", "name": "Wing"}]
patched = []
ADMIN = [{"id": 7, "slug": "vault", "name": "The Vault", "visibility": "HIDDEN", "chartHidden": False, "description": "", "channel": {"id": 1, "slug": "vault-chat"}, "parentId": 1, "posX": 0, "posY": 0}]
def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None):
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        for k, v in (seed or {}).items(): init += f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
        init += "if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/branches/vault": return ok({"id": 7, "slug": "vault", "name": "The Vault"})
            if key == "/api/admin/branches" and req.method == "GET": return ok(ADMIN)
            if key == "/api/admin/branches/7" and req.method == "PATCH": patched.append(json.loads(req.post_data)); return ok({})
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    p = mk(ME)
    p.goto(f"{BASE}/chart"); p.wait_for_selector("[data-testid=chart-svg]")
    check(p.locator("[data-testid=room-sealed]").count() == 1, "A hidden branch shows as a sealed room")
    html = p.inner_html("[data-testid=chart-page]")
    check("vault" not in html.lower() and "The Vault" not in html, "A sealed room gives away no name or address")
    check("1 sealed" in p.inner_text("[data-testid=chart-tally]"), "The tally counts sealed rooms")
    check("?" in p.text_content("[data-testid=room-sealed]") and p.locator("a[href='/branch/vault']").count() == 0, "A sealed room is not a doorway")
    f = mk(ME, {"exomusica_visits": json.dumps(["vault"])})
    f.goto(f"{BASE}/chart"); f.wait_for_selector("[data-testid=chart-svg]"); f.wait_for_selector("a[href='/branch/vault']", state="attached")
    check("The Vault" in f.text_content("a[href='/branch/vault']") and f.locator("[data-testid=room-sealed]").count() == 0, "Once you have walked into it, it is named, filled in and a doorway")
    check("sealed" not in f.inner_text("[data-testid=chart-tally]"), "…and no longer counted as sealed")

    ad = mk({"id": 1, "username": "tachy", "isAdmin": True})
    ad.goto(f"{BASE}/admin/branches"); ad.wait_for_selector("[data-testid=chart-hidden]")
    check(not ad.is_checked("[data-testid=chart-hidden]"), "Admin: the checkbox starts unticked")
    ad.locator("[data-testid=chart-hidden]").click(force=True); ad.wait_for_timeout(300)
    check(patched and patched[-1] == {"chartHidden": True}, f"Admin: ticking it saves chartHidden {patched[-1:]}")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
