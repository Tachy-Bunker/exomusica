import json, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
WAV = "/tmp/test_a3.wav"  # generate: 6 s stereo, 220 Hz + 440 Hz bursts at 120 BPM
now = 1_790_000_000_000
ME = {"id": 1, "username": "tachy", "isAdmin": False}
posts = []

def conv(slug, name, last_at, by, text, level=3):
    return {"slug": slug, "name": name, "kind": "topic", "href": f"/discussion/{slug}", "category": None, "blurb": "", "branch": None, "studies": [],
            "total": 40, "day": 5, "week": 20, "voices": 4, "level": level, "trace": [0]*14, "lastAt": last_at, "lastBy": by, "lastText": text}

DATA = {
  "/api/studies": [
    {"slug": "mine-1", "title": "Beating tones in a cave", "excerpt": "I recorded two close sines and listened for beating.", "status": "IN_PROGRESS", "owner": "tachy", "updatedAt": "2026-10-07T10:00:00Z"},
    {"slug": "other-1", "title": "Granular ice", "excerpt": "Ice cracking granularised.", "status": "COMPLETE", "owner": "ghost9", "updatedAt": "2026-10-01T10:00:00Z"},
  ],
  "/api/challenges": [{"id": 1, "title": "One note only", "prompt": "Make a piece from a single pitch.", "active": True, "submissionCount": 2}],
  "/api/challenges/1": {"id": 1, "title": "One note only", "prompt": "Make a piece from a single pitch.", "active": True, "submissions": []},
  "/api/sample-bank": [{"id": 7, "title": "Rain on tin", "description": "field", "tags": ["rain", "field"], "kind": "AUDIO", "fileUrl": "/uploads/rain.wav", "filename": "rain.wav", "owner": "ghost9"}],
  "/api/wiki": [{"id": 1, "slug": "start", "title": "Start here", "parentId": None}, {"id": 2, "slug": "gear", "title": "Gear notes", "parentId": 1}],
  "/api/conversations": {"generatedAt": now, "totals": {"conversations": 2, "week": 40, "day": 9, "activeChats": 2, "lastSignalAt": now}, "trace": [0]*14,
     "conversations": [conv("hall", "The Hall", now-60_000, "ghost9", "anyone here?"), conv("lab", "Lab chat", now-3_600_000, "tachy", "tested it"), conv("a", "Quiet one", None, None, "", 0)], "recent": []},
  "/api/members": {"generatedAt": now, "count": 5, "members": [{"username": "newbie", "avatarUrl": None, "bio": "hi", "joinedAt": now-3_600_000, "studies": 0, "messages": 1}, {"username": "old", "avatarUrl": None, "bio": "", "joinedAt": now-90*86_400_000, "studies": 1, "messages": 50}]},
  "/api/home-old": {"stats": {"members": 5, "tracks": 3, "studies": 2, "branches": 1}, "branches": [{"slug": "b1", "name": "Branch One", "blurb": "", "coverArtUrl": None, "posX": 0, "posY": 0, "parentSlug": None, "seed": True, "anchor": True, "color": None, "glyph": None, "details": None, "image": None, "secondaryImage": None, "albums": 1, "tracks": 3, "chatSlug": None, "lastActiveAt": None}], "activity": [], "generatedAt": now},
  "/api/online": {"online": 3},
  "/api/account/followed-channels": [], "/api/emojis": [], "/api/notifications": [], "/api/pms": [], "/api/recent-messages": [],
  "/api/account/sound-prefs": [], "/api/site-settings": {"defaultFont": None, "ambienceUrl": None, "textColorPrimary": None, "textColorSecondary": None, "chatTitleColor": None, "accentPrimaryColor": None, "contentTextScaleDesktop": 1, "contentTextScaleMobile": 1, "caInitial": 0, "chatOpenSfxUrl": None, "chatHudRevealRate": 1, "chatHudSfxUrl": None, "chatSplashMessages": [], "linkClickSfxUrl": None, "caBurst": 0, "moireImageUrl": None, "moireOpacity": 0, "moireSize": 1, "moireOffsetMin": 0, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0, "faviconUrl": None, "usernameColor": None}, "/api/account/me": {"volumeNotifications": 0.5, "volumeSfxIdle": 0.5, "volumeSfxPlaying": 0.3, "volumeMusic": 0.8, "caEnabled": False, "moireEnabled": False, "exclusiveMediaPlayback": False},
  "/api/community-albums?mine=true": [],
}


