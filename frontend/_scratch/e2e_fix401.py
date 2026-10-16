import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# One sound per page, terminals included: the room's ambience and a track must not run twice when a terminal is open.
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
ALBUM_FULL = {"id": 1, "slug": "alb-one", "title": "Album One", "composer": "Ann", "coverArtUrl": None, "description": None, "contentMarkdown": None, "links": [], "gallery": [], "branch": {"slug": "core", "name": "Core"}, "collaborators": [], "tracks": [{"id": 11, "title": "First Light", "fileUrl": "/uploads/a.mp3", "format": "mp3", "durationSeconds": 125, "position": 1, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}, {"id": 12, "title": "Second Wind", "fileUrl": "/uploads/b.mp3", "format": "mp3", "durationSeconds": 61, "position": 2, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}]}
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}]

def wav(seconds=60, hz=440, rate=8000):
    import io, wave, math
    frames = b"".join(int(4000 * math.sin(2 * math.pi * hz * i / rate)).to_bytes(2, "little", signed=True) for i in range(seconds * rate))
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(frames)
    return bio.getvalue()
WAV = wav()

# Every <audio> or new Audio() that plays is recorded, in the page and in each frame, whether or not it is attached to the page.
INIT = """(() => {
  const set = new Set(); window.__playing = set;
  const play = HTMLMediaElement.prototype.play, pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function (...a) { set.add(this); return play.apply(this, a); };
  HTMLMediaElement.prototype.pause = function (...a) { set.delete(this); return pause.apply(this, a); };
})();"""
COUNT = "() => [...(window.__playing || [])].filter(e => !e.paused).length"

def run(pw):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(INIT)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(['core']))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        if key.startswith("/uploads/"): return route.fulfill(status=200, content_type="audio/wav", body=WAV)
        if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN}))
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key == "/api/site-settings": return ok({"ambienceUrl": "/uploads/amb.wav", "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/albums/alb-one": return ok(ALBUM_FULL)
        if key == "/api/chart": return ok(NODES)
        if key == "/api/branches/core/albums": return ok(ALBUMS)
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 2, "studies": 0, "branches": 1}})
        if key == "/api/milestones": return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": {"id": 9, "slug": "chat-core"}})
        if key == "/api/wiki/opening": return ok({"id": 1, "slug": "opening", "title": "The opening", "contentMarkdown": "The first entry.", "font": None})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)

    # 1. the room's ambience plays while the room is open
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    try:
        pg.wait_for_function(COUNT.replace("() => ", "() => ").strip() + " >= 1", timeout=8000); ambient = True
    except Exception:
        ambient = False
    check(ambient, "the room's ambience plays")

    # 2. open the Log as a terminal: still one sound
    pg.click("[data-testid=room-logbook]"); pg.wait_for_selector("[data-testid=logbook-site-wiki]", timeout=6000)
    pg.click("[data-testid=logbook-site-wiki]"); pg.wait_for_selector("[data-testid=page-terminal]", timeout=6000)
    fr = pg.query_selector("[data-testid=terminal-frame]").content_frame()
    fr.wait_for_selector("[data-testid=terminal-main]", timeout=8000); pg.wait_for_timeout(2500)
    parent_n, frame_n = pg.evaluate(COUNT), fr.evaluate(COUNT)
    print(f"   sounds playing with the terminal open: page {parent_n}, terminal {frame_n}")
    check(parent_n + frame_n == 1, f"opening a terminal does not start a second ambience ({parent_n + frame_n} playing)")

    # 3. a track started inside the terminal: the page's track alone, the ambience gives way
    fr.evaluate("() => { history.pushState({}, '', '/album/alb-one'); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }")
    fr.wait_for_selector("[data-testid=album-play-all]", timeout=6000)
    fr.evaluate("() => document.querySelector(\"button[aria-label='Play Second Wind']\").click()")
    pg.wait_for_timeout(3500)
    parent_n, frame_n = pg.evaluate(COUNT), fr.evaluate(COUNT)
    print(f"   with a track in the terminal: page {parent_n}, terminal {frame_n}")
    check(parent_n + frame_n == 1, f"with a track playing, the ambience has stopped and only the track plays ({parent_n + frame_n} playing)")
    st = pg.evaluate("() => { const s = window.__exoAudio.api.getState(); return { title: s.currentTrack && s.currentTrack.title, playing: s.isPlaying } }")
    check(st == {"title": "Second Wind", "playing": True}, f"the one sound is the page's track ({st})")

    check(not errs, f"the room raised no page errors ({errs[:3]})")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
