import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix295.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
src281 = open(__file__.replace("e2e_fix295.py", "e2e_fix281.py")).read()
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
PULSE = {"hall": {"last": 1790000000, "recent": 1, "mentions": 0, "line": {"by": "ana", "text": "meeting at nine"}}, "den": {"last": 1790000100, "recent": 12, "mentions": 2, "line": {"by": "bo", "text": "look at this spectrogram"}}, "lab": {"last": None, "recent": 0, "mentions": 0, "line": None}}
REMOTE = [None]
puts, sent = [], []
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
            if key == "/api/dial/pulse": return ok(PULSE)
            if key == "/api/account/dial" and req.method == "GET": return ok({"dial": REMOTE[0]})
            if key == "/api/account/dial" and req.method == "PUT": puts.append(json.loads(req.post_data)); return ok({"dial": None})
            if re.match(r"/api/channels/[a-z]+/messages$", key) and req.method == "POST": sent.append((key, json.loads(req.post_data))); return ok(M(99, "x"), 201)
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

    PRE = [{"slug": "den", "name": "The Den"}, {"slug": "hall", "name": "The Hall"}, {"slug": "lab", "name": "The Lab"}, None, None, None]
    ctx = new_ctx(1440, 900, dock=dockstate(slug="hall", name="The Hall", presets=PRE)); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=dial-slot]"); page.wait_for_timeout(500)
    heats = page.locator(".dial-slot .dial-lamp").evaluate_all("els => els.map(e => e.dataset.heat)")
    check(heats == ["3", "1", "0"], f"Lamps: heat follows the last half hour ({heats})")
    check(page.locator("[data-testid=dial-ping]").count() == 1, "Ping: a mention in another room lights its slot (not the one you are in)")
    page.locator(".dial-slot").nth(1).hover(); page.locator(".dial-slot").nth(1).locator("[data-testid=dial-sleep]").click()
    check("asleep" in page.locator(".dial-slot").nth(1).get_attribute("class"), "Sleep: the slot dims")
    page.keyboard.press("Alt+BracketLeft"); page.wait_for_timeout(250)
    check("The Den" in page.locator(".dial-slot.on").inner_text(), "Sleep: Alt+[ from the sleeping room goes to the previous slot")
    page.keyboard.press("Alt+BracketRight"); page.wait_for_timeout(250)
    check("The Lab" in page.locator(".dial-slot.on").inner_text(), "Sleep: Alt+] steps over a sleeping room")
    page.locator(".dial-slot").nth(1).locator("[data-testid=dial-sleep]").click()
    page.keyboard.press("Alt+2"); page.wait_for_timeout(250)

    page.evaluate("document.activeElement && document.activeElement.blur()"); page.keyboard.press("q"); page.wait_for_selector("[data-testid=rooms]")
    check(page.locator("[data-testid=rooms-row]").count() == 3, "Rooms: Q lists every room on the dial")
    t = page.locator("[data-testid=rooms]").inner_text()
    check("look at this spectrogram" in t and "meeting at nine" in t and "quiet" in t, "Rooms: the last line said in each")
    page.keyboard.press("ArrowUp"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=rooms]").count() == 0 and "The Den" in page.locator(".dial-slot.on").inner_text(), "Rooms: arrows and Enter tune and close")
    page.keyboard.press("Alt+q"); page.wait_for_selector("[data-testid=rooms]")
    check(True, "Rooms: Alt+Q opens it even while typing")
    page.keyboard.press("2"); page.wait_for_timeout(300)
    check("The Hall" in page.locator(".dial-slot.on").inner_text() and page.locator("[data-testid=rooms]").count() == 0, "Rooms: 1-6 pick a slot")
    page.click("[data-testid=dial-rooms]"); page.wait_for_selector("[data-testid=rooms]"); page.keyboard.press("Escape")
    check(page.locator("[data-testid=rooms]").count() == 0, "Rooms: the rail button opens it, Esc closes")
    page.focus("textarea.hud-reveal-textarea"); page.keyboard.press("q"); page.wait_for_timeout(200)
    check(page.locator("[data-testid=rooms]").count() == 0, "Rooms: Q while typing is just a letter")

    page.fill("textarea.hud-reveal-textarea", "psst from the hall"); page.keyboard.press("Alt+Shift+Enter"); page.wait_for_timeout(500)
    check(sent and sent[-1][0] == "/api/channels/lab/messages" and sent[-1][1]["contentRaw"] == "psst from the hall", "Whisper: Alt+Shift+Enter posts the draft to the next room")
    check(page.locator("textarea.hud-reveal-textarea").input_value() == "" and "The Hall" in page.locator(".dial-slot.on").inner_text(), "Whisper: the draft clears and you stay put")
    page.fill("textarea.hud-reveal-textarea", "second"); page.evaluate("document.activeElement.blur()")
    page.keyboard.press("Alt+q"); page.wait_for_selector("[data-testid=rooms]"); page.locator("[data-testid=room-whisper]").first.click(); page.wait_for_timeout(500)
    check(sent[-1][0] == "/api/channels/den/messages", "Whisper: the arrow on a row sends the draft to that room")

    page.keyboard.press("Alt+q"); page.wait_for_selector("[data-testid=rooms]")
    page.fill("[data-testid=scene-name]", "lab night"); page.click("[data-testid=scene-save]")
    check(page.locator("[data-testid=scene]").count() == 1, "Scenes: save the six slots under a name")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    for _ in range(3):
        page.locator(".dial-slot:not(.empty)").first.hover(); page.locator(".dial-slot:not(.empty)").first.locator(".dial-x:not(.dial-z)").click()
    check(page.locator("[data-testid=dial-slot]").count() == 0, "Scenes: (slots cleared)")
    page.click("[data-testid=dial-rooms]"); page.wait_for_selector("[data-testid=rooms]"); page.click("[data-testid=scene]"); page.keyboard.press("Escape")
    check(page.locator("[data-testid=dial-slot]").count() == 3, "Scenes: loading one puts the slots back")
    page.wait_for_timeout(1700)
    check(puts and len(puts[-1]["scenes"]) == 1 and puts[-1]["presets"][0]["slug"] == "den", "Sync: changes are pushed to the account")

    page.evaluate("""() => { const e = document.querySelector('[data-testid=dial-empty]'); const dt = new DataTransfer(); dt.setData('application/x-exomusica-link', '[Night Shift](http://localhost:4173/topic/night)');
      e.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true})); e.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""")
    page.wait_for_timeout(300)
    check("Night Shift" in page.locator(".dial-slots").inner_text() and page.locator("[data-testid=dial-slot]").count() == 4, "Drop: a topic dragged onto an empty slot pins that room")

    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("room 3"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check("The Lab" in page.locator(".dial-slot.on").inner_text(), "Terminal: room 3")
    page.keyboard.type("scene"); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    check("lab night" in page.locator("[data-testid=terminal-out]").inner_text(), "Terminal: scene lists them")
    page.keyboard.type("room den"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check("The Den" in page.locator(".dial-slot.on").inner_text(), "Terminal: room by name")
    ctx.close()

    REMOTE[0] = {"presets": [{"slug": "lab", "name": "The Lab"}, None, None, None, None, None], "scenes": []}
    ctx = new_ctx(1440, 900, dock=dockstate()); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=dial]"); page.wait_for_timeout(600)
    check(page.locator("[data-testid=dial-slot]").count() == 1 and "The Lab" in page.locator("[data-testid=dial-slot]").inner_text(), "Sync: a new device takes the account's dial")
    ctx.close()

    ctx = new_ctx(390, 800, dock=dockstate()); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_timeout(500); page.keyboard.press("q"); page.wait_for_timeout(200)
    check(page.locator("[data-testid=rooms]").count() == 0, "Phone: no room list on the desktop key")
    ctx.close()

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
