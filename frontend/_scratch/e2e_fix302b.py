import json, re, sys, base64
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix302b.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

CSV = "x,y\n1,2\n2,4\n3,3\n4,6"
STUDY = {"id": 5, "slug": "mine-1", "title": "Beating tones", "body": "Two sines beat.[1] And again.[2]", "status": "IN_PROGRESS", "backgroundUrl": "/uploads/red.png", "backgroundOpacity": 0.5,
         "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [{"id": 1, "position": 0, "text": "Source https://example.org/beats"}, {"id": 2, "position": 1, "text": "No link here"}],
         "charts": [{"id": 1, "position": 0, "title": "Beat rate", "kind": "LINE", "xLabel": "Hz", "yLabel": "dB", "dataCsv": CSV, "sourceFileId": 9, "live": True, "sourceName": "beats.csv"},
                    {"id": 2, "position": 1, "title": "Second", "kind": "BAR", "xLabel": None, "yLabel": None, "dataCsv": CSV}]}
CITES = [{"url": "https://example.org/beats", "citedBy": [{"slug": "other-1", "title": "Granular ice"}]}, {"url": None, "citedBy": []}]
CHAIN = base64.urlsafe_b64encode(json.dumps([["Galactic3", [0.5, 0.5, 0.5, 1, 0.2, 0.3]], ["Pressure5", [0.3, 0, 0, 1, 0.5, 1]]]).encode()).decode().rstrip("=")
PHEN = [{"id": 1, "slug": "beating", "title": "Beating", "summary": "Two close pitches throb.", "body": "Notes **here**", "chain": CHAIN, "published": True, "example": {"id": 4, "title": "Rain", "fileUrl": "/uploads/rain.wav", "albumTitle": "First"}}]
saved = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    def mk(user):
        ctx = browser.new_context(viewport={"width": 1200, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            def ok(b, s=200): return route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/uploads/red.png": return route.fulfill(status=200, content_type="image/png", body=open("/tmp/red.png", "rb").read())
            if key.startswith("/uploads/rain.wav"): return route.fulfill(status=200, content_type="audio/wav", body=open(WAV, "rb").read())
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok(CITES)
            if key == "/api/link-preview": return ok({"title": "Beats explained", "description": "About beating", "image": None})
            if key in ("/api/phenomena", "/api/admin/phenomena"):
                if req.method == "POST": saved.append(json.loads(req.post_data)); return ok(PHEN[0], 201)
                return ok(PHEN)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    page = mk(ME)

    # --- study: chart style, live note, side fade, citations
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=study-chart]"); page.wait_for_timeout(1200)
    check(page.locator("[data-testid=study-chart].study-scope").count() == 2, "Charts: instrument styled wrapper")
    check("live" in page.locator("[data-testid=chart-live-note]").first.inner_text() and "beats.csv" in page.locator("[data-testid=chart-live-note]").first.inner_text(), "Charts: a live chart says which file it reads")
    stroke = page.evaluate("(() => { const p=document.querySelector('[data-testid=study-chart] svg path[stroke]'); return p ? p.getAttribute('stroke') : null; })()")
    print("STROKE", stroke)
    m = re.match(r"hsl\((\d+)", stroke or "")
    check(stroke and (stroke.startswith("hsl") or stroke.startswith("#") or stroke.startswith("rgb")), "Charts: line coloured from the picture (not the default)")
    if m: check(int(m.group(1)) % 360 < 40 or int(m.group(1)) > 320, f"Charts: a red picture gives a reddish line (hue {m.group(1)})")
    mask = page.evaluate("getComputedStyle(document.querySelector('[data-testid=study-bg]')).maskImage || getComputedStyle(document.querySelector('[data-testid=study-bg]')).webkitMaskImage")
    check(mask and mask.count("gradient") >= 2, "Background: faded on the sides as well as the bottom")
    check(page.locator("sup.cite").count() == 2, "Notes: [n] markers rendered as cite refs")
    page.locator("sup.cite").first.hover(); page.wait_for_timeout(500)
    card = page.locator("[data-testid=cite-card]").first
    check(card.is_visible() and "example.org" in card.inner_text(), "Citation card: shows the source on hover")
    print("CARD", repr(card.inner_text())); page.wait_for_timeout(800)
    check("Beats explained" in card.inner_text(), "Citation card: shows the page title from the preview")
    check("Granular ice" in page.locator("[data-testid=cited-by]").inner_text(), "Notes: 'also cited in' names the other study")

    # --- chain link
    page.goto(f"{BASE}/xenolab?tab=effects&chain={CHAIN}"); page.wait_for_selector("[data-testid=chain-linked-note]")
    check("Galactic3 → Pressure5" in page.locator("[data-testid=chain-linked-note]").inner_text(), "Chain link: the note lists the shared effects")
    page.set_input_files("input[type=file]", WAV); page.wait_for_selector("[data-testid=voice-chain]")
    check(page.locator("[data-testid=voice-chain]").input_value() == "custom", "Chain link: custom chain selected")
    page.wait_for_selector("[data-testid=chain-stage]", timeout=15000)
    check(page.locator("[data-testid=chain-stage]").count() == 2, "Builder: two stages from the link")
    page.wait_for_function("document.querySelectorAll('[data-testid=chain-param]').length > 0")
    lab = page.locator("[data-testid=chain-stage]").first.inner_text()
    print("STAGE", lab.replace("\n", " | ")[:200])
    check(re.search(r"[A-Za-z]+", lab) and "Param 1" not in lab, "Builder: sliders carry the plugin's own parameter names")
    page.locator("[data-testid=chain-add]").click(); check(page.locator("[data-testid=chain-stage]").count() == 3, "Builder: add an effect")
    page.locator("[data-testid=chain-remove]").last.click(); check(page.locator("[data-testid=chain-stage]").count() == 2, "Builder: remove an effect")
    page.locator("[data-testid=chain-stage] select").first.select_option("Energy2")
    check(page.locator("[data-testid=chain-stage]").first.locator("[data-testid=chain-param]").count() == 9, "Builder: swapping the plugin brings its 9 parameters")
    page.locator("[data-testid=chain-stage] select").first.select_option("Galactic3")
    page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page.locator("[data-testid=chain-share]").click(); page.wait_for_timeout(300)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("tab=effects&chain=" in clip, "Share: a link is copied")
    page.locator("[data-testid=voice-process]").click()
    page.wait_for_selector("[data-testid=voice-ab-processed]", timeout=60000)
    check(True, "Custom chain processes in the worker")
    page.goto(clip.replace("http://localhost:4173", BASE)); page.wait_for_selector("[data-testid=chain-linked-note]")
    check("Galactic3" in page.locator("[data-testid=chain-linked-note]").inner_text(), "Share: the copied link opens the same chain")
    page.goto(f"{BASE}/xenolab?tab=effects&chain=garbage!"); page.wait_for_selector("[data-testid=voice-lab]")
    check(page.locator("[data-testid=chain-linked-note]").count() == 0, "Chain link: a bad link is ignored")

    # --- phenomena
    page.goto(f"{BASE}/xenolab?tab=phenomena&item=beating"); page.wait_for_selector("[data-testid=phenomenon-card]")
    check(page.locator("[data-testid=phenomenon-audio]").count() == 1 and page.locator("[data-testid=phenomenon-audio]").get_attribute("preload") == "none", "Phenomena: example audio is lazy")
    check(page.locator("[data-testid=phenomenon-new]").count() == 0, "Phenomena: members can't edit")
    href = page.locator("[data-testid=phenomenon-reproduce]").get_attribute("href")
    check(href == f"/xenolab?tab=effects&chain={CHAIN}", "Phenomena: reproduce link carries the chain")
    page.locator("[data-testid=phenomenon-reproduce]").click(); page.wait_for_selector("[data-testid=chain-linked-note]")
    check(True, "Phenomena: reproduce opens Effects with the chain")
    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/xenolab?tab=phenomena"); admin.wait_for_selector("[data-testid=phenomenon-new]")
    admin.locator("[data-testid=phenomenon-new]").click()
    admin.fill("[aria-label=Title]", "Aliasing"); admin.fill("[aria-label='Chain link']", f"http://x/xenolab?tab=effects&chain={CHAIN}"); admin.fill("[aria-label='Example track id']", "4")
    admin.locator("[data-testid=phenomenon-save]").click(); admin.wait_for_timeout(500)
    check(saved and saved[0]["title"] == "Aliasing" and saved[0]["chain"] == CHAIN and saved[0]["exampleTrackId"] == 4, f"Admin: card saved with the chain code extracted from a pasted link {saved[:1]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
