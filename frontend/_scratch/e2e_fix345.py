import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def item(i, src, url, title): return {"id": i, "source": src, "trackId": i, "title": title, "fileUrl": url, "durationSeconds": 6, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": "/uploads/cover.png", "composer": "Ghost", "branchSlug": "b2", "replayGainDb": None, "genres": [], "trackPosition": 0}
PL = {"id": 7, "slug": "night-drive", "title": "Night Drive", "description": None, "owner": "neo", "ownerId": 5, "collaborators": [], "albums": [], "items": [item(1, "official", "/uploads/rain.wav", "Rain"), item(2, "community", "/uploads/rain2.wav", "Neo Piece")]}
def ms(r): return [{"key": "m-offline", "title": "Offline cache", "perk": "x", "metric": "TRACKS", "label": "t", "target": 1000, "now": 1100, "reached": r, "reachedAt": None, "live": True}]
def run(pw):
    b = pw.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(reached):
        ctx = b.new_context(viewport={"width": 1200, "height": 800}, service_workers="block"); ctx.add_init_script("localStorage.setItem('exomusica_classic','1');")
        def h(route):
            k = route.request.url.replace(BASE, "").split("?")[0]
            ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            if k.startswith("/uploads/"): return route.fulfill(status=200, headers={"Content-Length": "4"}, content_type="audio/wav" if k.endswith("wav") else "image/png", body=b"abcd")
            if k == "/api/milestones": return ok(ms(reached))
            if k == "/api/playlists/night-drive": return ok(PL)
            if k.startswith("/api/tracks/"): return ok({})
            if k in DATA: return ok(DATA[k])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        return pg, errs
    pg, errs = mk(False); pg.goto(f"{BASE}/playlist/night-drive/list"); pg.wait_for_selector("text=Night Drive"); pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=offline-toggle]").count() == 0, "Locked: no Save offline on a playlist")
    pg, errs = mk(True); pg.goto(f"{BASE}/playlist/night-drive/list"); pg.wait_for_selector("[data-testid=offline-toggle]", timeout=5000)
    check(pg.get_attribute("[data-testid=offline-toggle]", "data-kind") == "playlist", "Unlocked: a Save offline button for the playlist")
    pg.click("[data-testid=offline-toggle]"); pg.wait_for_selector("text=Offline ✓", timeout=15000)
    saved = json.loads(pg.evaluate("localStorage.getItem('exomusica_offline_playlists')") or "[]")
    check(len(saved) == 1 and saved[0]["slug"] == "night-drive" and len(saved[0]["tracks"]) == 2 and {t["source"] for t in saved[0]["tracks"]} == {"official", "community"}, "Both official and community tracks are recorded")
    cached = pg.evaluate("async () => { const c = await caches.open('exo-offline-v1'); return (await c.keys()).map(r => new URL(r.url).pathname); }")
    check("/api/playlists/night-drive" in cached and "/uploads/rain.wav" in cached and "/uploads/rain2.wav" in cached and "/uploads/cover.png" in cached, f"Playlist data, audio and cover are in the cache {cached}")
    pg.goto(f"{BASE}/offline"); pg.wait_for_selector("[data-testid=offline-playlist-row]")
    check("Night Drive" in pg.inner_text("[data-testid=offline-playlist-row]") and "2 tracks" in pg.inner_text("[data-testid=offline-playlist-row]"), "Offline page lists the playlist")
    pg.click("[data-testid=offline-playlist-row] button:has-text('Remove')"); pg.wait_for_timeout(500)
    keys = pg.evaluate("async () => (await caches.keys())")
    check(pg.locator("[data-testid=offline-playlist-row]").count() == 0 and "exo-armed" not in keys, "Removing frees it and disarms the worker when nothing else is saved")
    check(not errs, f"No page errors {errs[:1]}")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
