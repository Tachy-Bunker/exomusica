import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

def M(i, text, author="tachy", aid=1):
    return {"id": i, "channelId": 1, "authorId": aid, "authorUsername": author, "authorAvatarUrl": None, "unixTimestamp": 1790000000 + i, "replyToId": None, "replyPreview": None, "contentRaw": text, "attachments": [], "isDeleted": False, "editedAt": None, "reactions": [], "embeds": [], "kind": "text", "data": None, "pinned": False}
MSGS = [M(1, "my words")]
calls = []; audit_urls = []; trash = [{"id": 5, "text": "oops", "kind": "text", "author": "ghost9", "channel": {"slug": "hall", "name": "The Hall"}, "files": 2, "deletedAt": "2026-10-10T00:00:00Z", "daysLeft": 27}]
INBOX = {"total": 3, "counts": {"join": 1, "submission": 1, "reward": 1}, "items": [
    {"kind": "join", "id": 1, "title": "I make drones", "who": "neo", "at": int(__import__("time").time()*1000) - 3 * 86400000, "to": "/admin/join-requests"},
    {"kind": "submission", "id": 2, "title": "Drone → Full Branch", "who": "ghost9", "at": int(__import__("time").time()*1000) - 3600000, "to": "/admin/submissions"},
    {"kind": "reward", "id": 3, "title": "Sticker", "who": "ghost9", "at": int(__import__("time").time()*1000) - 60000, "to": "/admin/rewards"}]}

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/channels/hall/messages": return ok(MSGS)
            if key == "/api/channels/hall": return ok({"name": "The Hall", "font": None, "slug": "hall", "kind": "DISCUSSION", "id": 1, "branch": None})
            if key == "/api/channels/hall/archive": return ok([])
            if key == "/api/channels/hall/follow": return ok({"following": False})
            if key == "/api/messages/1" and req.method == "DELETE": calls.append("delete"); return route.fulfill(status=204, body="")
            if key == "/api/messages/1/restore": calls.append("restore"); return ok(MSGS[0])
            if key == "/api/messages/5/restore": calls.append("restore5"); return ok(M(5, "oops", "ghost9", 2))
            if key == "/api/admin/trash": return ok(trash)
            if key == "/api/admin/inbox": return ok(INBOX)
            if key == "/api/admin/audit-log": audit_urls.append(path); return ok([{"id": 1, "action": "message.moderate_delete", "targetType": "Message", "targetId": 4, "createdAt": "2026-10-10T10:00:00Z", "actor": {"username": "tachy"}}])
            if key == "/api/admin/audit-log.csv": audit_urls.append(path); return route.fulfill(status=200, content_type="text/csv", body="when_utc,admin\n")
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg

    page = mk(ME)
    page.goto(f"{BASE}/topic/hall"); page.wait_for_selector("text=my words")
    page.on("dialog", lambda d: d.accept())
    page.hover("text=my words")
    page.locator(".message-menu-trigger").first.click(force=True); page.locator(".message-menu-dropdown button:has-text('Delete')").click()
    page.wait_for_selector("[data-testid=toast-action]")
    check(calls == ["delete"] and page.locator("text=message deleted").count() >= 1, f"Trash: deleting hides the message {calls}")
    page.click("[data-testid=toast-action]"); page.wait_for_timeout(500)
    check(calls == ["delete", "restore"] and page.locator("text=my words").count() == 1, f"Trash: Undo restores it in place {calls}")

    admin = mk({"id": 1, "username": "tachy", "isAdmin": True})
    admin.on("dialog", lambda d: d.accept())
    admin.goto(f"{BASE}/admin/trash"); admin.wait_for_selector("[data-testid=trash-row]")
    check("27 d" in admin.locator("[data-testid=trash-row]").inner_text() and "2 files" in admin.locator("[data-testid=trash-row]").inner_text(), "Trash page: days left and file count")
    admin.click("text=Restore"); admin.wait_for_timeout(400)
    check("restore5" in calls, "Trash page: Restore calls the server")

    admin.goto(f"{BASE}/admin/inbox"); admin.wait_for_selector("[data-testid=inbox-item]")
    check(admin.locator("[data-testid=inbox-item]").count() == 3, "Inbox: all waiting items")
    check("neo" in admin.locator("[data-testid=inbox-item]").first.inner_text() and "3 d" in admin.locator("[data-testid=inbox-item]").first.inner_text(), "Inbox: longest wait first, with its age")
    admin.click("[data-testid=inbox-filter-submission]")
    check(admin.locator("[data-testid=inbox-item]").count() == 1, "Inbox: filter by kind")
    check(admin.locator(".admin-nav-pending-dot").count() == 1, "Inbox: the nav dot reflects the total")

    admin.goto(f"{BASE}/admin/audit-log"); admin.wait_for_selector("tbody tr")
    admin.fill("input[aria-label=Admin]", "tachy"); admin.fill("[aria-label=From]", "2026-10-01"); admin.wait_for_timeout(600)
    check("actor=tachy" in audit_urls[-1] and "from=2026-10-01" in audit_urls[-1], f"Audit: filters go to the server {audit_urls[-1]}")
    with admin.expect_download() as dl: admin.click("[data-testid=audit-export]")
    check(dl.value.suggested_filename == "action-log.csv" and "actor=tachy" in audit_urls[-1], "Audit: CSV export uses the same filters")

    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
