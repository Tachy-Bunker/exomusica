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
  "/api/home": {"stats": {"members": 5, "tracks": 3, "studies": 2, "branches": 1}, "branches": [{"slug": "b1", "name": "Branch One", "blurb": "", "coverArtUrl": None, "posX": 0, "posY": 0, "parentSlug": None, "seed": True, "anchor": True, "color": None, "glyph": None, "details": None, "image": None, "secondaryImage": None, "albums": 1, "tracks": 3, "chatSlug": None, "lastActiveAt": None}], "activity": [], "generatedAt": now},
  "/api/online": {"online": 3},
  "/api/account/followed-channels": [], "/api/emojis": [], "/api/notifications": [], "/api/pms": [], "/api/recent-messages": [],
  "/api/account/sound-prefs": [], "/api/site-settings": {"defaultFont": None, "ambienceUrl": None, "textColorPrimary": None, "textColorSecondary": None, "chatTitleColor": None, "accentPrimaryColor": None, "contentTextScaleDesktop": 1, "contentTextScaleMobile": 1, "caInitial": 0, "chatOpenSfxUrl": None, "chatHudRevealRate": 1, "chatHudSfxUrl": None, "chatSplashMessages": [], "linkClickSfxUrl": None, "caBurst": 0, "moireImageUrl": None, "moireOpacity": 0, "moireSize": 1, "moireOffsetMin": 0, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0, "faviconUrl": None, "usernameColor": None}, "/api/account/me": {"volumeNotifications": 0.5, "volumeSfxIdle": 0.5, "volumeSfxPlaying": 0.3, "volumeMusic": 0.8, "caEnabled": False, "moireEnabled": False, "exclusiveMediaPlayback": False},
  "/api/community-albums?mine=true": [],
}

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(cond, msg):
        results.append((bool(cond), msg)); print(("ok   " if cond else "FAIL ") + msg)

    def new_ctx(logged_in=True, viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1200, "height": 900}, accept_downloads=True)
        if logged_in:
            ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            req = route.request
            path = req.url.replace(BASE, "")
            if req.method == "POST" and path.startswith("/api/studies"):
                posts.append(json.loads(req.post_data or "{}"))
                return route.fulfill(status=201, content_type="application/json", body=json.dumps({"slug": "new-one"}))
            key = path.split("?")[0] if path.split("?")[0] in DATA else path
            if key in DATA:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(DATA[key]))
            if path.startswith("/uploads/rain.wav"):
                return route.fulfill(status=200, content_type="audio/wav", body=open(WAV, "rb").read())
            print("UNMOCKED", req.method, path)
            return route.fulfill(status=200, content_type="application/json", body="{}")
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx

    # ---------- XenoLab, logged in
    ctx = new_ctx()
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: ("/study/" not in page.url and errors.append(str(e)), print("PAGEERROR", page.url, str(e)[:200])))
    page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]) if m.type=="error" else None)
    page.goto(f"{BASE}/xenolab")
    page.wait_for_selector("[data-testid=xenolab-overview]")
    check(page.locator("[data-testid=xenolab-continue]").count() == 1, "overview offers Continue for my in-progress study")
    check("Beating tones" in page.locator("[data-testid=xenolab-next]").inner_text(), "continue card shows the study with its preview")
    check(page.locator(".xl-tab").count() == 7, "seven tabs")
    # overview drop -> analyzer
    page.set_input_files("[data-testid=overview-drop-input]", WAV)
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    check("tab=analyze" in page.url, "dropping on Overview moves to the Analyze tab")
    txt = page.locator("[data-testid=analyzer]").inner_text()
    check("A3" in txt, "pitch A3 reported")
    check("120 BPM" in txt, "tempo 120 BPM reported")
    check(re.search(r"Loudness\s*\n?\s*[−-]\d+\.\d LUFS", txt) is not None, "loudness LUFS shown")
    check(page.locator("canvas.an-spec").evaluate("c => c.width > 100"), "spectrogram drawn")
    check(page.locator("[data-testid=analyzer-study]").count() == 1, "Start a study from this is offered when logged in")
    # start a study from analysis
    page.click("[data-testid=analyzer-study]")
    page.wait_for_url("**/study/new-one")
    check(posts and "Analysis: test_a3" in posts[-1]["title"] and "Integrated loudness" in posts[-1]["body"], "study created with measurements as its body")
    # analyze a second file replaces the first
    page.goto(f"{BASE}/xenolab?tab=analyze")
    page.set_input_files("[data-testid=analyzer-input]", WAV)
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    # bad file
    open("/tmp/bad.wav", "wb").write(b"not audio at all")
    page.set_input_files("[data-testid=analyzer-input]", "/tmp/bad.wav")
    page.wait_for_selector(".an-err", timeout=15000)
    check("could not read" in page.locator(".an-err").inner_text().lower(), "unreadable file gives a plain error")
    # plot tool still there
    check(page.locator("[data-testid=xenolab-chart-tool]").count() == 1, "plot tool kept")

    # studies tab
    page.goto(f"{BASE}/xenolab?tab=studies")
    page.wait_for_selector("[data-testid=studies-panel] .xl-card")
    check(page.locator("[data-testid=studies-panel] .xl-card").count() == 2, "two study cards")
    page.fill(".xl-search", "ice")
    check(page.locator("[data-testid=studies-panel] .xl-card").count() == 1, "search filters")
    page.fill(".xl-search", "")
    page.click("text=Mine")
    check(page.locator("[data-testid=studies-panel] .xl-card").count() == 1, "Mine filter")
    page.click("role=radio[name='Experiment']")
    page.fill("[aria-label='Title of a new study']", "Cave test")
    page.click("text=Start a study")
    page.wait_for_url("**/study/new-one")
    check(posts[-1]["title"] == "Cave test" and "## Question" in posts[-1]["body"], "template body sent")

    # samples tab -> analyze
    page.goto(f"{BASE}/xenolab?tab=samples")
    page.wait_for_selector("[data-testid=samples-panel] .xl-card")
    check(page.locator("[data-testid=samples-panel] audio").count() == 1, "sample plays inline")
    page.click("[data-testid=samples-panel] button:has-text(\"Analyze\")")
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    check("tab=analyze" in page.url and "rain.wav" in page.locator("[data-testid=analyzer]").inner_text(), "sample analyzed in the Analyzer")

    # challenges
    page.goto(f"{BASE}/xenolab?tab=challenges")
    page.wait_for_selector("[data-testid=challenges-panel] .xl-card-open")
    check("single pitch" in page.locator("[data-testid=challenges-panel]").inner_text(), "open challenge starts expanded with its prompt")
    # log
    page.goto(f"{BASE}/xenolab?tab=log")
    page.wait_for_selector("[data-testid=log-panel] .xl-tree")
    check("Gear notes" in page.locator("[data-testid=log-panel]").inner_text(), "Log entries listed inline")
    # voice lab embedded
    page.goto(f"{BASE}/xenolab?tab=voice")
    page.wait_for_selector("[data-testid=voice-lab]", timeout=15000)
    check(page.locator("[data-testid=voice-lab] h1").count() == 0, "voice lab embedded without its own page title")
    # redirects
    for old, tab in [("/sample-bank", "samples"), ("/challenges", "challenges"), ("/studies", "studies")]:
        page.goto(BASE + old); page.wait_for_selector("[data-testid=xenolab-page]")
        check(f"tab={tab}" in page.url, f"{old} redirects into XenoLab")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    ctx.close()

    # ---------- guest
    ctx = new_ctx(logged_in=False)
    page = ctx.new_page()
    page.goto(f"{BASE}/xenolab"); page.wait_for_selector("[data-testid=xenolab-next]")
    check("Log in" in page.locator("[data-testid=xenolab-next]").inner_text(), "guest is invited to log in; Analyze still available")
    page.goto(f"{BASE}/xenolab?tab=analyze"); page.set_input_files("[data-testid=analyzer-input]", WAV)
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    check(page.locator("[data-testid=analyzer-study]").count() == 0, "guest has no 'start a study' button")
    ctx.close()

    # ---------- Telemetry
    ctx = new_ctx()
    page = ctx.new_page()
    page.goto(f"{BASE}/telemetry"); page.wait_for_selector("[data-testid=tm-panel-conversations] .tm-rows")
    st = page.locator("[data-testid=tm-status]").inner_text()
    check("online" in st and "signals today" in st and "5" in st, "status line: " + st.replace("\n", " "))
    check("For you" in page.inner_text("body") and "Your study" in page.inner_text("body"), "For you row has my study")
    check(page.locator("[data-testid^=tm-panel-]").count() == 5, "five panels (no samples/challenges)")
    check("Sample" not in page.locator(".tm-panels").inner_text(), "samples left Telemetry")
    check(page.locator("[data-testid=tm-toggle-conversations]").count() == 0, "no 'show more' when there is nothing more")
    order = [e.get_attribute("data-testid") for e in page.locator("[data-testid^=tm-panel-]").all()]
    page.click("[aria-label='Pin Cult activities to the top']")
    order2 = [e.get_attribute("data-testid") for e in page.locator("[data-testid^=tm-panel-]").all()]
    check(order2[0] == "tm-panel-cult" and order[0] != order2[0], "pinning moves the panel first")
    page.reload(); page.wait_for_selector("[data-testid=tm-panel-cult]")
    check(page.locator("[data-testid^=tm-panel-]").first.get_attribute("data-testid") == "tm-panel-cult", "pin survives a reload")
    ctx.close()

    # ---------- mobile overflow
    ctx = new_ctx(viewport={"width": 375, "height": 800})
    page = ctx.new_page()
    for url in ["/xenolab", "/xenolab?tab=studies", "/xenolab?tab=analyze", "/xenolab?tab=samples", "/xenolab?tab=challenges", "/telemetry"]:
        page.goto(BASE + url); page.wait_for_timeout(800)
        over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(over <= 1, f"{url} has no horizontal overflow on a phone ({over}px)")
    page.goto(BASE + "/xenolab?tab=analyze"); page.set_input_files("[data-testid=analyzer-input]", WAV)
    page.wait_for_selector("[data-testid=analyzer-findings]", timeout=30000)
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(over <= 1, f"analyzer results fit a phone ({over}px)")
    page.screenshot(path="/home/claude/exomusica/frontend/_scratch/analyzer_mobile.png", full_page=True)
    ctx.close()
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p:
    run(p)
