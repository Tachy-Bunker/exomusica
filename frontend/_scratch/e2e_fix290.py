import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix290.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
DATA["/api/atlas/index"] = [["study", "other-1", "Granular ice", "ghost9"], ["study", "mine-1", "Beating tones in a cave", "tachy"], ["branch", "b2", "Full Branch", ""], ["wiki", "start", "Start here", ""]]
def M(i, text, author="ghost9", aid=2):
    return {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
MSGS = [M(1, "read [Granular ice](http://localhost:4173/study/other-1) and https://example.org/x and [plain](http://localhost:4173/members)")]
POCKET = [{"key": "study:mine-1", "type": "study", "id": "mine-1", "title": "Beating tones in a cave", "href": "/study/mine-1"}]
sent = []

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_pocket_v1', {json.dumps(json.dumps(POCKET))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/channels/hall/messages":
            if req.method == "POST": sent.append(json.loads(req.post_data)); return ok(M(99, sent[-1]["contentRaw"], "tachy", 1), 201)
            return ok(MSGS)
        if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1})
        if key in ("/api/channels/hall/archive",): return ok([])
        if key == "/api/channels/hall/follow": return ok({"following": False})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    errors = []
    page = ctx.new_page(); page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("textarea.hud-reveal-textarea")
    ta = "textarea.hud-reveal-textarea"

    # messages: a link to a thing is drawn as a chip; others stay links
    chips = page.locator("[data-testid=ent-chip]")
    check(chips.count() == 1 and "Granular ice" in chips.first.inner_text(), "Message: a link to a thing is drawn as a chip (name + frequency)")
    check(re.search(r"\d+\.\d{3}", chips.first.inner_text()) is not None, "Chip: shows the frequency")
    check(page.locator("a", has_text="plain").count() == 1 and page.locator("[data-testid=ent-chip]", has_text="plain").count() == 0, "Message: other site links stay plain links")

    # pocket row
    check(page.locator("[data-testid=pocket-chip]").count() == 1, "Composer: the pocket is a row of chips")
    page.click("[data-testid=pocket-chip]")
    v = page.input_value(ta)
    check(v.startswith("[Beating tones in a cave](") and v.rstrip().endswith("/study/mine-1)"), f"Pocket chip: tapping puts a link in ({v!r})")

    # #name picker
    page.fill(ta, ""); page.type(ta, "look at #gran")
    page.wait_for_selector("[data-testid=ent-picker]")
    check("Granular ice" in page.locator("[data-testid=ent-picker]").inner_text(), "# picker: finds a thing by name")
    page.keyboard.press("Tab")
    v = page.input_value(ta)
    check(v.startswith("look at [Granular ice](") and v.rstrip().endswith("/study/other-1)") and "#gran" not in v, f"# picker: Tab links it ({v!r})")
    check(page.locator("[data-testid=ent-picker]").count() == 0, "picker closes after a pick")
    # arrows + Enter do not send while the picker is open
    page.fill(ta, ""); page.type(ta, "#s")
    page.wait_for_selector("[data-testid=ent-picker]")
    n = page.locator("[data-testid=ent-picker] li").count()
    page.keyboard.press("ArrowDown"); page.keyboard.press("Enter")
    check(len(sent) == 0 and "](" in page.input_value(ta), f"Enter picks (does not send) while the picker is open ({n} hits)")
    # ~frequency
    page.fill(ta, ""); page.type(ta, "tuned to ~7.1")
    page.wait_for_selector("[data-testid=ent-picker]")
    check(page.locator("[data-testid=ent-picker] li i").first.inner_text().count(".") == 1, "~ picker: lists the things nearest that frequency")
    page.keyboard.press("Escape")
    check(page.locator("[data-testid=ent-picker]").count() == 0, "Escape closes the picker")
    # hash heading not hijacked
    page.fill(ta, ""); page.type(ta, "## Title")
    check(page.locator("[data-testid=ent-picker]").count() == 0, "a markdown heading is left alone")
    # sends normally, link survives
    page.fill(ta, ""); page.type(ta, "x #gran"); page.wait_for_selector("[data-testid=ent-picker]"); page.keyboard.press("Enter")
    page.keyboard.press("Enter"); page.wait_for_timeout(300)
    check(len(sent) == 1 and "[Granular ice](" in sent[0]["contentRaw"], "Sent text is a plain markdown link (works in Discord, search, archive)")
    # slash commands are clickable
    page.fill(ta, "/")
    page.wait_for_selector("[data-testid=cmd-hints]")
    page.locator(".cmd-hint-btn").first.click()
    check(page.input_value(ta).startswith("/") and page.input_value(ta).endswith(" ") and len(page.input_value(ta)) > 2, f"Slash hints are buttons that fill the command ({page.input_value(ta)!r})")
    # phone
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
