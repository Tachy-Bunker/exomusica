import json, re, sys, os, io, wave, math
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Idea 3: music keeps playing across room -> page -> terminal, and a terminal never starts a second stream.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
ALBUM_FULL = {"id": 1, "slug": "alb-one", "title": "Album One", "composer": "Ann", "coverArtUrl": None, "description": None, "contentMarkdown": None, "links": [], "gallery": [], "branch": {"slug": "core", "name": "Core"}, "collaborators": [], "tracks": [{"id": 11, "title": "First Light", "fileUrl": "/uploads/a.mp3", "format": "mp3", "durationSeconds": 125, "position": 1, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}, {"id": 12, "title": "Second Wind", "fileUrl": "/uploads/b.mp3", "format": "mp3", "durationSeconds": 61, "position": 2, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}]}
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}, {"id": 2, "slug": "alb-two", "title": "Album Two", "composer": "x", "coverArtUrl": None, "previewTrack": None}]

def wav(seconds=12, hz=440, rate=8000):
    frames = b"".join(int(6000 * math.sin(2 * math.pi * hz * i / rate)).to_bytes(2, "little", signed=True) for i in range(seconds * rate))
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(frames)
    return bio.getvalue()
WAV = wav()

AUDIO = "() => [...document.querySelectorAll('audio')].map(a => ({p: a.paused, t: +a.currentTime.toFixed(2)}))"
PLAYING = "() => [...document.querySelectorAll('audio')].filter(a => !a.paused && a.currentTime > 0).length"

def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        if key.startswith("/uploads/"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
        if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN}))
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key == "/api/albums/alb-one": return ok(ALBUM_FULL)
        if key == "/api/chart": return ok(NODES)
        if key == "/api/branches/core/albums": return ok(ALBUMS)
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 12, "albums": 2, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 1, "studies": 0, "branches": 1}})
        if key == "/api/milestones": return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": {"id": 9, "slug": "chat-core"}})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key in ("/api/rooms/online",): return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e) + " | " + (getattr(e, "stack", "") or "")[:500].replace("\n", " / ")))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)

    # 1. play a track on the album page
    pg.goto(f"{BASE}/album/alb-one"); pg.wait_for_selector("[data-testid=album-play-all]", timeout=8000)
    pg.wait_for_timeout(600); pg.eval_on_selector("[data-testid=album-play-all]", "el => el.click()")
    try:
        pg.wait_for_function("() => [...document.querySelectorAll('audio')].some(a => !a.paused && a.currentTime > 0.3)", timeout=8000); started = True
    except Exception:
        started = False
    check(started, "a track plays from the album page")
    if not started:
        print("no playback, stopping"); b.close(); sys.exit(1)

    # 2. move to the room with a client-side navigation (the player is in Layout, so it should survive)
    pg.evaluate("() => { history.pushState({}, '', '/branch/core/room'); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }")
    try:
        pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    except Exception:
        print("   room did not render. url:", pg.url, "errors:", errs[:3], "text:", pg.inner_text("body")[:300].replace("\n", " | ")); raise
    pg.wait_for_timeout(300)
    t0 = pg.evaluate(PLAYING)
    before = max((r["t"] for r in pg.evaluate(AUDIO) if not r["p"]), default=0)
    pg.wait_for_timeout(1200)
    after = max((r["t"] for r in pg.evaluate(AUDIO) if not r["p"]), default=0)
    check(t0 >= 1 and after - before > 0.8, f"the track keeps playing in the room (t {before} -> {after})")

    # 3. open the Log from the room's logbook as a terminal
    pg.click("[data-testid=room-logbook]"); pg.wait_for_selector("[data-testid=logbook-site-wiki]", timeout=6000)
    pg.click("[data-testid=logbook-site-wiki]"); pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
    pg.wait_for_timeout(1200)
    before = max((r["t"] for r in pg.evaluate(AUDIO) if not r["p"]), default=0)
    pg.wait_for_timeout(800)
    after = max((r["t"] for r in pg.evaluate(AUDIO) if not r["p"]), default=0)
    check(after - before > 0.5, f"the track keeps playing with a terminal open (t {before} -> {after})")
    fel = pg.query_selector("[data-testid=terminal-frame]"); fr = fel.content_frame()
    fr.wait_for_selector("[data-testid=terminal-main]", timeout=8000)
    frame_rows = fr.evaluate(AUDIO)
    print("   frame audio elements:", frame_rows)
    print("   parent audio elements:", pg.evaluate(AUDIO))

    # 4. in the terminal, play a track from an album page inside the frame: there must still be one stream
    fr.evaluate("() => { history.pushState({}, '', '/album/alb-one'); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }")
    try:
        fr.wait_for_selector("[data-testid=album-play-all]", timeout=6000); reached = True
    except Exception:
        reached = False
    check(reached, "an album page opens inside the terminal")
    if reached:
        fr.wait_for_timeout(600); fr.eval_on_selector("button[aria-label='Play Second Wind']", "el => el.click()"); pg.wait_for_timeout(1500)
        streams = pg.evaluate(PLAYING) + fr.evaluate(PLAYING)
        print("   streams after playing in the terminal:", streams, "parent:", pg.evaluate(AUDIO), "frame:", fr.evaluate(AUDIO))
        check(streams == 1, f"one stream at a time: playing in the terminal does not start a second one ({streams} playing)")
        check(fr.evaluate(PLAYING) == 0, "the terminal's own page has no audio element playing")
        transport = fr.query_selector("[data-testid=terminal-transport]")
        check(transport is not None and "Second Wind" in (transport.inner_text() or ""), "the terminal's player shows the track that is playing")
        fr.click("[data-testid=terminal-transport] .pt-play"); pg.wait_for_timeout(600)
        check(pg.evaluate("() => [...document.querySelectorAll('audio')].every(a => a.paused)") and pg.evaluate("() => window.__exoAudio.api.getState().isPlaying") is False, "the terminal's play/pause (pointer click) pauses the page's player")
        fr.click("[data-testid=terminal-transport] .pt-play"); pg.wait_for_timeout(900)
        check(pg.evaluate(PLAYING) == 1, "and plays it again")

    check(not errs, f"the room raised no page errors ({errs[:3]})")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
