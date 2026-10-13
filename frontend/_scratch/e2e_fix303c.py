import json, re, sys, copy, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix302.py").read()
__file__ = D + "/e2e_fix302.py"; exec(src.split("\ndef run(playwright):")[0])

CALB = copy.deepcopy(ALBUM)
for t in CALB["tracks"]: t["source"] = "community"
COMMENTS = [{"id": 1, "atSeconds": 1.0, "endSeconds": None, "body": "too harsh at 1s", "createdAt": "2026-10-01T10:00:00Z", "user": "ghost9", "avatarUrl": None, "userId": 2},
            {"id": 2, "atSeconds": 2.0, "endSeconds": None, "body": "love this", "createdAt": "2026-10-01T10:00:00Z", "user": "ghost9", "avatarUrl": None, "userId": 2}]
REVS = {"owner": "tachy", "revisions": [{"id": 4, "at": "2026-10-02T10:00:00Z", "url": "/uploads/rain.wav", "answers": {"id": 2, "atSeconds": 2.0, "body": "love this", "user": "ghost9"}}]}
WANTED = [{"id": 11, "title": "30 s drone in D", "detail": "no beats", "open": True, "by": None}, {"id": 12, "title": "Rain field recording", "detail": "", "open": False, "by": "Rainy"}]
BR = copy.deepcopy(DATA["/api/contribute/branches"]); BR[0]["wanted"] = WANTED
created = []; uploads = []; added = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
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
            if key == "/api/albums/al1": return ok(CALB)
            if key == "/api/albums/al1/transition": return ok({"mode": "none", "ms": 0})
            if re.match(r"/api/community-tracks/\d+/comments", key): return ok(COMMENTS)
            if re.match(r"/api/community-tracks/\d+/revisions", key): return ok(REVS)
            if re.match(r"/api/community-tracks/\d+/replace-file", key): uploads.append(path); return ok({"ok": True})
            if key == "/api/contribute/branches": return ok(BR)
            if re.match(r"/api/contribute/branches/b2$", key): return ok({"id": 2, "slug": "b2", "name": "Full Branch", "description": "d", "briefMarkdown": None, "previewAttachment": None})
            if key == "/api/community-albums" and req.method == "POST": created.append(json.loads(req.post_data)); return ok({"id": 9, "slug": "new", "title": "T"}, 201)
            if key == "/api/community-albums/new": return ok({"submissionChannel": None})
            if key == "/api/admin/branches": return ok([{"id": 2, "name": "Full Branch", "briefMarkdown": None, "previewAttachmentId": None, "contributeBackgroundUrl": None, "contributeBackgroundOpacity": 0.3}])
            if key == "/api/admin/branches/2/wanted":
                if req.method == "POST": added.append(json.loads(req.post_data)); return ok({"id": 13}, 201)
                return ok([{"id": 11, "title": "30 s drone in D", "detail": "no beats", "claimedAlbum": None}, {"id": 12, "title": "Rain", "detail": "", "claimedAlbum": {"slug": "r", "title": "Rainy", "submissionStatus": "PENDING"}}])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    page = mk(ME)

    page.goto(f"{BASE}/album/al1"); page.wait_for_selector("[data-testid=album-play-all]")
    page.locator("[data-testid=album-play-all]").dispatch_event("click"); page.wait_for_timeout(1200)
    page.locator(".player-expand-btn").first.click(); page.wait_for_selector("[data-testid=track-versions]", timeout=8000)
    check("1 earlier" in page.locator("[data-testid=versions-toggle]").inner_text(), "Versions: the owner sees the earlier-version count")
    check(page.locator("[data-testid=answered-badge]").count() == 1, "Versions: the comment a version answered is marked")
    check(page.locator("[data-testid=answer-with-file]").count() == 1, "Versions: only the unanswered comment offers 'answer with a new version'")
    page.locator("[data-testid=answer-with-file] input").set_input_files({"name": "v2.wav", "mimeType": "audio/wav", "buffer": open(WAV, "rb").read()}); page.wait_for_timeout(500)
    check(uploads and uploads[0].endswith("?answers=1"), f"Versions: the upload is linked to the comment {uploads[:1]}")
    page.locator("[data-testid=versions-toggle]").click()
    check(page.locator("[data-testid=version-item]").count() == 1, "Versions: list opens with the kept version")

    # not the owner: no controls
    other = mk({"id": 2, "username": "ghost9", "isAdmin": False})
    other.goto(f"{BASE}/album/al1"); other.wait_for_selector("[data-testid=album-play-all]")
    other.locator("[data-testid=album-play-all]").dispatch_event("click"); other.wait_for_timeout(1200)
    other.locator(".player-expand-btn").first.click(); other.wait_for_selector("[data-testid=track-versions]", timeout=8000)
    check(other.locator("[data-testid=answer-with-file]").count() == 0 and other.locator("[data-testid=version-upload]").count() == 0, "Versions: others can listen but not upload")

    # wanted slots
    page.goto(f"{BASE}/xenolab?tab=contribute&branch=b2"); page.wait_for_selector("[data-testid=tile-wanted]")
    check(page.locator("[data-testid=wanted-slot]").count() == 2 and "1 open" in page.locator("[data-testid=tile-wanted]").inner_text().lower(), "Wanted: slots listed with open count")
    check("taken" in page.locator("[data-testid=wanted-slot].taken").inner_text() and "Rainy" in page.locator("[data-testid=wanted-slot].taken").inner_text(), "Wanted: a claimed slot shows who has it")
    page.locator("[data-testid=wanted-slot].open a").click(); page.wait_for_selector("[data-testid=claiming]")
    check("30 s drone" in page.locator("[data-testid=claiming]").inner_text(), "Wanted: Claim opens the submit form for that slot")
    page.fill("#sub-title", "Drone"); page.fill("#sub-artist", "Tachy"); page.click("button:has-text('Start submission')"); page.wait_for_timeout(500)
    check(created and created[0].get("wantedId") == 11 and created[0]["targetBranchSlug"] == "b2", f"Wanted: the submission carries the slot {created[:1]}")

    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.goto(f"{BASE}/admin/branches/2/contribute"); admin.wait_for_selector("[data-testid=wanted-admin]")
    check(admin.locator("[data-testid=wanted-admin] li").count() == 2 and "claimed by" in admin.locator("[data-testid=wanted-admin]").inner_text(), "Admin: slots with claim status")
    admin.fill("[aria-label='Slot title']", "Bass tone"); admin.click("button:has-text('Add slot')"); admin.wait_for_timeout(400)
    check(added and added[0]["title"] == "Bass tone", f"Admin: slot added {added[:1]}")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
