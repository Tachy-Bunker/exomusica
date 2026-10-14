import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])
def M(reached): return [{"key": "m-jam", "title": "Jam grows", "perk": "x", "metric": "COMMUNITYALBUMS", "label": "albums", "target": 50, "now": 60 if reached else 5, "reached": reached, "reachedAt": None, "live": True}]
STATE = {"tempo": 100, "root": 110, "scale": "minor-pent", "swing": 0, "steps": [[1,0,0,0]*4, [0,0,1,0]*4, [0]*16, [0]*16], "muted": [False]*4, "epoch": 0}
FAKE_WS = """
(()=>{ class W { constructor(u){ this.readyState=0; this.onmessage=null; this.onclose=null; this.onopen=null; setTimeout(()=>{ this.readyState=1; this.onopen&&this.onopen({});
  if(String(u).includes('/ws/jam'))this.onmessage&&this.onmessage({data:JSON.stringify({type:'state',state:%s,members:['tachy','neo','guest-1234'],now:Date.now(),you:'tachy',guest:false,chat:[]})}); },20);} send(){} close(){} addEventListener(){} removeEventListener(){} }
  W.OPEN=1; W.CONNECTING=0; W.CLOSED=3; window.WebSocket=W; })();
""" % json.dumps(STATE)
def run(playwright):
    browser = playwright.chromium.launch(); out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m)
    def mk(reached):
        st = {"album": None, "track": 0}
        ctx = browser.new_context(viewport={"width": 1100, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        ctx.add_init_script(FAKE_WS)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/milestones": return ok(M(reached))
            if key == "/api/jam/rooms": return ok([{"code": "ABCD", "people": 7, "max": 8, "tempo": 100, "full": False}])
            if key == "/api/community-albums" and req.method == "POST": st["album"] = json.loads(req.post_data); return ok({"id": 9, "slug": "jam-abcd-draft"}, 201)
            if key == "/api/community-albums/9/tracks" and req.method == "POST": st["track"] += 1; st["size"] = len(req.post_data_buffer or b""); return ok({"id": 1}, 201)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok([])
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: "sandboxed" in str(e) or "volume" in str(e) or errs.append(str(e)))
        return pg, st, errs
    pg, st, errs = mk(True)
    pg.goto(f"{BASE}/jam"); pg.wait_for_selector("[data-testid=jam-open-room]")
    check("7/8" in pg.inner_text("[data-testid=jam-open-room]"), "The open list shows the room's real size (7/8)")
    pg, st, errs = mk(False)
    pg.goto(f"{BASE}/jam/ABCD"); pg.wait_for_selector("[data-testid=jam-room]"); pg.wait_for_timeout(500)
    check(pg.locator("[data-testid=jam-print]").count() == 0, "Locked: no print button")
    pg, st, errs = mk(True)
    pg.goto(f"{BASE}/jam/ABCD"); pg.wait_for_selector("[data-testid=jam-print]")
    pg.click("[data-testid=jam-print]"); pg.wait_for_url(re.compile(r".*/community-album/jam-abcd-draft"), timeout=20000)
    check(st["album"] and st["album"]["title"] == "Jam ABCD (draft)" and "tachy, neo, guest-1234" in st["album"]["description"], f"Creates the album, crediting the room {st['album']}")
    check(st["track"] == 1 and st["size"] > 100000, f"Uploads the rendered loop once ({st.get('size')} bytes)")
    check(not errs, f"No page errors {errs[:1]}")
    print(f"\n{sum(out)}/{len(out)} passed"); sys.exit(0 if all(out) else 1)
with sync_playwright() as p: run(p)
