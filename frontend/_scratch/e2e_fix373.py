import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
NODES = [{"id": 1, "parentId": None, "slug": "core", "name": "Core"}]
for i in range(2, 6): NODES.append({"id": i, "parentId": 1, "slug": f"b{i}", "name": f"Branch {i}"})
NODES += [{"id": 6, "parentId": 2, "slug": "b6", "name": "Deep six"}, {"id": 7, "parentId": 2, "slug": "b7", "name": "Deep seven"}]
NODES.append({"id": 8, "parentId": 2, "secret": True, "key": "zz"})
HOME = {"branches": [{"slug": n["slug"], "name": n["name"], "tracks": 12, "albums": 2} for n in NODES if not n.get("secret")], "activity": [], "stats": {}}
ALBUM_FULL = {"id": 1, "slug": "alb-one", "title": "Album One", "composer": "Ann", "coverArtUrl": None, "description": None, "contentMarkdown": None, "links": [], "gallery": [], "branch": {"slug": "core", "name": "Core"}, "collaborators": [], "tracks": [{"id": 11, "title": "First Light", "fileUrl": "/uploads/a.mp3", "format": "mp3", "durationSeconds": 125, "position": 1, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}, {"id": 12, "title": "Second Wind", "fileUrl": "/uploads/b.mp3", "format": "mp3", "durationSeconds": 61, "position": 2, "albumTitle": "Album One", "albumSlug": "alb-one", "coverArtUrl": None, "composer": "Ann", "branchSlug": "core", "bookmarks": [], "replayGainDb": None, "source": "official", "composers": []}]}
ALBUMS = [{"id": 1, "slug": "alb-one", "title": "Album One", "composer": "x", "coverArtUrl": None, "previewTrack": None}, {"id": 2, "slug": "alb-two", "title": "Album Two", "composer": "x", "coverArtUrl": None, "previewTrack": None}]

def run(pw):
    b = pw.chromium.launch(args=["--js-flags=--expose-gc"]); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(touch=False, vis=("core",), size=(1100, 760)):
        ctx = b.new_context(viewport={"width": size[0], "height": size[1]}, service_workers="block", has_touch=touch, is_mobile=touch)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_visits', {json.dumps(json.dumps(list(vis)))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            if key in ("/api/auth/me", "/api/auth/session"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"user": ADMIN}))
            ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
            if key == "/api/chart": return ok(NODES)
            if key == "/api/home": return ok(HOME)
            if key == "/api/milestones": return ok([{"key": "m-ring", "title": "Second ring", "perk": "x", "metric": "BRANCHES", "label": "b", "target": 20, "now": 30, "reached": True, "reachedAt": None, "live": True}])
            if key == "/api/albums/alb-one": return ok(ALBUM_FULL)
            m = re.match(r"^/api/branches/([^/]+)/albums$", key)
            if m: return ok(ALBUMS)
            m = re.match(r"^/api/branches/([^/]+)$", key)
            if m:
                n = next((x for x in NODES + [{"id": 99, "slug": "solo", "name": "Solo", "parentId": None}] if x.get("slug") == m.group(1)), None)
                if not n: return ok({"error": "nope"}, 404)
                return ok({"id": n["id"], "slug": n["slug"], "name": n["name"], "description": "d", "coverArtUrl": None, "parentId": n["parentId"], "channel": {"id": 9, "slug": "chat-" + n["slug"]}})
            if key in ("/api/channels/chat-b2/messages", "/api/channels/chat-b2/archive", "/api/emojis", "/api/recent-messages", "/api/online") or key.endswith("/participants") or key.endswith("/messages"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or errs.append(str(e)))
        return pg, errs

    S = "[data-testid=room-stage]"
    at = lambda pg, k: float(pg.get_attribute(S, "data-" + k))
    def walk(pg, key, ms): pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
    drone = lambda pg: pg.get_attribute(S, "data-drone") or ""
    xy = lambda s: tuple(int(v) for v in s.split(","))
    pg, errs = mk()
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)
    pg.goto(f"{BASE}/branch/core/room"); pg.locator(S).wait_for(); pg.wait_for_timeout(600)
    pg.evaluate("[...document.querySelectorAll('[data-prop]')].find(e=>e.dataset.prop==='a:alb-one').click()"); pg.wait_for_timeout(250)
    pg.keyboard.press("KeyF"); pg.locator("[data-testid=terminal-play]").wait_for(); pg.click("[data-testid=terminal-play]"); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 1. Expanding the docked player inside a room: the expanded player is the top element and stays visible
    t = pg.query_selector(".player-bar-docked .track-info") or pg.query_selector(".player-cover")
    check(t is not None, "The docked player is on screen inside the room")
    bb = t.bounding_box() if t else None
    on_top = False
    if bb:
        x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        pg.mouse.click(x, y); pg.wait_for_timeout(500)
        on_top = pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return !!e&&!!e.closest('.player-expanded-overlay')}", [x, y])
    check(pg.query_selector(".player-expanded-overlay") is not None and on_top, "Clicking the player in a room opens the expanded player on top of the room")
    check(pg.evaluate("(()=>{const o=document.querySelector('.player-expanded-overlay');if(!o)return false;const r=o.getBoundingClientRect();return r.width>0&&r.height>0})()"), "The expanded player has a visible area")
    pg.evaluate("document.querySelector('.player-expanded-overlay')?.click()"); pg.wait_for_timeout(300)
    check(pg.query_selector(".player-expanded-overlay") is None, "Clicking the expanded player again closes it, and the room is still there")

    # 2. Walking through rooms: each hop releases the room it left
    pg.evaluate("()=>{window.__refs=[new WeakRef(document.querySelector('[data-testid=room-stage]'))]}")
    ROOMS = ["b2", "b3", "b4", "b5", "core", "b2", "b3", "b4", "b5", "core", "b2", "b3"]
    pg.evaluate("""async (rooms)=>{
      const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const cur=()=>document.querySelector('[data-testid=room-stage]');
      const hopTo=(s)=>{const a=[...document.querySelectorAll('a[href]')].find(e=>e.hidden&&e.getAttribute('aria-hidden')==='true'); if(a){a.setAttribute('href','/branch/'+s+'/room'); a.click();}};
      for(const r of rooms){ const before=cur(); hopTo(r); for(let i=0;i<100&&(!cur()||cur()===before);i++) await sleep(50); await sleep(500); window.__refs.push(new WeakRef(cur())); }
    }""", ROOMS)
    cg = pg.context.new_cdp_session(pg); cg.send("HeapProfiler.collectGarbage"); cg.send("HeapProfiler.collectGarbage")
    kept = pg.evaluate("window.__refs.filter(r=>{const n=r.deref();return !!n&&!n.isConnected}).length")
    check(kept <= 2, f"After {len(ROOMS)} room hops and a full GC, at most 2 old rooms remain (kept {kept})")
    check(pg.locator("[data-testid=room-stage]").count() == 1, "The current room is still on screen after the hops")
    check(not errs, f"No page errors while walking and expanding the player {errs[:2]}")
    b.close()
    print(f"{sum(out)}/{len(out)} passed" if all(out) else f"FAILED {len(out) - sum(out)}"); sys.exit(0 if all(out) else 1)

with sync_playwright() as p: run(p)
