import json, re, sys, time
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix303a.py", "e2e_fix277.py")).read()
exec(src.split("\ndef run(playwright):")[0])

def M(i, text, author="ghost9", aid=2):
    return {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
MSGS = [M(1, "hello <@555> this is a test of quoting"), ]
EMOJIS = [{"id": i, "name": n, "imageUrl": "/uploads/e.png"} for i, n in [(1, "aa"), (2, "bb"), (3, "cc")]]
DIGEST = {"since": 0, "replies": {"count": 2, "items": [{"by": "ghost9", "text": "nice one", "href": "/topic/hall#m-4", "where": "The Hall"}]}, "albums": [{"slug": "al1", "title": "First", "branch": "Full Branch"}], "studies": [], "topics": [{"name": "The Hall", "count": 5, "href": "/topic/hall"}]}
quotes = []; patches = []

FAKE_WS = """
(() => { const Real = window.WebSocket;
  window.WebSocket = class extends Real { constructor(u, p) { super(u, p); if (String(u).includes('/ws/presence')) { const self = this; setTimeout(() => { const ev = { data: JSON.stringify({ onlineCount: 2, viewers: [{ channelSlug: 'hall', username: 'old' }, { channelSlug: 'hall', username: 'newbie' }] }) }; if (self.onmessage) self.onmessage(ev); }, 600); } } };
})();
"""

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    def mk(user, seed_visit=None, ws=False):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        if seed_visit: ctx.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('exo_last_visit', String({seed_visit})); sessionStorage.setItem('seeded', '1'); }}")
        if ws: ctx.add_init_script(FAKE_WS)
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/channels/hall/messages": return ok(MSGS)
            if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1, "branch": {"slug": "b2", "name": "Full Branch", "reactionEmojiIds": [2]}})
            if key == "/api/channels/hall/archive": return ok([])
            if key == "/api/channels/hall/follow": return ok({"following": False})
            if key == "/api/emojis": return ok(EMOJIS)
            if key == "/api/users/discord-lookup": return ok([{"discordId": "555", "username": "old", "avatarUrl": None}])
            if key == "/api/users/old/glance": return ok({"bio": "elder", "study": {"slug": "mine-1", "title": "Beating tones in a cave", "status": "IN_PROGRESS"}, "track": {"title": "Rain Piece", "albumSlug": "x", "albumTitle": "X"}})
            if key == "/api/digest": return ok(DIGEST)
            if key == "/api/studies/mine-1/quote": quotes.append(json.loads(req.post_data)); return ok({"slug": "mine-1"})
            if key == "/api/admin/branches" : return ok([{"id": 2, "slug": "b2", "name": "Full Branch", "description": "d", "visibility": "PUBLIC", "reactionEmojiIds": [2]}])
            if re.match(r"/api/admin/branches/\d+$", key) and req.method == "PATCH": patches.append(json.loads(req.post_data)); return ok({})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg

    # --- constellation
    page = mk(ME, ws=True)
    page.goto(f"{BASE}/members?view=sky"); page.wait_for_selector("[data-testid=members-sky]"); page.wait_for_timeout(1200)
    stars = page.locator("[data-testid=sky-star]")
    check(stars.count() == 2, f"Sky: one star per member ({stars.count()})")
    lit = page.locator("[data-testid=sky-star][data-lit='1']").count()
    check(lit == 2, f"Sky: members in a chat are lit ({lit})")
    check(page.locator(".sky-line").count() == 1, "Sky: lit stars are joined by a line")
    page.locator("[data-testid=members-view-cards]").click(); page.wait_for_selector("[data-testid=members-list]")
    check(page.locator("[data-testid=members-sky]").count() == 0, "Sky: Cards switches back")

    # --- chat: mention card, palette, quote
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("[data-testid=mention]")
    page.locator("[data-testid=mention]").first.hover(); page.wait_for_timeout(500)
    card = page.locator("[data-testid=glance-card]").first
    t = card.inner_text()
    check(card.is_visible() and "Beating tones in a cave" in t and "Rain Piece" in t, f"Mention: card shows the study and the latest track ({t!r})")
    page.mouse.move(5, 5)
    page.locator(".message-menu-trigger").first.click()
    page.get_by_role("button", name="React").first.click(); page.wait_for_selector(".emoji-picker button")
    first = page.locator(".emoji-picker button").first
    check("branch-pick" in (first.get_attribute("class") or "") and first.get_attribute("title") == ":bb:", "Palette: the branch's emoji come first")
    check(page.locator(".emoji-picker button").count() == 3, "Palette: the rest follow")
    page.get_by_role("button", name="React").first.click()
    page.locator("[data-testid=quote-to-study]").click()
    check(page.locator("[data-testid=quote-pick]").count() >= 1, "Quote: lists your studies in progress")
    page.locator("[data-testid=quote-pick]").first.click(); page.wait_for_timeout(400)
    check(quotes and quotes[0]["by"] == "ghost9" and "@old" in quotes[0]["text"] and "<@" not in quotes[0]["text"] and quotes[0]["where"] == "The Hall" and "#m-1" in quotes[0]["href"], f"Quote: the whole message is sent with its source {quotes[:1]}")
    # a selection inside the message
    page.locator(".message-menu-trigger").first.click()
    page.evaluate("""() => { const el = [...document.querySelectorAll('.message')].find(e => e.textContent.includes('quoting')); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.textContent.indexOf('this is a test'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 14); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } } }""")
    page.locator("[data-testid=quote-to-study]").click()
    check("selected words" in page.locator("[data-testid=quote-studies]").inner_text(), "Quote: a selection inside the message is offered instead")
    page.locator("[data-testid=quote-pick]").first.click(); page.wait_for_timeout(400)
    check(len(quotes) == 2 and quotes[1]["text"] == "this is a test", f"Quote: only the selected words are sent {quotes[1:]}")

    # --- digest
    dpage = mk(ME, seed_visit=int(time.time() * 1000) - 10 * 3600 * 1000)
    dpage.goto(f"{BASE}/"); dpage.wait_for_selector("[data-testid=digest-card]")
    dt = dpage.locator("[data-testid=digest-card]").inner_text()
    check("2 replies to you" in dt and "First" in dt and "The Hall" in dt, f"Digest: replies, topics and albums listed ({dt[:80]!r})")
    dpage.locator("[data-testid=digest-close]").click()
    check(dpage.locator("[data-testid=digest-card]").count() == 0, "Digest: dismisses")
    stamp = int(dpage.evaluate("localStorage.getItem('exo_last_visit')"))
    check(abs(stamp - time.time() * 1000) < 60000, "Digest: dismissing stamps the visit")
    dpage.reload(); dpage.wait_for_selector("[data-testid=home-member-hero]"); dpage.wait_for_timeout(600)
    check(dpage.locator("[data-testid=digest-card]").count() == 0, "Digest: not shown again right after")
    fresh = mk(ME)
    fresh.goto(f"{BASE}/"); fresh.wait_for_selector("[data-testid=home-member-hero]"); fresh.wait_for_timeout(600)
    check(fresh.locator("[data-testid=digest-card]").count() == 0, "Digest: a first visit on a device shows nothing")

    # --- admin palette
    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/admin/branches/2/identity"); admin.wait_for_selector("[data-testid=identity-palette]")
    em = admin.locator("[data-testid=palette-emoji]")
    check(em.count() == 3 and em.nth(1).get_attribute("aria-pressed") == "true", "Admin: current palette is marked")
    em.nth(0).click(); em.nth(1).click()
    admin.locator("[data-testid=identity-save]").click(); admin.wait_for_timeout(400)
    check(patches and patches[0]["reactionEmojiIds"] == [1], f"Admin: palette saved {patches[:1]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
