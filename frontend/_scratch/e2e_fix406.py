import json, re, sys, os, time
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Map links (fix406): a lift cabin lists its own destinations when the Map layout gave it some (each behind its gate); a room without any keeps the default (every open room).
NODES = [
    {"id": 1, "parentId": None, "slug": "core", "name": "Core"},
    {"id": 2, "parentId": 1, "slug": "vault", "name": "Vault"},
    {"id": 3, "parentId": None, "slug": "annex", "name": "Annex"},
]
HOME = {"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}, {"slug": "vault", "name": "Vault", "tracks": 1, "albums": 0, "parentSlug": "core"}, {"slug": "annex", "name": "Annex", "tracks": 1, "albums": 0, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 4, "studies": 0, "branches": 3}}
def milestone(key, reached):
    return {"key": key, "title": key, "perk": "p", "metric": "TRACKS", "label": "t", "target": 1, "now": 1 if reached else 0, "reached": reached, "reachedAt": None, "live": True}
BRANCHES = {"core": 1, "vault": 2, "annex": 3}

def click_id(pg, tid):
    return pg.evaluate("(t) => { const b = document.querySelector(`[data-testid=${t}]`); if (!b) return false; b.click(); return true; }", tid)
def stage(pg, name):
    return pg.evaluate("(n) => document.querySelector('[data-testid=room-stage]')?.dataset[n] ?? null", name)

def session(pw, start, visits, links, milestones, explore=False):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(visits))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/milestones": return ok(milestones)
        if key == "/api/map-links": return ok(links)
        if key == "/api/map-overrides": return ok([])
        if key == "/api/home": return ok(HOME)
        if key.endswith("/albums"): return ok([])
        m = re.match(r"^/api/branches/([a-z]+)$", key)
        if m and m.group(1) in BRANCHES:
            s = m.group(1); return ok({"id": BRANCHES[s], "slug": s, "name": s.capitalize(), "description": "d", "coverArtUrl": None, "parentId": 1 if s == "vault" else None, "channel": None})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    if explore:
        pg.goto(f"{BASE}/explore"); pg.wait_for_selector("[data-testid=explore-page] canvas", timeout=10000)
    else:
        pg.goto(f"{BASE}/branch/{start}/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    pg.wait_for_timeout(900)
    return b, ctx, pg, errs

def cabin(pg):
    """The names the cabin offers (step onto the pad, then read the list)."""
    click_id(pg, "lift-pad"); pg.wait_for_timeout(500)
    if pg.locator("[data-testid=lift-panel]").count() == 0: return None
    return sorted(pg.evaluate("() => [...document.querySelectorAll('[data-testid^=lift-to-]')].map((b) => b.dataset.testid.slice(8))"))

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)
    visits = ["core", "vault", "annex"]

    # A. the Core's cabin has its own list: vault only, although annex is open too
    links = [{"id": 1, "fromSlug": "core", "toSlug": "vault", "kind": "lift", "gate": ""}]
    b, ctx, pg, errs = session(pw, "core", visits, links, [])
    got = cabin(pg)
    check(got == ["vault"], f"core cabin lists its own destinations only ({got})")
    ctx.close(); b.close()

    # B. the Vault's cabin: core (no gate) and annex (behind a gate not reached yet)
    links = [{"id": 1, "fromSlug": "vault", "toSlug": "core", "kind": "lift", "gate": ""}, {"id": 2, "fromSlug": "vault", "toSlug": "annex", "kind": "lift", "gate": "m-gate"}]
    b, ctx, pg, errs = session(pw, "vault", visits, links, [milestone("m-gate", False)])
    got = cabin(pg)
    check(got == ["core"], f"vault cabin hides annex behind an unreached gate ({got})")
    ctx.close(); b.close()

    # C. the same with the gate reached: annex is offered
    b, ctx, pg, errs = session(pw, "vault", visits, links, [milestone("m-gate", True)])
    got = cabin(pg)
    check(got == ["annex", "core"], f"vault cabin offers annex once its gate is reached ({got})")
    check(not errs, f"no page errors in the Vault with a gated corridor ({errs[:3]})")
    ctx.close(); b.close()

    # D. a room with no lift rows keeps the default: every open room (annex and core are visited)
    b, ctx, pg, errs = session(pw, "annex", visits, [], [])
    got = cabin(pg)
    check(got == ["core", "vault"], f"a room without lift rows offers every open room ({got})")
    ctx.close(); b.close()

    # E. the explorer draws a gated corridor without errors
    links = [{"id": 3, "fromSlug": "annex", "toSlug": "vault", "kind": "corridor", "gate": "m-gate"}]
    b, ctx, pg, errs = session(pw, None, visits, links, [milestone("m-gate", False)], explore=True)
    pg.wait_for_timeout(800)
    check(pg.locator("[data-testid=explore-page] canvas").count() >= 1, "the Scan map draws with a gated corridor")
    check(not errs, f"no page errors on the Scan map ({errs[:3]})")
    ctx.close(); b.close()

    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
