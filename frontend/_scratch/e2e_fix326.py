import json, re, sys, os, struct
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
def wav():
    n = 2000; data = b"".join(struct.pack("<h", int(8000 * ((i % 40) / 40 - .5))) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16) + b"data" + struct.pack("<I", len(data)) + data
JURLS = {"firstScan": "/uploads/j1.wav", "firstListen": "/uploads/j2.wav"}
server = {"done": ["firstScan"]}; posts = []; deletes = []
def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        init = "localStorage.setItem('exomusica_classic','0');localStorage.setItem('exomusica_jingles','1'); window.__starts=0; const o=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(){window.__starts++; return o.apply(this,arguments)};"
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.endswith(".wav"): return route.fulfill(status=200, content_type="audio/wav", body=wav())
            if key == "/api/site-settings": return ok({"jingleUrls": JURLS})
            if key == "/api/account/jingles-done":
                if req.method == "POST": e = json.loads(req.post_data)["event"]; posts.append(e); server["done"] = sorted(set(server["done"] + [e])); return ok({"done": server["done"]})
                if req.method == "DELETE": deletes.append(1); server["done"] = []; return ok({"done": []})
                return ok({"done": server["done"]})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("volume" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    fire = lambda pg, ev: pg.evaluate("(e) => window.dispatchEvent(new CustomEvent('exo:jingle', {detail: e}))", ev)
    a = mk(ME); a.goto(f"{BASE}/"); a.wait_for_timeout(1500)
    check(set(json.loads(a.evaluate("localStorage.getItem('exomusica_jingles_done')") or "[]")) == {"firstScan"}, "Login pulls what the account has already heard (on another device)")
    fire(a, "firstScan"); a.wait_for_timeout(500)
    check(a.evaluate("window.__starts") == 0, "…so that jingle stays quiet here")
    fire(a, "firstListen"); a.wait_for_timeout(700)
    check(a.evaluate("window.__starts") >= 1 and posts == ["firstListen"], f"A new one plays and is reported to the account {posts}")
    fire(a, "firstListen"); a.wait_for_timeout(400); n = a.evaluate("window.__starts")
    fire(a, "firstListen"); a.wait_for_timeout(400)
    check(a.evaluate("window.__starts") == n and posts == ["firstListen"], "Only once")
    # local-only knowledge is pushed up
    b = mk(ME); b.add_init_script("localStorage.setItem('exomusica_jingles_done', JSON.stringify(['firstReply']))"); server["done"] = []; posts.clear()
    b.goto(f"{BASE}/"); b.wait_for_timeout(1500)
    check(posts == ["firstReply"], f"What only this device had heard is sent up {posts}")
    # forget
    b.goto(f"{BASE}/account"); b.wait_for_selector("[data-testid=jingle-forget]"); b.click("[data-testid=jingle-forget]"); b.wait_for_timeout(400)
    check(deletes == [1] and b.evaluate("localStorage.getItem('exomusica_jingles_done')") in (None, ""), "'Let me hear them again' clears the account's list too")
    # guest
    posts.clear(); g = mk(None); g.goto(f"{BASE}/"); g.wait_for_timeout(800); fire(g, "firstScan"); g.wait_for_timeout(600)
    check(g.evaluate("window.__starts") >= 1 and posts == [], "Guests: plays once from this browser only, nothing sent")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