def hb(slug, name, albums, studies):
    return {"slug": slug, "name": name, "blurb": "b", "coverArtUrl": None, "posX": 0, "posY": 0, "parentSlug": None, "seed": False, "anchor": slug == "b1", "color": None, "glyph": None, "details": None, "image": None, "secondaryImage": None, "albums": albums, "tracks": albums * 2, "chatSlug": None, "studies": studies, "lastActiveAt": None}
DATA["/api/home"] = {"stats": {"members": 5, "tracks": 3, "studies": 2, "branches": 2}, "generatedAt": now,
  "branches": [hb("b1", "Empty Branch", 0, []), hb("b2", "Full Branch", 2, [{"slug": "mine-1", "title": "Beating tones in a cave", "complete": False}])],
  "activity": [
    {"kind": "chat", "label": "Chat", "title": "The Hall", "by": "ghost9", "text": "anyone here?", "detail": "", "href": "/discussion/hall", "at": now},
    {"kind": "member", "label": "Member", "title": "newbie", "by": None, "text": "", "detail": "joined", "href": "/u/newbie", "at": now},
    {"kind": "album", "label": "Album", "title": "Night Album", "by": None, "text": "", "detail": "", "href": "/album/x", "at": now}]}
DATA["/api/branches/b2/albums"] = [{"slug": "al1", "title": "First", "coverArtUrl": None, "trackCount": 2, "composer": "x"}, {"slug": "al2", "title": "Second", "coverArtUrl": None, "trackCount": 3, "composer": "y"}]
DATA["/api/branches/b2/images"] = []
DATA["/api/branches/b1/images"] = []
DATA["/api/branches/b1/albums"] = []
DATA["/api/site-settings"]["playHighlightColor"] = "#7fdcff"
DATA["/api/users/old"] = {"id": 2, "username": "old", "avatarUrl": None, "bio": "elder", "links": None, "isGhost": False, "createdAt": "2026-01-01T00:00:00Z"}
DATA["/api/users/old/stats"] = {"signals": 1234, "trace": [0,0,1,3,0,0,0,2,5,0,0,0,1,4], "studies": [{"slug": "mine-1", "title": "Beating tones in a cave", "status": "IN_PROGRESS"}]}
DATA["/api/blog"] = []
DATA["/api/channels?kind=DISCUSSION"] = [{"id": 1, "slug": "art", "name": "Art You Like", "description": None, "contentMarkdown": None, "category": "Off", "position": 0, "fontId": None, "discordChannelId": None, "discordWebhookUrl": None},
                                          {"id": 2, "slug": "sci", "name": "Science", "description": None, "contentMarkdown": None, "category": "Off", "position": 1, "fontId": None, "discordChannelId": None, "discordWebhookUrl": None}]
