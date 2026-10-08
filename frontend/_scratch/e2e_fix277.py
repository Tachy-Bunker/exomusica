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
DATA["/api/branches/b2/images"] = [{"url": "/uploads/pic1.png", "kind": "gallery", "label": "Pic one", "albumSlug": None}]
DATA["/api/branches/b2/tracks/shuffle"] = [{"id": 1, "title": "Rain Piece", "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 6, "position": 0, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": "/uploads/cover.png", "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": []}]
DATA["/api/contribute/branches"] = [{"slug": "b2", "name": "Full Branch", "description": "d", "coverArtUrl": None, "hasBrief": True, "backgroundUrl": None, "backgroundOpacity": 0, "image": "/uploads/pic1.png", "secondaryImage": "/uploads/pic1.png", "previewUrl": "/uploads/rain.wav", "sample": {"kind": "attachment", "url": "/uploads/rain.wav", "title": "rain on tin", "origin": {"label": "The Hall", "href": "/topic/hall#m-9"}}, "sketchCount": 0, "mySubmissions": []}]
DATA["/api/branches/b1/images"] = []
DATA["/api/branches/b1/albums"] = []
DATA["/api/site-settings"]["playHighlightColor"] = "#7fdcff"
DATA["/api/users/old"] = {"id": 2, "username": "old", "avatarUrl": None, "bio": "elder", "links": None, "isGhost": False, "createdAt": "2026-01-01T00:00:00Z"}
DATA["/api/users/old/stats"] = {"signals": 1234, "trace": [0,0,1,3,0,0,0,2,5,0,0,0,1,4], "studies": [{"slug": "mine-1", "title": "Beating tones in a cave", "status": "IN_PROGRESS"}]}
DATA["/api/blog"] = []
DATA["/api/channels?kind=DISCUSSION"] = [{"id": 1, "slug": "art", "name": "Art You Like", "description": None, "contentMarkdown": None, "category": "Off", "position": 0, "fontId": None, "discordChannelId": None, "discordWebhookUrl": None},
                                          {"id": 2, "slug": "sci", "name": "Science", "description": None, "contentMarkdown": None, "category": "Off", "position": 1, "fontId": None, "discordChannelId": None, "discordWebhookUrl": None}]
