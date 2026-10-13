import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix302.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

def trk(i, title, a="al1"):
    return {"id": i, "title": title, "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 6, "position": i, "albumTitle": "First", "albumSlug": a, "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": [], "composers": []}
ALBUM = {"id": 1, "slug": "al1", "title": "First", "composer": "Ghost", "coverArtUrl": None, "description": "d", "contentMarkdown": "Liner notes here", "branch": {"id": 2, "slug": "b2", "name": "Full Branch"}, "links": [], "gallery": [], "collaborators": [], "tracks": [trk(1, "Rain One"), trk(2, "Rain Two")], "transition": "gapless", "crossfadeMs": 3000}
TRANS = {"mode": "gapless", "ms": 3000}
PROV = {"study": {"slug": "mine-1", "title": "Beating tones"}, "sketch": {"id": 3, "label": "s.wav", "branchSlug": "b2"}, "branch": {"slug": "b2", "name": "Full Branch"}, "album": {"slug": "al1", "title": "First"}}

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
        def ok(b): return route.fulfill(status=200, content_type="application/json", body=json.dumps(b))
        if key == "/api/albums/al1": return ok(ALBUM)
        if key == "/api/albums/al1/transition": return ok(TRANS)
        if key == "/api/albums/al2/transition": return ok({"mode": "none", "ms": 0})
        if re.match(r"/api/tracks/\d+/provenance", key): return ok(PROV)
        if re.match(r"/api/tracks/\d+/comments", key): return ok([])
        if key.startswith("/uploads/rain.wav"):
            data = open(WAV, "rb").read(); rng = route.request.headers.get("range")
            if rng:
                m = re.match(r"bytes=(\d*)-(\d*)", rng); a = int(m.group(1) or 0); b = int(m.group(2)) if m.group(2) else len(data) - 1; b = min(b, len(data) - 1)
                return route.fulfill(status=206, headers={"Content-Range": f"bytes {a}-{b}/{len(data)}", "Accept-Ranges": "bytes", "Content-Type": "audio/wav"}, body=data[a:b + 1])
            return route.fulfill(status=200, headers={"Accept-Ranges": "bytes"}, content_type="audio/wav", body=data)
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    ST = "() => { const els=[...document.querySelectorAll('.player-bar-wrapper audio')]; return els.map(e=>({t:e.currentTime,p:e.paused,s:!!e.getAttribute('src')})); }"
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    check(page.locator("[data-testid=offline-toggle]").count() == 1, "Album: a Save offline button")
    check("Liner notes here" in page.content(), "Album: the notes are returned and shown")
    page.locator("[data-testid=album-play-all]").dispatch_event("click"); page.wait_for_timeout(1500)
    els = page.evaluate(ST); print("STATE", els)
    check(len(els) == 2, "Player: two audio elements (one to fade into the next)")
    check(els[0]["s"] and not els[0]["p"] and els[1]["p"], "Player: the first plays, the spare is held ready")

    # provenance strip
    page.locator(".player-expand-btn").first.click(); page.wait_for_selector("[data-testid=prov-strip]")
    chips = page.locator("[data-testid=prov-strip] .prov-chip")
    check(chips.count() == 4 and chips.nth(0).inner_text() == "Beating tones" and chips.nth(3).inner_text() == "First", "Provenance: study › sketch › branch › album")
    check(chips.nth(0).get_attribute("href") == "/study/mine-1", "Provenance: the study chip opens the study")

    # A/B pair
    page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime = 1.0"); page.wait_for_timeout(400)
    print("SEEKED", page.evaluate("(() => { const a=document.querySelector('.player-bar-wrapper audio'); return [a.currentTime, a.seekable.length && a.seekable.end(0), a.readyState, a.paused]; })()"))
    page.click("[data-testid=ab-A] button:has-text('in')")
    page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime = 2.0"); page.wait_for_timeout(400)
    page.click("[data-testid=ab-A] button:has-text('out')")
    page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime = 4.0"); page.wait_for_timeout(400)
    page.click("[data-testid=ab-B] button:has-text('in')")
    txt = page.locator("[data-testid=ab-A]").inner_text()
    check("0:01" in txt and "0:02" in txt, "A/B: slot A holds 0:01–0:02 (" + txt.replace("\n", " ") + ")")
    check(page.locator(".ab-region").count() == 2, "A/B: both stretches drawn on the seek strip")
    page.click("[data-testid=ab-A] button:has-text('▶')"); page.wait_for_timeout(2600)
    t = page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    check(1.0 <= t <= 2.15, f"A/B: A loops inside its stretch (t={t:.2f})")
    page.keyboard.press("Backslash"); page.wait_for_timeout(500)
    t = page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    check(4.0 <= t < 5.7, f"A/B: the key flips to B (same distance in) (t={t:.2f})")
    page.wait_for_timeout(2500)
    t2 = page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    check(4.0 <= t2 <= 6.0 and page.locator("[data-testid=ab-B].on").count() == 1, f"A/B: B is the live side (t={t2:.2f})")
    page.keyboard.press("Backslash"); page.wait_for_timeout(500)
    t = page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime")
    check(t < 2.6 and page.locator("[data-testid=ab-A].on").count() == 1, f"A/B: and back to A (t={t:.2f})")
    page.click("[data-testid=ab-panel] button:has-text('free')")
    check(page.locator("[data-testid=ab-A].on, [data-testid=ab-B].on").count() == 0, "A/B: 'free' stops looping")
    page.click("[data-testid=ab-A] button[aria-label='Clear A']"); page.click("[data-testid=ab-B] button[aria-label='Clear B']")
    check(page.locator(".ab-region").count() == 0, "A/B: cleared")

    # gapless: near the end of track 1 the second element takes over before 'ended'
    page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime = 4.5"); page.wait_for_timeout(300)
    page.evaluate("window.__ended = 0; document.querySelectorAll('.player-bar-wrapper audio').forEach(a => a.addEventListener('ended', () => window.__ended++))")
    page.wait_for_timeout(2500)
    els = page.evaluate(ST)
    title = page.locator("h2").first.inner_text()
    check(title == "Rain Two", "Gapless: the next track is now current (" + title + ")")
    check(els[1]["s"] and not els[1]["p"], "Gapless: it plays on the other element")
    check(not els[0]["s"] or els[0]["p"], "Gapless: the first element has let go")
    check(page.evaluate("window.__ended") == 0 or page.evaluate("window.__ended") == 1, "Gapless: no stall")

    # crossfade: both elements sound during the overlap, then one lets go
    TRANS["mode"] = "crossfade"; TRANS["ms"] = 2000
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    page.locator("[data-testid=album-play-all]").dispatch_event("click"); page.wait_for_timeout(1200)
    page.evaluate("document.querySelector('.player-bar-wrapper audio').currentTime = 3.0")
    page.wait_for_timeout(1700)
    mid = page.evaluate(ST)
    check(not mid[0]["p"] and not mid[1]["p"], "Crossfade: during the overlap both play (%s)" % [round(m["t"], 1) for m in mid])
    page.wait_for_timeout(2500)
    end = page.evaluate(ST)
    check(sum(1 for m in end if not m["p"]) == 1, "Crossfade: afterwards only the new track plays")

    # offline pack (service worker blocked here: the page-side cache and the bookkeeping are what is checked)
    TRANS["mode"] = "none"
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=offline-toggle]")
    page.on("dialog", lambda d: d.accept()); page.click("[data-testid=offline-toggle]"); page.wait_for_selector("text=Offline ✓", timeout=15000)
    saved = json.loads(page.evaluate("localStorage.getItem('exomusica_offline_albums')") or "[]")
    check(len(saved) == 1 and saved[0]["slug"] == "al1" and len(saved[0]["tracks"]) == 2, "Offline: the album is recorded as saved")
    cached = page.evaluate("async () => { const c = await caches.open('exo-offline-v1'); return (await c.keys()).map(r => new URL(r.url).pathname); }")
    check("/uploads/rain.wav" in cached and "/api/albums/al1" in cached, "Offline: tracks and notes are in the cache: " + str(cached))
    page.goto(f"{BASE}/offline"); page.wait_for_selector("[data-testid=offline-row]")
    check("First" in page.locator("[data-testid=offline-row]").inner_text(), "Offline page: lists the saved album")
    page.click("[data-testid=offline-row] button:has-text('Remove')"); page.wait_for_timeout(500)
    cached = page.evaluate("async () => (await caches.keys())")
    check(page.locator("[data-testid=offline-row]").count() == 0 and "exo-armed" not in cached, "Offline: removing frees it and disarms the worker")

    # a plain album keeps the normal path
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
