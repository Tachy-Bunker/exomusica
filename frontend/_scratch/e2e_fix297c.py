import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix297c.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
src281 = open(__file__.replace("e2e_fix297c.py", "e2e_fix281.py")).read()
exec(src281[src281.index("def S("):src281.index("traces = []")])
AROUND["study:mine-1"]["context"].append(wire("wiki", "notes", "Field notes", "in the Log"))
DATA["/api/wiki/start"] = {"slug": "start", "title": "Start here", "contentMarkdown": "hi", "parent": None, "children": [], "breadcrumbs": []}
def M(i, text):
    return {"id": i, "channelId": 1, "authorId": 2, "authorUsername": "ghost9", "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
DATA["/api/channels/hall"] = {"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1}
DATA["/api/channels/hall/messages"] = [M(1, "alpha"), M(2, "beta ✦ [Granular ice](http://localhost:4173/study/other-1)"), M(3, "gamma")]
DATA["/api/channels/hall/archive"] = []
DATA["/api/channels/hall/follow"] = {"following": False}
TRAIL = [{"type": "wiki", "id": "start", "title": "Start here", "href": "/wiki/start"}]

for sl, nm in (("den", "The Den"), ("lab", "The Lab")):
    DATA[f"/api/channels/{sl}"] = {"name": nm, "font": None, "slug": sl, "kind": "DISCUSSION", "id": 5}
    DATA[f"/api/channels/{sl}/messages"] = [M(1, "x")]; DATA[f"/api/channels/{sl}/archive"] = []; DATA[f"/api/channels/{sl}/follow"] = {"following": False}
def dockstate(slug="hall", name="The Hall", presets=None, recents=None):
    return json.dumps({"state": {"openChannelSlug": slug, "openChannelName": name, "openBranchSlug": None, "collapsed": False, "width": 520, "recents": recents or [], "presets": presets or [None]*6}, "version": 0})

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(w, h, trail=True, dock=None):
        ctx = browser.new_context(viewport={"width": w, "height": h})
        init = f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});"
        if trail: init += f" if (!sessionStorage.getItem('exomusica_trail_v1')) sessionStorage.setItem('exomusica_trail_v1', {json.dumps(json.dumps(TRAIL))});"
        if dock: init += f" if (!localStorage.getItem('exomusica_chat_dock')) localStorage.setItem('exomusica_chat_dock', {json.dumps(dock)});"
        ctx.add_init_script(init)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if path.startswith("/api/atlas/around"):
                k = re.search(r"key=([^&]+)", path).group(1).replace("%3A", ":"); a = AROUND.get(k)
                return ok(a or {"error": "nf"}, 200 if a else 404)
            if path.startswith("/api/atlas/trace"): return route.fulfill(status=204, body="")
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    ctx = new_ctx(1440, 900, dock=dockstate(presets=[{"slug": "den", "name": "The Den"}, None, None, None, None, None])); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=dial]")
    page.locator("body").click(position={"x": 5, "y": 5}); page.keyboard.press("q"); page.wait_for_timeout(300)
    opened = page.locator("[data-testid=rooms]").count()
    check(opened >= 1, "Q opens the room switcher on an ordinary page")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.evaluate("document.documentElement.setAttribute('data-wasd','1')")
    page.keyboard.press("q"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=rooms]").count() == 0, "AZERTY: with a map active (ZQSD walking), Q does not open the switcher")
    page.evaluate("document.documentElement.removeAttribute('data-wasd')")
    ctx.close()

    ctx = new_ctx(1440, 900, trail=False); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=soundbay-page]")
    check(page.locator("[data-testid=create-playlist]").count() == 1 and page.locator("[data-testid=create-album]").count() == 1, "Soundbay: a Create button beside Playlists and Community albums")
    page.click("[data-testid=create-playlist]"); check(page.locator("[data-testid=create-playlist-form]").count() == 1, "Soundbay: Create opens the name box")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