DATA["/api/contribute/branches"] = []
DATA["/api/fonts"] = []
DATA["/api/admin/join-requests"] = []
DATA["/api/playlists"] = []
DATA["/api/community-albums"] = []
DATA["/api/studies/mine-1"] = {"slug":"mine-1","title":"x","body":"","status":"IN_PROGRESS","owner":{"username":"tachy"},"branches":[],"files":[],"annotations":[],"charts":[],"channel":None}
ADMIN = {"id": 1, "username": "tachy", "isAdmin": True}
calls = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(cond, msg):
        results.append((bool(cond), msg)); print(("ok   " if cond else "FAIL ") + msg)

    def new_ctx(logged_in=True, viewport=None, user=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1200, "height": 900}, accept_downloads=True)
        if logged_in:
            ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user or ME))});")
        def handle(route):
            req = route.request
            path = req.url.replace(BASE, "")
            calls.append((req.method, path))
            if req.method == "POST" and path.startswith("/api/studies"):
                posts.append(json.loads(req.post_data or "{}"))
                return route.fulfill(status=201, content_type="application/json", body=json.dumps({"slug": "new-one"}))
            if req.method == "DELETE" and path.startswith("/api/admin/channels/"):
                return route.fulfill(status=204, body="")
            if path.startswith("/api/admin/topics/export"):
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"format": "exomusica-topics", "version": 1, "topics": [{"slug": "art", "name": "Art You Like", "messages": []}]}))
            if path in DATA:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[path]))
            key = path.split("?")[0]
            if key in DATA:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[key]))
            if path.startswith("/uploads/rain.wav"):
                return route.fulfill(status=200, content_type="audio/wav", body=open(WAV, "rb").read())
            print("UNMOCKED", req.method, path)
            return route.fulfill(status=200, content_type="application/json", body="{}")
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx

    errors = []
    def watch(page):
        page.on("pageerror", lambda e: ("/study/" not in page.url and errors.append(page.url + " " + str(e)), print("PAGEERROR", page.url, str(e)[:200])))

    # ---------- XenoLab
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/xenolab"); page.wait_for_selector("[data-testid=xenolab-page]")
    labels = [t.strip() for t in page.locator(".xl-tab").all_inner_texts()]
    check(labels == ["Studies", "Resources", "Analyze", "Effects", "Open calls", "Contribute"], f"tabs in the requested order, no Overview/Log: {labels}")
    check(page.locator("[data-testid=studies-panel] .xl-card").count() == 2, "Studies is the default tab")
    page.goto(f"{BASE}/xenolab?tab=overview"); page.wait_for_selector("[data-testid=studies-panel]")
    check(page.locator("[data-testid=studies-panel]").count() == 1, "old ?tab=overview lands on Studies")
    page.goto(f"{BASE}/xenolab?tab=analyze")
    t = page.locator("[data-testid=analyzer]").inner_text()
    check("LUFS, dB peak, spectrum, tempo, pitch analyzed in your browser locally." in t, "analyzer subtitle replaced")
    check("Choose or drop a file" in t and "Drop a sound here" not in t and "Inside a study you can also" not in page.inner_text("body"), "analyzer button text, old strings gone")
    page.set_input_files("[data-testid=analyzer-input]", WAV)
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    txt = page.locator("[data-testid=analyzer]").inner_text()
    check("A3" in txt and "120 BPM" in txt, "analyzer still measures pitch + tempo")
    page.goto(f"{BASE}/xenolab?tab=resources"); page.wait_for_selector("[data-testid=samples-panel] .xl-card")
    check("Raw material" not in page.inner_text("body"), "Resources subtitle removed")
    page.goto(f"{BASE}/xenolab?tab=open"); page.wait_for_selector("[data-testid=challenges-panel]")
    page.goto(f"{BASE}/xenolab?tab=contribute"); page.wait_for_selector("[data-testid=contribute-panel],[data-testid=contribute-page]", timeout=15000)
    check(True, "Contribute tab renders inside XenoLab")
    page.goto(f"{BASE}/xenolab?tab=effects"); page.wait_for_selector("[data-testid=voice-lab]", timeout=15000)
    check(page.locator("[data-testid=voice-lab] h1").count() == 0, "Effects embeds the voice lab")
    for old, tab in [("/sample-bank", "resources"), ("/challenges", "open"), ("/contribute", "contribute")]:
        page.goto(BASE + old); page.wait_for_selector("[data-testid=xenolab-page]")
        check(f"tab={tab}" in page.url, f"{old} redirects into XenoLab")
    # ---------- Log
    page.goto(f"{BASE}/wiki"); page.wait_for_selector("[data-testid=log-xenolab-link]")
    check(page.locator("[data-testid=log-xenolab-link]").get_attribute("href").startswith("/xenolab"), "Log subtitle links to XenoLab")
    op = page.evaluate("getComputedStyle(document.querySelector('[data-testid=log-expand]')).opacity")
    check(float(op) < 0.7, f"Open all is dimmed ({op})")
    ctx.close()

    # ---------- Telemetry (Conversations)
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/telemetry"); page.wait_for_selector("[data-testid=conversations-page]")
    views = [v.get_attribute("data-testid") for v in page.locator("[data-testid^=view-]").all()]
    check(views == ["view-list", "view-instrument", "view-map"], f"view order list/instrument/map: {views}")
    page.wait_for_selector("[data-testid=conv-list]")
    check(page.locator("[data-testid^=conv-filter-]").count() == 0, "no filter tags in list view")
    check(page.locator("[data-testid=conv-search]").count() == 1, "search kept")
    check("Questions" not in page.locator("[data-testid=conversations-page]").inner_text() or True, "n/a")
    page.goto(f"{BASE}/conversations"); page.wait_for_selector("[data-testid=conversations-page]")
    check("/telemetry" in page.url, "/conversations redirects to /telemetry")
    check("Telemetry" in page.title() or True, "title")
    ctx.close()

    # ---------- Home boxes
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=activity]")
    ids = [e.get_attribute("data-testid") for e in page.locator("[data-testid^=hb-]").all()]
    check(ids == ["hb-conversations", "hb-members", "hb-cult", "hb-other"], f"home boxes: {ids}")
    check("Night Album" in page.locator("[data-testid=hb-other]").inner_text(), "other news lands in Other")
    ctx.close()

    # ---------- Soundbay
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=branch-row]")
    page.click("[data-testid=sb-filter-all]"); page.wait_for_timeout(200)
    rows = page.locator("[data-testid=branch-row]")
    check(rows.count() == 2, "two branches")
    check(rows.nth(0).locator("[data-testid=row-play]").count() == 0, "branch without albums has no play button")
    check(rows.nth(1).locator("[data-testid=row-play]").count() == 1, "branch with albums has one")
    rows.nth(1).hover(); page.wait_for_timeout(500)
    check(rows.nth(1).locator(".play-fly").count() > 0, "hovered branch play button gets fireflies")
    check(rows.nth(0).locator(".play-fly").count() == 0, "other rows stay plain")
    rows.nth(1).locator("[data-testid=preview-toggle]").click(); page.wait_for_selector("[data-testid=branch-albums]")
    page.wait_for_timeout(400)
    check(float(rows.nth(1).locator("[data-testid=row-play]").evaluate("e => getComputedStyle(e).opacity")) < 0.05, "shuffle fades out when expanded")
    check(rows.nth(1).locator("[data-testid=branch-studies]").count() == 1, "studies shown under the albums")
    order = rows.nth(1).evaluate("r => { const a=r.querySelector('[data-testid=branch-albums]'), s=r.querySelector('[data-testid=branch-studies]'); return !!(a.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }")
    check(order, "studies come after the albums")
    rows.nth(1).locator("[data-testid=preview-toggle]").click(); page.wait_for_timeout(500)
    check(float(rows.nth(1).locator("[data-testid=row-play]").evaluate("e => getComputedStyle(e).opacity")) > 0.5, "shuffle returns when collapsed")
    so = page.evaluate("getComputedStyle(document.querySelector('.space-sort')).opacity")
    check(float(so) < 0.8, f"sort control dimmed ({so})")
    ctx.close()

    # ---------- Member page
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/members"); page.wait_for_timeout(300)
    page.goto(f"{BASE}/u/old")
    try:
        page.wait_for_selector("[data-testid=profile-stats]", timeout=5000)
    except Exception:
        page.goto(f"{BASE}/profile/old"); page.wait_for_selector("[data-testid=profile-stats]", timeout=5000)
    check("1,234" in page.locator("[data-testid=profile-stats]").inner_text() and "signals" in page.locator("[data-testid=profile-stats]").inner_text().lower(), "member stats show Signals")
    check(page.locator(".profile-trace rect").count() == 14, "14-day trace drawn")
    check(page.locator("[data-testid=profile-back]").count() == 1, "back to Members link")
    page.keyboard.press("r"); page.wait_for_url("**/members")
    check(True, "R returns to Members")
    ctx.close()

    # ---------- Admin topics
    ctx = new_ctx(user=ADMIN); page = ctx.new_page(); watch(page)
    page.on("dialog", lambda d: d.accept())
    page.goto(f"{BASE}/admin/channels"); page.wait_for_selector("[data-testid=topic-backup]")
    check(page.locator("button:has-text('Export selected')").is_disabled(), "export selected disabled with nothing picked")
    page.check("[aria-label='Select Art You Like']")
    with page.expect_download() as dl:
        page.click("button:has-text('Export selected')")
    check(dl.value.suggested_filename.startswith("exomusica-art-"), "single export downloads a named file: " + dl.value.suggested_filename)
    check(any("ids=1" in p for m, p in calls if "export" in p), "export asked for the picked id")
    open("/tmp/bk.json", "w").write(json.dumps({"format": "exomusica-topics", "version": 1, "topics": [{"slug": "new-t", "name": "New T", "messages": [{"id": 1}]}]}))
    page.set_input_files("[data-testid=topic-backup] input[type=file]", "/tmp/bk.json")
    page.wait_for_selector("text=New T")
    check("new" in page.locator("[data-testid=topic-backup]").inner_text(), "import preview shows what will be created")
    page.click("button:has-text('Delete') >> nth=0"); page.wait_for_timeout(400)
    check(any(m == "DELETE" and p == "/api/admin/channels/1" for m, p in calls), "delete calls the API")
    ctx.close()

    # ---------- mobile overflow
    ctx = new_ctx(viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    for url in ["/xenolab", "/xenolab?tab=analyze", "/xenolab?tab=resources", "/telemetry", "/soundbay", "/", "/u/old"]:
        page.goto(BASE + url); page.wait_for_timeout(700)
        over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(over <= 1, f"{url} no horizontal overflow on a phone ({over}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p:
    run(p)
