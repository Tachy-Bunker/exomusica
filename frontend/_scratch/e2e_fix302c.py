import json, re, sys
from playwright.sync_api import sync_playwright
import os; D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix302.py").read()
__file__ = D + "/e2e_fix302.py"; exec(src.split("\ndef run(playwright):")[0])

GLOSS = {"pageSlug": "glossary", "terms": [
    {"id": 1, "term": "Beating", "aliases": ["beats"], "definition": "Slow **throb** from two close pitches."},
    {"id": 2, "term": "Aliasing", "aliases": [], "definition": "Frequencies folding back."}]}
STUDY = {"id": 5, "slug": "mine-1", "title": "Beating tones", "body": "## Beating heading\n\nA beating tone, and beating again. Also Aliasing.", "status": "IN_PROGRESS",
         "owner": {"id": 1, "username": "tachy"}, "channel": None, "branches": [], "files": [], "annotations": [], "charts": []}
WIKI = [{"id": 1, "slug": "start", "title": "Start here", "parentId": None}, {"id": 2, "slug": "glossary", "title": "Glossary", "parentId": 1}]
COMMENTS = [{"id": 1, "atSeconds": 1.0, "endSeconds": 3.0, "body": "ringing here", "createdAt": "2026-10-01T10:00:00Z", "user": "ghost9", "avatarUrl": None, "userId": 2},
            {"id": 2, "atSeconds": 4.0, "endSeconds": None, "body": "nice", "createdAt": "2026-10-01T10:00:00Z", "user": "tachy", "avatarUrl": None, "userId": 1}]
posted = []; gposted = []

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
            if key.startswith("/uploads/rain.wav"):
                data = open(WAV, "rb").read(); rng = req.headers.get("range")
                if rng:
                    m = re.match(r"bytes=(\d*)-(\d*)", rng); a = int(m.group(1) or 0); b = int(m.group(2)) if m.group(2) else len(data) - 1; b = min(b, len(data) - 1)
                    return route.fulfill(status=206, headers={"Content-Range": f"bytes {a}-{b}/{len(data)}", "Accept-Ranges": "bytes", "Content-Type": "audio/wav"}, body=data[a:b + 1])
                return route.fulfill(status=200, headers={"Accept-Ranges": "bytes"}, content_type="audio/wav", body=data)
            if key.endswith("/spectrogram"): return route.fulfill(status=200, content_type="application/octet-stream", body=bytes((i * 7) % 256 for i in range(2500)))
            if key == "/api/glossary": return ok(GLOSS)
            if key == "/api/admin/glossary":
                gposted.append(json.loads(req.post_data)); return ok({"id": 9}, 201)
            if key == "/api/studies/mine-1": return ok(STUDY)
            if key == "/api/studies/mine-1/citations": return ok([])
            if key == "/api/wiki": return ok(WIKI)
            if key == "/api/wiki/glossary": return ok({"id": 2, "slug": "glossary", "title": "Glossary", "contentMarkdown": "Intro text.\n\n{glossary cards}", "font": None})
            if key == "/api/albums/al1": return ok(ALBUM)
            if key == "/api/albums/al1/transition": return ok({"mode": "none", "ms": 0})
            if re.match(r"/api/tracks/\d+/provenance", key): return ok({})
            if re.match(r"/api/tracks/\d+/comments", key):
                if req.method == "POST": posted.append(json.loads(req.post_data)); return ok({"id": 3, "atSeconds": 1.0, "endSeconds": 2.0, "body": "x", "createdAt": "2026-10-01T10:00:00Z", "user": "tachy", "avatarUrl": None, "userId": 1}, 201)
                return ok(COMMENTS)
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    page = mk(ME)

    # --- glossary auto-links in a study
    page.goto(f"{BASE}/study/mine-1"); page.wait_for_selector("[data-testid=gloss-ref]")
    refs = page.locator("[data-testid=gloss-ref]")
    check(refs.count() == 2, f"Glossary: first mention of each term is linked once ({refs.count()})")
    check(page.locator("h2 [data-testid=gloss-ref]").count() == 0, "Glossary: headings stay plain")
    refs.first.hover(); page.wait_for_timeout(200)
    card = page.locator("[data-testid=gloss-card]").first
    check(card.is_visible() and "throb" in card.inner_text() and "In the glossary" in card.inner_text(), "Glossary: hover shows the definition and a link to the page")
    check(page.locator(".gloss-card a").first.get_attribute("href") == "/wiki/glossary#term-1", "Glossary: link goes to the term on the Glossary page")

    # --- glossary page nested in the Log
    page.goto(f"{BASE}/wiki/glossary#term-2"); page.wait_for_selector("[data-testid=glossary-list]")
    check(page.locator("[data-testid=glossary-item]").count() == 2, "Glossary page: every term listed")
    check("glossary-cards" in page.locator("[data-testid=glossary-list]").get_attribute("class"), "Glossary page: {glossary cards} layout")
    check("also beats" in page.locator("[data-testid=glossary-list]").inner_text(), "Glossary page: aliases shown")
    check(page.locator("#term-2").count() == 1, "Glossary page: terms are addressable")

    # --- admin
    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/admin/glossary"); admin.wait_for_selector("[data-testid=glossary-admin]")
    check(admin.locator("[data-testid=glossary-row]").count() == 2, "Admin: terms listed")
    admin.locator("[data-testid=glossary-new]").click()
    admin.fill("[aria-label=Term]", "Comb filter"); admin.fill("[aria-label=Aliases]", "comb, combing"); admin.fill("[aria-label=Definition]", "Delay mixed with itself.")
    admin.locator("[data-testid=glossary-save]").click(); admin.wait_for_timeout(400)
    check(gposted and gposted[0] == {"term": "Comb filter", "aliases": ["comb", "combing"], "definition": "Delay mixed with itself."}, f"Admin: term saved {gposted[:1]}")

    # --- audio region notes
    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    page.locator("[data-testid=album-play-all]").dispatch_event("click"); page.wait_for_timeout(1200)
    page.locator(".player-expand-btn").first.click(); page.wait_for_selector(".spec-comment")
    page.wait_for_selector("[data-testid=note-region]", timeout=8000)
    check(page.locator("[data-testid=note-region]").count() == 1, "Notes: a region note draws as a band on the strip")
    check(page.locator("[data-testid=note-layers] .spec-layer-chip").count() == 2, "Notes: one layer chip per author")
    check(page.locator("[data-testid=note-as-region]").count() == 0, "Notes: the Region button is gone (existing region notes still draw)")
    page.locator("[data-testid=note-layers] .spec-layer-chip", has_text="ghost9").click()
    check(page.locator("[data-testid=note-region]").count() == 0, "Notes: switching a layer off hides its regions")
    page.locator("[data-testid=note-layers] .spec-layer-chip", has_text="ghost9").click()
    check(page.locator("[data-testid=note-region]").count() == 1, "Notes: and back on")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
