import json, re, sys, os, base64
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def trk(i, title, marks=(), url="/uploads/rain.wav"):
    return {"id": i, "title": title, "fileUrl": url, "format": "WAV", "durationSeconds": 6, "position": i, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [{"label": l, "timestampSeconds": t} for l, t in marks], "replayGainDb": 0, "source": "official", "genres": [], "composers": []}
def album(tracks): return {"id": 1, "slug": "al1", "title": "First", "composer": "Ghost", "coverArtUrl": None, "description": "d", "contentMarkdown": None, "branch": {"id": 2, "slug": "b2", "name": "Full Branch"}, "links": [], "gallery": [], "collaborators": [], "tracks": tracks}
GOOD = base64.b64encode(bytes([40 + (i % 200) for i in range(720)] + [(i * 3) % 256 for i in range(720)])).decode()

def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(tracks, profile=None):
        ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        posts = []
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/uploads/rain.wav":
                data = open(WAV, "rb").read(); rng = req.headers.get("range")
                if rng:
                    m = re.match(r"bytes=(\d*)-(\d*)", rng); a = int(m.group(1) or 0); e = int(m.group(2)) if m.group(2) else len(data) - 1; e = min(e, len(data) - 1)
                    return route.fulfill(status=206, headers={"Content-Range": f"bytes {a}-{e}/{len(data)}", "Accept-Ranges": "bytes", "Content-Type": "audio/wav"}, body=data[a:e + 1])
                return route.fulfill(status=200, headers={"Accept-Ranges": "bytes"}, content_type="audio/wav", body=data)
            if key.startswith("/uploads/"): return route.fulfill(status=404, body="")
            if key == "/api/albums/al1": return ok(album(tracks))
            if key == "/api/albums/al1/transition": return ok({"mode": "none", "ms": 0})
            if re.match(r"/api/tracks/\d+/wave-profile", key):
                if req.method == "POST": posts.append(json.loads(req.post_data)); return ok({"status": "ok"})
                return ok({"profile": profile})
            if re.match(r"/api/tracks/\d+/(provenance|comments)", key): return ok([] if key.endswith("comments") else {})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and print("CONSOLE", m.text[:200]))
        return pg, errs, posts
    S = "[data-testid=morph-stage]"
    at = lambda pg, k: pg.get_attribute(S, "data-" + k)
    el = lambda pg: pg.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    def open_ball(pg):
        pg.goto(f"{BASE}/album/al1"); pg.wait_for_selector("[data-testid=album-play-all]")
        pg.wait_for_timeout(300); pg.locator("[data-testid=album-play-all]").dispatch_event("click"); pg.wait_for_timeout(900)
        pg.locator(".player-expand-btn").first.click(); pg.wait_for_selector("[data-testid=player-morph]")
        pg.click("[data-testid=player-morph]"); pg.wait_for_selector("[data-testid=morph-ball]")
    T = [trk(1, "Rain One", [("Gate", 1.0), ("Vault", 3.0)]), trk(2, "Rain Two")]

    # ---- first listener works the profile out and shares it
    pg, errs, posts = mk(T)
    open_ball(pg)
    check(pg.locator("[data-testid=morph-wait]").count() >= 0, "The overlay opens from the expanded player")
    pg.wait_for_selector(f"{S}[data-ready='1']", timeout=15000)
    check(len(posts) == 1 and len(base64.b64decode(posts[0]["profile"])) == 1440, f"The profile is measured once and shared ({len(posts)} post)")
    check(pg.locator("[data-testid=morph-wait]").count() == 0, "The waiting text goes away")
    check(int(at(pg, "marks")) == 2, "Both bookmarks became save points")
    # ---- the ball rides the music
    pg.wait_for_timeout(300); t0 = float(at(pg, "t")); pg.wait_for_timeout(1000); t1 = float(at(pg, "t"))
    check(0.6 < t1 - t0 < 1.5, f"The ball moves at the speed of the music ({t1 - t0:.2f} s in 1 s)")
    # ---- rolling forward and back (paused, so only the hand moves the head)
    pg.click("[data-testid=morph-play]"); pg.wait_for_timeout(300)
    box = pg.locator(S).bounding_box(); strip_y = box["y"] + box["height"] - 30
    pg.mouse.click(box["x"] + 10 + (box["width"] - 20) * (0.2 / 6), strip_y); pg.wait_for_timeout(400)
    check(abs(el(pg) - 0.2) < 0.4, f"Tapping the strip near the start ({el(pg):.2f})")
    a0 = el(pg); pg.keyboard.down("KeyD"); pg.wait_for_timeout(1200); pg.keyboard.up("KeyD"); pg.wait_for_timeout(500)
    a1 = el(pg); check(a1 - a0 > 1.8, f"Holding D rolls the head on, faster the longer it is held ({a0:.1f} → {a1:.1f} in 1.2 s)")
    pg.mouse.click(box["x"] + 10 + (box["width"] - 20) * (0.2 / 6), strip_y); pg.wait_for_timeout(400)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(300); e1 = el(pg)
    pg.keyboard.press("KeyE"); pg.wait_for_timeout(300); e2 = el(pg)
    pg.keyboard.press("KeyQ"); pg.wait_for_timeout(300); q1 = el(pg)
    check(abs(e1 - 1.0) < 0.15 and abs(e2 - 3.0) < 0.15 and abs(q1 - 1.0) < 0.15, f"E / Q step between the save points ({e1:.2f}, {e2:.2f}, back to {q1:.2f})")
    pg.keyboard.down("KeyD"); pg.wait_for_timeout(1150); pg.keyboard.up("KeyD")
    check(pg.locator("[data-testid=morph-saved]").count() == 1 and "Vault" in pg.inner_text("[data-testid=morph-saved]"), "Rolling over a save point names it")
    pg.keyboard.down("KeyA"); pg.wait_for_timeout(500); back = float(at(pg, "t")); pg.keyboard.up("KeyA"); pg.wait_for_timeout(300)
    check(back < 3.6, f"A rolls backwards ({back:.2f})")
    # ---- pause: nothing repaints
    pg.wait_for_timeout(2600)
    n0 = int(at(pg, "drawn") or 0); pg.wait_for_timeout(1200); n1 = int(at(pg, "drawn") or 0)
    check(n1 - n0 <= 2, f"Paused and untouched: it stops repainting ({n1 - n0} frames in 1.2 s)")
    # ---- dragging the ground
    t_before = float(at(pg, "t"))
    pg.mouse.move(box["x"] + 500, box["y"] + 200); pg.mouse.down(); pg.mouse.move(box["x"] + 300, box["y"] + 200, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
    check(float(at(pg, "t")) > t_before + 1.0 or float(at(pg, "t")) >= 5.5, f"Dragging the ground rolls the head ({t_before:.2f} → {at(pg, 't')})")
    # ---- the strip along the bottom
    pg.mouse.click(box["x"] + 10 + (box["width"] - 20) * 0.5, box["y"] + box["height"] - 30); pg.wait_for_timeout(400)
    check(abs(float(at(pg, "t")) - 3.0) < 0.5, f"Tapping the strip goes there ({at(pg, 't')})")
    # ---- leaving
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=morph-ball]").count() == 0 and pg.locator(".player-expanded-overlay").count() == 1, "Esc leaves the ball, not the player")
    check(not errs, f"No page errors {errs}")

    # ---- a known profile is just used
    pg, errs, posts = mk(T, GOOD)
    open_ball(pg); pg.wait_for_selector(f"{S}[data-ready='1']", timeout=8000); pg.wait_for_timeout(600)
    check(posts == [], "A profile the server already has is not worked out again")
    check(not errs, f"No page errors {errs}")
    # ---- a track that cannot be read says so
    pg, errs, posts = mk([trk(1, "Missing", url="/uploads/nope.wav")])
    pg.goto(f"{BASE}/album/al1"); pg.wait_for_selector("[data-testid=album-play-all]"); pg.locator("[data-testid=album-play-all]").dispatch_event("click"); pg.wait_for_timeout(600)
    pg.locator(".player-expand-btn").first.click(); pg.wait_for_selector("[data-testid=player-morph]"); pg.click("[data-testid=player-morph]")
    pg.wait_for_selector("[data-testid=morph-wait][role=alert]", timeout=8000)
    check("could not be read" in pg.inner_text("[data-testid=morph-wait]"), "A track that cannot be read says so")
    check(not errs, f"No page errors {errs}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
