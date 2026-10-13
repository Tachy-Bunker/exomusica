import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

BODY = "Intro with {scan ice texture | contact-mic recording of ice} here. See [the album](%s/album/al1) and [Beating](%s/study/s2) and [neo](%s/u/neo)." % (BASE, BASE, BASE)
STUDY = {"id": 5, "slug": "mine-1", "title": "Probe me", "body": BODY, "status": "IN_PROGRESS", "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
ALBUM = {"title": "First", "composer": "Ghost", "branch": {"name": "Full Branch"}, "tracks": [{"durationSeconds": 60}, {"durationSeconds": 65}]}
scans = []; patched = []
COMM = {"id": 3, "slug": "pend", "title": "Pending piece", "composer": "neo", "coverArtUrl": None, "description": None, "owner": {"username": "neo"}, "submissionStatus": "PENDING", "tracks": []}


import struct
def wav():
    n = 2000; data = b"".join(struct.pack("<h", int(8000 * ((i % 40) / 40 - .5))) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16) + b"data" + struct.pack("<I", len(data)) + data
JURLS = {"firstScan": "/uploads/j-scan.wav"}
uploads = []
def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, seed=None, jingles=JURLS):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        for k, v in (seed or {}).items(): init += f"if(localStorage.getItem({json.dumps(k)})===null)localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
        init += "if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0'); window.__starts=0; const o=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(){window.__starts++; return o.apply(this,arguments)};"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=wav())
            if key == "/api/site-settings": return ok({"jingleUrls": jingles})
            if key.startswith("/api/admin/site-settings/jingle/"):
                ev = key.rsplit("/", 1)[1]
                if req.method == "POST": uploads.append(ev); JURLS[ev] = "/uploads/j-%s.wav" % ev
                else: JURLS.pop(ev, None)
                return ok({"jingleUrls": dict(JURLS) or None})
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/albums/al1": return ok(ALBUM)
            if key == "/api/scans": return route.fulfill(status=204, body="") if req.method == "POST" else ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    starts = lambda pg: pg.evaluate("window.__starts")
    def scan(pg):
        pg.goto(f"{BASE}/study/mine-1"); pg.wait_for_selector(".probe-point"); pg.keyboard.press("i")
        pg.hover("a[href$='/album/al1']"); pg.wait_for_selector("[data-testid=probe-card]", timeout=4000); pg.wait_for_timeout(500)

    # account switch
    a = mk(ME)
    a.goto(f"{BASE}/account"); a.wait_for_selector("[data-testid=classic-toggle]"); a.wait_for_selector("[data-testid=jingle-toggle]")
    check(not a.is_checked("[data-testid=jingle-toggle]"), "Pickup sounds: off by default")
    none = mk(ME, None, None)
    none.goto(f"{BASE}/account"); none.wait_for_selector("[data-testid=classic-toggle]"); none.wait_for_timeout(300)
    check(none.locator("[data-testid=jingle-toggle]").count() == 0, "No recordings uploaded: no switch is offered")

    # off: silent
    off = mk(ME); scan(off)
    check(starts(off) == 0, "Off: scanning makes no sound")
    # on: plays once
    on = mk(ME, {"exomusica_jingles": "1"}); scan(on)
    check(starts(on) == 1, f"On: the first scan plays the uploaded recording ({starts(on)})")
    on.keyboard.press("Escape"); on.mouse.move(5, 300); on.wait_for_timeout(200)
    on.hover("a[href$='/study/s2']"); on.wait_for_selector("[data-testid=probe-card]", timeout=4000); on.wait_for_timeout(300)
    check(starts(on) == 1, "On: a second scan stays quiet (once)")
    check("firstScan" in on.evaluate("localStorage.getItem('exomusica_jingles_done')"), "On: remembered as heard")
    # event with no file stays silent
    on.evaluate("window.dispatchEvent(new CustomEvent('exo:jingle',{detail:'firstReply'}))"); on.wait_for_timeout(300)
    check(starts(on) == 1, "A moment with no uploaded file stays silent")
    # classic
    cl = mk(ME, {"exomusica_jingles": "1", "exomusica_classic": "1"})
    cl.goto(f"{BASE}/study/mine-1"); cl.wait_for_selector(".probe-point")
    cl.evaluate("window.dispatchEvent(new CustomEvent('exo:jingle',{detail:'firstScan'}))"); cl.wait_for_timeout(300)
    check(starts(cl) == 0, "Classic mode: silent")
    # forget
    on.goto(f"{BASE}/account"); on.wait_for_selector("[data-testid=jingle-forget]"); on.click("[data-testid=jingle-forget]")
    check(on.evaluate("localStorage.getItem('exomusica_jingles_done')") is None, "Let me hear them again clears the memory")

    # admin
    ad = mk({"id": 1, "username": "tachy", "isAdmin": True})
    ad.goto(f"{BASE}/admin/visor"); ad.wait_for_selector("[data-testid=jingles-admin]")
    check(ad.locator("[data-testid^=jingle-first], [data-testid=jingle-sectionDone]").count() == 4, "Admin: one row per moment")
    ad.set_input_files("[data-testid=jingle-firstReply] input[type=file]", {"name": "r.wav", "mimeType": "audio/wav", "buffer": wav()})
    ad.click("[data-testid=jingle-firstReply] button:has-text('Upload')"); ad.wait_for_selector("[data-testid=jingle-firstReply] audio")
    check(uploads == ["firstReply"], f"Admin: uploaded to the right moment {uploads}")
    ad.click("[data-testid=jingle-firstReply] button:has-text('Remove')"); ad.wait_for_timeout(300)
    check(ad.locator("[data-testid=jingle-firstReply] audio").count() == 0, "Admin: removed")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
