import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# A sealed room's door (fix404): hitting it shows the milestone that opens it, with progress; once the room is found and the milestone reached, the door opens.
def fnv(s):  # the browser's hashStr: FNV-1a, base 36
    h = 2166136261
    for ch in s:
        h ^= ord(ch); h = (h * 16777619) & 0xFFFFFFFF
    n, out = h, ""
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    while True:
        out = digits[n % 36] + out; n //= 36
        if n == 0: break
    return out
KEY = fnv("vault")
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}, {"id": 2, "parentId": 1, "secret": True, "key": KEY, "gate": "m-vault"}]
def ms(key, title, reached):
    return {"key": key, "title": title, "perk": "Perk of " + title, "metric": "TRACKS", "label": "tracks", "target": 10, "now": 10 if reached else 3, "reached": reached, "reachedAt": None, "live": True}
def milestones(vault_reached):
    return [ms("m-ring", "Second ring", True), ms("m-vault", "Vault key", vault_reached)]

def click_text(pg, text):
    return pg.evaluate("(t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (!b) return false; b.click(); return true; }", text)
def room(pg):
    return pg.evaluate("() => document.querySelector('[data-testid=room-stage]')?.dataset.room || ''")
def link(pg):
    return pg.evaluate("() => document.querySelector('[data-testid=room-stage]')?.dataset.link || ''")
def card(pg):
    return pg.evaluate("() => { const c = document.querySelector('[data-testid=milestone-card]'); return c ? { key: c.dataset.key, reached: c.dataset.reached } : null; }")

def session(pw, visits, vault_reached):
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 1100, "height": 760}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(visits))});")
    def handle(route):
        key = route.request.url.replace(BASE, "").split("?")[0]
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/chart": return ok(NODES)
        if key == "/api/milestones": return ok(milestones(vault_reached))
        if key == "/api/branches/core/albums" or key == "/api/branches/vault/albums": return ok([])
        if key == "/api/branches/core": return ok({"id": 1, "slug": "core", "name": "Core", "description": "d", "coverArtUrl": None, "parentId": None, "channel": None})
        if key == "/api/branches/vault": return ok({"id": 2, "slug": "vault", "name": "Vault", "description": "d", "coverArtUrl": None, "parentId": 1, "channel": None})
        if key == "/api/home": return ok({"branches": [{"slug": "core", "name": "Core", "tracks": 2, "albums": 1, "parentSlug": None}], "activity": [], "stats": {"members": 3, "tracks": 2, "studies": 0, "branches": 1}})
        if key.startswith("/api/room-doc/"): return ok({"version": 0, "doc": {"v": 1, "version": 0, "actors": [], "wires": []}})
        if key == "/api/rooms/online": return ok({"total": 0, "rooms": 0})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.wait_for_selector("[data-testid=room-stage]", timeout=8000)
    pg.wait_for_timeout(900)
    return b, ctx, pg, errs

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)

    # run 1: the vault is not found yet, and its milestone is reached: the door stays shut, and it names the milestone
    b, ctx, pg, errs = session(pw, ["core"], True)
    check(pg.locator("button", has_text="Walk up to: Vault key").count() == 1, "the sealed door shows the milestone that opens it")
    check(click_text(pg, "Walk up to: Vault key"), "walk up to the sealed door")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(300)
    c = card(pg)
    check(c == {"key": "m-vault", "reached": "1"}, f"using the sealed door shows its milestone card ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(not link(pg).startswith("vault"), "a room not found yet does not open, even with its milestone reached")
    check(not errs, f"no page errors in run 1 ({errs[:3]})")
    ctx.close(); b.close()

    # run 2: found, milestone not reached: shut, the card shows the progress
    b, ctx, pg, errs = session(pw, ["core", "vault"], False)
    check(click_text(pg, "Walk up to: Vault key"), "walk up to the sealed door (found, not yet opened)")
    pg.wait_for_timeout(200); pg.keyboard.press("KeyF"); pg.wait_for_timeout(300)
    c = card(pg)
    check(c == {"key": "m-vault", "reached": "0"}, f"found but not opened: the card shows the milestone not reached ({c})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(not link(pg).startswith("vault"), "no corridor opens while the milestone is unreached")
    ctx.close(); b.close()

    # run 3: found and reached: the door opens, and walking in takes you to the Vault
    b, ctx, pg, errs = session(pw, ["core", "vault"], True)
    check(pg.locator("button", has_text="Face the door to Vault").count() == 1, "found and reached: the door is lit to the Vault")
    check(click_text(pg, "Walk up to: Vault"), "walk up to the open door")
    pg.wait_for_timeout(300); pg.keyboard.press("KeyF"); pg.wait_for_timeout(1200)
    if room(pg) != "vault": pg.keyboard.press("KeyF")   # a room that is not loaded yet takes a second use
    opened = False
    for _ in range(20):
        pg.wait_for_timeout(300)
        if room(pg) == "vault" or link(pg).startswith("vault"): opened = True; break
    check(opened, f"using the open door takes you to the Vault (room {room(pg)!r}, link {link(pg)!r})")
    entered = room(pg) == "vault"
    if not entered:
        pg.keyboard.down("KeyW")
        for _ in range(40):
            pg.wait_for_timeout(300)
            if room(pg) == "vault": entered = True; break
        pg.keyboard.up("KeyW")
    check(entered, f"you are in the Vault (room {room(pg)!r})")
    check(not errs, f"no page errors in run 3 ({errs[:3]})")
    ctx.close(); b.close()

    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
