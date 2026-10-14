import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
_s = open(D + "/e2e_fix292.py").read()
__file__ = D + "/e2e_fix292.py"
exec(_s.split("\ndef run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
OLD = "/uploads/messages/old.wav"
STUDY = {"slug": "mine-1", "title": "Beating tones in a cave", "body": f"Intro\n\n@audio({OLD})\n", "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "branches": [], "files": [], "channel": None, "charts": [],
         "annotations": [{"id": 5, "position": 1, "text": f"The throb {{clip:1-2 {OLD}}}"}]}
HITS = [{"kind": "track", "id": 4, "title": "Ice Piece", "detail": "First", "hosted": True}, {"kind": "community", "id": 9, "title": "Ice external", "detail": "X · community", "hosted": False}]
calls = []; mode = {"fail": False}

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user):
        ctx = browser.new_context(viewport={"width": 1300, "height": 900})
        ctx.add_init_script("localStorage.setItem('exomusica_classic','0');" + (f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});" if user else ""))
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
            if key == "/api/studies/mine-1" and req.method == "GET": return ok(STUDY)
            if key == "/api/studies-audio-search": return ok(HITS)
            if key == "/api/studies/mine-1/files": calls.append(("upload",)); return ok({"id": 3, "url": "/uploads/messages/new.wav", "filename": "new.wav", "mimeType": "audio/wav", "sizeBytes": 10}, 201)
            if key == "/api/studies/mine-1/replace-audio":
                b = json.loads(req.post_data); calls.append(("swap", b))
                if mode["fail"]: return ok({"error": "that track is hosted outside Exomusica"}, 400)
                STUDY["body"] = STUDY["body"].replace(OLD, b.get("uploadUrl") or "/uploads/messages/track4.wav")
                return ok({"ok": True, "url": "x", "blocks": 1, "clips": 1})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    g = mk(ME); g.goto(f"{BASE}/study/mine-1"); g.wait_for_selector(".audio-tools", timeout=10000)
    check(g.locator("[data-testid=audio-replace-open]").count() == 1, "Owner: a Replace recording button sits on the audio block")
    g.click("[data-testid=audio-replace-open]")
    g.fill("[data-testid=audio-replace-search]", "ice"); g.wait_for_selector("[data-testid=audio-replace-hit]")
    hits = g.locator("[data-testid=audio-replace-hit]")
    check(hits.count() == 2 and hits.nth(0).is_enabled() and hits.nth(1).is_disabled(), "Search lists Exomusica tracks; an externally hosted one is greyed out")
    hits.nth(0).click(); g.wait_for_timeout(600)
    check(calls and calls[-1] == ("swap", {"from": OLD, "trackId": 4}), f"Picking a track sends it: {calls[-1:]}")
    check(g.locator("[data-testid=audio-replace]").count() == 0, "The panel closes and the study reloads")
    # upload route
    STUDY["body"] = f"Intro\n\n@audio({OLD})\n"; g.reload(); g.wait_for_selector("[data-testid=audio-replace-open]", timeout=10000)
    g.click("[data-testid=audio-replace-open]")
    g.set_input_files("[data-testid=audio-replace-file]", {"name": "new.wav", "mimeType": "audio/wav", "buffer": WAV}); g.wait_for_timeout(800)
    check(("upload",) in calls and calls[-1] == ("swap", {"from": OLD, "uploadUrl": "/uploads/messages/new.wav"}), f"Upload: file goes to the study, then swaps {calls[-2:]}")
    # error shown
    STUDY["body"] = f"Intro\n\n@audio({OLD})\n"; mode["fail"] = True; g.reload(); g.wait_for_selector("[data-testid=audio-replace-open]", timeout=10000)
    g.click("[data-testid=audio-replace-open]"); g.fill("[data-testid=audio-replace-search]", "ice"); g.wait_for_selector("[data-testid=audio-replace-hit]")
    g.locator("[data-testid=audio-replace-hit]").nth(0).click(); g.wait_for_timeout(500)
    check("hosted outside" in g.inner_text("[data-testid=audio-replace-err]"), "A refused swap shows its reason and keeps the panel open")
    # not editing only
    g.click("button:has-text('Cancel')")
    # other users
    o = mk({"id": 2, "username": "ghost9", "isAdmin": False}); o.goto(f"{BASE}/study/mine-1"); o.wait_for_selector(".audio-reader", timeout=10000)
    check(o.locator("[data-testid=audio-replace-open]").count() == 0, "Other members don't get the button")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
