import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
def trk(i, title): return {"id": i, "title": title, "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 600, "position": 0, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": []}
def ms(crate, lw): return [{"key": "m-crateradio", "title": "Crate radio", "perk": "x", "metric": "PLAYLISTS", "label": "p", "target": 100, "now": 120, "reached": crate, "reachedAt": None, "live": True}, {"key": "m-longwave", "title": "Long wave", "perk": "x", "metric": "MINUTES", "label": "m", "target": 600, "now": 700, "reached": lw, "reachedAt": None, "live": True}]
def run(pw):
    b = pw.chromium.launch(); out = []; asked = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(crate, lw):
        ctx = b.new_context(viewport={"width": 1100, "height": 800}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('exomusica_classic','1');")
        def h(route):
            k = route.request.url.replace(BASE, "").split("?")[0]
            ok = lambda x: route.fulfill(status=200, content_type="application/json", body=json.dumps(x))
            asked.append(k)
            if k == "/api/milestones": return ok(ms(crate, lw))
            if k == "/api/radio/now": return ok({"branch": {"slug": "b2", "name": "Full Branch", "channelSlug": None}, "track": trk(1, "Branch Song"), "offset": 3, "remaining": 500, "upcoming": [], "blockEndsAt": int(time.time() * 1000) + 3600000, "serverNow": int(time.time() * 1000)})
            if k == "/api/radio/station/crate": return ok({"locked": False, "station": "crate", "track": trk(2, "Crate Song"), "offset": 1, "remaining": 500, "credit": {"title": "Night Drive", "owner": "neo", "slug": "night-drive"}, "upcoming": [{"id": 3, "title": "After", "albumTitle": "First"}], "serverNow": int(time.time() * 1000), "loopSeconds": 7200, "tracks": 12})
            if k == "/api/radio/station/longwave": return ok({"locked": False, "station": "longwave", "track": trk(4, "Long Song"), "offset": 1, "remaining": 500, "credit": None, "upcoming": [], "serverNow": int(time.time() * 1000), "loopSeconds": 36000, "tracks": 90})
            if k.startswith("/api/branches/"): return ok({"id": 2, "slug": "b2", "name": "Full Branch", "identityColor": "#4fa8e0", "visibility": "VISIBLE", "channel": None})
            if k in DATA: return ok(DATA[k])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), h)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs
    pg, errs = mk(False, False)
    pg.goto(f"{BASE}/radio"); pg.wait_for_selector("[data-testid=radio-card]"); pg.wait_for_timeout(300)
    check(pg.locator("[data-testid=radio-stations]").count() == 0, "Nothing unlocked: no station tabs, just the branch radio")
    check("Branch Song" in pg.inner_text("[data-testid=radio-title]"), "Branch station plays as before")
    pg.goto(f"{BASE}/radio?station=crate"); pg.wait_for_selector("[data-testid=radio-card]"); pg.wait_for_timeout(300)
    check("Branch Song" in pg.inner_text("[data-testid=radio-title]") and "/api/radio/station/crate" not in asked, "Asking for a locked station falls back to the branch radio, no request for it")
    pg, errs = mk(True, False); asked.clear()
    pg.goto(f"{BASE}/radio"); pg.wait_for_selector("[data-testid=radio-stations]")
    check(pg.locator("[data-testid=radio-st-crate]").count() == 1 and pg.locator("[data-testid=radio-st-longwave]").count() == 0, "Only unlocked stations get a tab")
    pg.click("[data-testid=radio-st-crate]"); pg.wait_for_function("document.querySelector('[data-testid=radio-title]')?.textContent.includes('Crate Song')")
    check("Night Drive" in pg.inner_text("[data-testid=radio-credit]") and "neo" in pg.inner_text("[data-testid=radio-credit]"), "Crate radio: every song is credited to its playlist and owner")
    check(pg.get_attribute("[data-testid=radio-credit] a", "href") == "/playlist/night-drive", "…linking to the playlist")
    check(pg.url.endswith("station=crate"), "The station is in the address, so it can be shared")
    check("After" in pg.inner_text("[data-testid=radio-card]"), "Next songs shown")
    pg.click("[data-testid=radio-st-branch]"); pg.wait_for_function("document.querySelector('[data-testid=radio-title]')?.textContent.includes('Branch Song')")
    check("station=" not in pg.url, "Back to the branch radio")
    check(not errs, f"No page errors {errs[:1]}")
    pg, errs = mk(True, True)
    pg.goto(f"{BASE}/radio?station=longwave"); pg.wait_for_function("document.querySelector('[data-testid=radio-title]')?.textContent.includes('Long Song')")
    check("10 h" in pg.inner_text("[data-testid=radio-loop]"), f"Long wave: shows how long the loop is ({pg.inner_text('[data-testid=radio-loop]')})")
    check(pg.locator("[data-testid=radio-st-crate]").count() == 1 and pg.locator("[data-testid=radio-st-longwave]").count() == 1, "Both tabs when both are unlocked")
    check(not errs, f"No page errors {errs[:1]}")
    b.close(); print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
