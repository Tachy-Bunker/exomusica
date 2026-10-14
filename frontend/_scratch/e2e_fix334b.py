import json, re, sys, os, base64
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def M(reached): return [{"key": "m-spectral", "title": "Spectral wall", "perk": "x", "metric": "TRACKS", "label": "tracks", "target": 50, "now": 60 if reached else 10, "reached": reached, "reachedAt": None, "live": True}]
STRIP = base64.b64encode(bytes([0x5A] * 2500)).decode()
TR = lambda a, b: [{"id": i, "title": f"T{i}", "seconds": 60, "album": f"alb{i}", "albumTitle": f"A{i}", "branch": "Tidal" if i % 2 else "Ember"} for i in range(a, b)]
def scenario(playwright, reached):
    browser = playwright.chromium.launch(); res = []; st = {"wall": 0, "strips": 0, "calls": []}
    ctx = browser.new_context(viewport={"width": 1300, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/milestones": return ok(M(reached))
        if key == "/api/spectral-wall":
            st["wall"] += 1; off = int(re.search(r"offset=(\d+)", path).group(1)) if "offset=" in path else 0
            return ok({"locked": False, "total": 60, "tracks": TR(1 + off, 49 + off) if off == 0 else TR(49, 61)})
        if key == "/api/spectral-wall/strips":
            st["strips"] += 1; ids = [int(x) for x in re.search(r"ids=([\d,]+)", path).group(1).split(",")]; st["calls"].append(ids)
            if st["strips"] == 1: return ok({"locked": False, "strips": {str(i): STRIP for i in ids if i % 2}, "pending": [i for i in ids if not i % 2]})
            return ok({"locked": False, "strips": {str(i): STRIP for i in ids}, "pending": []})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "volume" in str(e) or "sandboxed" in str(e) or errs.append(str(e)))
    return browser, ctx, pg, st, res, errs
def run(playwright):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    b, ctx, pg, st, _, errs = scenario(playwright, False)
    pg.goto(f"{BASE}/soundbay?view=wall"); pg.wait_for_selector("[data-testid=soundbay-page]"); pg.wait_for_timeout(600)
    check(pg.locator("[data-testid=sb-wall-chip]").count() == 0, "Locked: no Spectral wall chip")
    check(pg.locator("[data-testid=spectral-wall]").count() == 0 and st["wall"] == 0 and st["strips"] == 0, "Locked: ?view=wall shows nothing and asks the server for nothing")
    b.close()
    b, ctx, pg, st, _, errs = scenario(playwright, True)
    pg.goto(f"{BASE}/soundbay"); pg.wait_for_selector("[data-testid=sb-wall-chip]")
    check(st["wall"] == 0 and st["strips"] == 0, "Unlocked: nothing about the wall is fetched until the chip is used")
    pg.click("[data-testid=sb-wall-chip]"); pg.wait_for_selector("[data-testid=wall-tile]")
    check("view=wall" in pg.url, "The view is in the address")
    check(pg.locator("[data-testid=wall-tile]").count() == 48 and pg.locator("[data-testid=wall-more]").count() == 1, "48 tiles and a Show more")
    pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=wall-tile][data-drawn='1']").count() == 24, "Strips already drawn appear at once")
    check(pg.locator("[data-testid=wall-tile]").first.locator("a").get_attribute("href") == "/album/alb1", "A tile links to its album")
    px = pg.evaluate("(()=>{const c=document.querySelector('[data-drawn=\"1\"] canvas');const d=c.getContext('2d').getImageData(0,0,1,1).data;return d[3]})()")
    check(px == 255, "…and the canvas is really painted")
    pg.wait_for_function("document.querySelectorAll('[data-drawn=\"1\"]').length===48", timeout=14000)
    check(st["strips"] == 2 and sorted(st["calls"][1]) == [i for i in range(1, 49) if not i % 2], f"Pending ones are asked for again later, only those ({st['strips']} calls)")
    pg.click("[data-testid=wall-more]"); pg.wait_for_function("document.querySelectorAll('[data-testid=wall-tile]').length===60")
    check(st["wall"] == 2, "Show more fetches the next page")
    pg.click("[data-testid=sb-wall-chip]"); pg.wait_for_selector("#sb-branches, [data-testid=sb-empty], #sb-playlists", timeout=4000)
    check(pg.locator("[data-testid=spectral-wall]").count() == 0, "The chip toggles back to Soundbay")
    check(not errs, f"No page errors {errs[:1]}"); b.close()
    print(f"{sum(out)}/{len(out)}"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
