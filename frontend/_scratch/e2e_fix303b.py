import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix303b.py", "e2e_fix277.py")).read()
exec(src.split("\ndef run(playwright):")[0])

def M(i, text, author="ghost9", aid=2):
    return {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
MSGS = [M(1, "hello there"), M(2, "mine", "tachy", 1)]
PENDING = [{"id": 7, "username": "neo", "say": "Welcome @neo !", "channelSlug": "hall"}]
LEDGER = {"shares": [{"username": "ghost9", "earned": 30, "sharePermille": 750}, {"username": "former member", "earned": 10, "sharePermille": 250}], "entries": [{"username": "ghost9", "points": 30, "reason": "Approved submission", "at": 1790000000000, "album": {"slug": "x", "title": "X Album"}}, {"username": "former member", "points": 10, "reason": "Early help", "at": 1789000000000, "album": None}]}
COLLAB = {"slug": "c1", "name": "Ghost", "role": "x", "bio": "b", "pictureUrl": None, "links": [], "linkedUsername": None, "gallery": [], "discography": [], "credits": [{"role": "mixing", "count": 3}, {"role": "composer", "count": 1}]}
ALB = {"id": 1, "slug": "al1", "title": "First", "composer": "Ghost", "coverArtUrl": None, "description": "d", "contentMarkdown": "", "branch": {"id": 2, "slug": "b2", "name": "Full Branch"}, "links": [], "gallery": [], "collaborators": [], "transition": "none", "crossfadeMs": 0,
       "tracks": [{"id": 1, "title": "Rain One", "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 6, "position": 1, "albumTitle": "First", "albumSlug": "al1", "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": [], "composers": [{"id": 1, "name": "Ghost", "slug": "c1", "roles": ["composer", "mixing"]}, {"id": 2, "name": "Plain", "slug": None, "roles": []}]}]}
pms = []; dones = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/channels/hall/messages": return ok(MSGS)
        if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1, "branch": None})
        if key == "/api/channels/hall/archive": return ok([])
        if key == "/api/channels/hall/follow": return ok({"following": False})
        if key == "/api/pms/ghost9" and req.method == "POST": pms.append(json.loads(req.post_data)); return ok({"id": 1, "sentAt": 1}, 201)
        if key == "/api/welcome/pending": return ok(PENDING)
        if key == "/api/welcome/7/done": dones.append(1); return ok({"ok": True})
        if key == "/api/rewards": return ok([])
        if key == "/api/account/points": return ok({"balance": 5, "entries": [], "claims": []})
        if key == "/api/ledger": return ok(LEDGER)
        if key == "/api/collaborators/c1": return ok(COLLAB)
        if key == "/api/albums/al1": return ok(ALB)
        if key == "/api/albums/al1/transition": return ok({"mode": "none", "ms": 0})
        if key.startswith("/uploads/rain.wav"): return route.fulfill(status=200, content_type="audio/wav", body=open(WAV, "rb").read())
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # --- DM from anywhere
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=dm-btn]")
    check(page.locator("[data-testid=dm-btn]").count() == 1, "DM: an icon beside other people's names, none beside your own")
    page.locator("[data-testid=dm-btn]").click()
    page.fill("[data-testid=dm-input]", "hey, loved that"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
    check(pms and pms[0]["contentRaw"] == "hey, loved that", f"DM: Enter sends one line {pms[:1]}")
    check(page.locator("[data-testid=dm-pop]").count() == 0, "DM: the box closes after sending")
    check(page.url.endswith("/topic/hall"), "DM: you stay on the page")

    # --- welcome buddy
    page.goto(f"{BASE}/"); page.wait_for_selector("[data-testid=welcome-card]")
    check("neo" in page.locator("[data-testid=welcome-item]").inner_text(), "Welcome: the prompt names the newcomer")
    page.locator("[data-testid=welcome-say]").click(); page.wait_for_selector("textarea.hud-reveal-textarea")
    page.wait_for_timeout(500)
    check(page.input_value("textarea.hud-reveal-textarea") == "Welcome @neo !", f"Welcome: the box holds the greeting ({page.input_value('textarea.hud-reveal-textarea')!r})")
    check("say=" not in page.url, f"Welcome: the link parameter is cleaned from the address ({page.url})")
    check(len(dones) == 1, "Welcome: following it marks the greeting as handled")
    page.goto(f"{BASE}/topic/hall?say=" + "x" * 800); page.wait_for_selector("textarea.hud-reveal-textarea"); page.wait_for_timeout(400)
    check(len(page.input_value("textarea.hud-reveal-textarea")) <= 500, "Welcome: a long link can't stuff the box")

    # --- credit roles
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    t = page.locator("body").inner_text()
    check("(mixing)" in t and "(composer" not in t, "Roles: album shows a role beside the name, hides the default composer")
    check(page.locator("[data-testid=credit-roles-shown]").count() == 1, "Roles: a plain credit shows no extra text")
    page.goto(f"{BASE}/collaborator/c1"); page.wait_for_selector("[data-testid=collab-credits]")
    check("mixing ×3" in page.locator("[data-testid=collab-credits]").inner_text(), "Roles: the collaborator page sums up what they did")

    # --- ledger
    page.goto(f"{BASE}/rewards"); page.wait_for_selector("[data-testid=ledger-link]")
    page.click("[data-testid=ledger-link]"); page.wait_for_selector("[data-testid=ledger-page]"); page.wait_for_selector("[data-testid=ledger-shares]")
    check("75.0%" in page.locator("[data-testid=ledger-shares]").inner_text(), "Ledger: shares as percentages")
    check(page.locator("[data-testid=ledger-entries] li").count() == 2 and "Approved submission" in page.locator("[data-testid=ledger-entries]").inner_text(), "Ledger: every entry with its reason")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