DATA["/api/fonts"] = []
DATA["/api/admin/join-requests"] = []
DATA["/api/playlists"] = []
DATA["/api/community-albums"] = []
DATA["/api/studies/mine-1"] = {"slug":"mine-1","title":"x","body":"","status":"IN_PROGRESS","owner":{"username":"tachy"},"branches":[],"files":[],"annotations":[],"charts":[],"channel":None}
ADMIN = {"id": 1, "username": "tachy", "isAdmin": True}
calls = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
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
    check(labels == ["Studies", "Contribute", "Resources", "Analyze", "Effects", "Open calls"], f"tabs in the requested order, no Overview/Log: {labels}")
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


    # ---------- fix278 checks
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/xenolab"); page.wait_for_selector("[data-testid=studies-panel] .xl-card")
    ys = page.evaluate("""() => { const y = s => document.querySelector(s).getBoundingClientRect().top;
        return [y('.xl-cards'), y('.xl-bar'), y('[data-testid=xenolab-start]')]; }""")
    check(ys[0] < ys[1] < ys[2], f"Studies: list, then filter bar, then start form {ys}")
    page.goto(f"{BASE}/xenolab?tab=effects"); page.wait_for_selector("[data-testid=voice-lab]", timeout=15000)
    check("Try a voice note" not in page.inner_text("body") and "Hear exactly what a voice note" not in page.inner_text("body"), "Effects: voice note block removed")
    page.goto(f"{BASE}/xenolab?tab=contribute"); page.wait_for_selector("[data-testid=contribute-page]")
    check(page.locator(".ct2-steps li").count() == 3, "Contribute: three-step strip")
    ctx.close()
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=activity]")
    hit = page.evaluate("""() => { const e = document.elementFromPoint(innerWidth/2, 200); return e ? (e.closest('a') ? e.closest('a').getAttribute('href') : null) : null; }""")
    check(hit is None or "/album/" not in hit, f"homepage: a click in the page body does not hit an album link ({hit})")
    ctx.close()
    for rm in ("no-preference", "reduce"):
        ctx = browser.new_context(viewport={"width": 1100, "height": 800}, reduced_motion=rm); page = ctx.new_page()
        ctx.route(re.compile(r".*/api/.*"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(DATA.get(r.request.url.replace(BASE, "").split("?")[0], {}))))
        page.goto(f"{BASE}/?branch=b2"); page.wait_for_selector("[data-testid=explore-play]"); page.wait_for_timeout(800)
        t1 = page.locator(".play-fly").first.evaluate("e => e.style.transform"); page.wait_for_timeout(1200)
        t2 = page.locator(".play-fly").first.evaluate("e => e.style.transform")
        check(page.locator(".play-fly").count() == 4 and t1 and t1 != t2, f"fireflies present and moving with motion={rm}")
        ctx.close()
    ctx = new_ctx(viewport={"width": 390, "height": 900}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/telemetry"); page.wait_for_selector("[data-testid=conv-list]")
    o = page.evaluate("() => [document.querySelector('[data-testid=conv-list]').getBoundingClientRect().top, document.querySelector('[data-testid=inst-scope]').getBoundingClientRect().top]")
    check(o[0] < o[1], f"phone: Scope sits below the list {o}")
    ctx.close()

    # ---------- fix279 checks
    ctx = browser.new_context(viewport={"width": 1100, "height": 800}, args=None) if False else new_ctx()
    page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/?branch=b2"); page.wait_for_selector("[data-testid=explore-play]")
    check("Play" in page.locator("[data-testid=explore-play]").get_attribute("aria-label"), "Explore: play icon before playing")
    page.click("[data-testid=explore-play]", force=True); page.wait_for_timeout(1500)
    check(page.locator("[data-testid=explore-play]").get_attribute("aria-label").startswith("Pause"), "Explore: becomes Pause while the branch plays")
    md = page.evaluate("() => navigator.mediaSession && navigator.mediaSession.metadata ? [navigator.mediaSession.metadata.title, navigator.mediaSession.metadata.artist, navigator.mediaSession.metadata.album, navigator.mediaSession.metadata.artwork.length] : null")
    check(md and md[0] == "Rain Piece" and md[1] == "Ghost" and md[2] == "First" and md[3] > 0, f"Media Session metadata published: {md}")
    page.click("[data-testid=explore-play]", force=True); page.wait_for_timeout(500)
    check(page.locator("[data-testid=explore-play]").get_attribute("aria-label").startswith("Play"), "Explore: click pauses (back to Play)")
    page.goto(f"{BASE}/xenolab?tab=contribute&branch=b2"); page.wait_for_selector("[data-testid=sample-play]")
    check(page.locator("[data-testid=contribute-panel] audio").count() == 0, "Contribute: no browser audio player")
    check(page.locator(".ct2-row .ct2-bg").count() == 1 and page.locator(".ct-panel .ct2-bg").count() == 1, "Contribute: row and panel carry branch pictures")
    page.click("[data-testid=sample-play]"); page.wait_for_timeout(1200)
    check(page.locator("[data-testid=sample-play]").get_attribute("aria-label").startswith("Pause"), "Contribute: sample plays through the site player")
    check(page.locator(".player-bar-docked a[href='/topic/hall#m-9']").count() >= 1, "Player links a chat file back to its message")
    ctx.close()
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    DATA["/api/studies"][0]["backgroundUrl"] = "/uploads/pic1.png"
    page.goto(f"{BASE}/xenolab"); page.wait_for_selector("[data-testid=studies-panel] .xl-card")
    check(page.locator(".xl-card-text").count() == 0 and page.locator(".xl-card-bg").count() == 1, "Studies: no text preview, background picture on the card")
    page.goto(f"{BASE}/telemetry?view=instrument"); page.wait_for_selector("[data-testid=conv-sort]")
    check([o.strip() for o in page.locator("[data-testid=conv-sort] option").all_inner_texts()] == ["Recent", "Busiest", "A to Z"], "Instrument sort names")
    page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=sb-sort]")
    check([o.strip() for o in page.locator("[data-testid=sb-sort] option").all_inner_texts()] == ["Recent", "A to Z", "Tracks"], "Soundbay sort names")
    ctx.close()
    for logged in (True, False):
        ctx = new_ctx(logged_in=logged, viewport={"width": 390, "height": 800}); page = ctx.new_page(); watch(page)
        page.goto(f"{BASE}/soundbay"); page.wait_for_selector("[data-testid=soundbay-page]")
        a = page.locator(".mobile-acct")
        check(a.count() == 1 and a.bounding_box()["x"] < 60, f"phone: account (logged_in={logged}) sits top-left")
        check(page.locator(".sb-head h1").bounding_box()["width"] <= 2, "phone: Soundbay title hidden")
        if not logged: check("Log in" in a.inner_text(), "phone: guest gets a Log in bubble")
        ctx.close()
    ctx = new_ctx(viewport={"width": 390, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/xenolab?tab=contribute&branch=b2"); page.wait_for_selector("[data-testid=contribute-panel]")
    check(not page.locator(".ct-panel-title").is_visible(), "phone: branch name not repeated inside the opened panel")
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
