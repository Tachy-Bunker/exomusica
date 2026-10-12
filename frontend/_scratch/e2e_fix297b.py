import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix297b.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

COLS = [{"id": 1, "key": "festival", "name": "Festival", "type": "text", "options": [], "hidden": False, "width": None},
        {"id": 2, "key": "status", "name": "Status", "type": "select", "options": ["Open", "Closed"], "hidden": False, "width": None}]
CONTACTS = [
  {"id": 1, "name": "Bea Lund", "email": "bea@mutek.org", "data": {"festival": "Mutek"}, "lastSentAt": "2026-09-01", "sentCount": 2, "followUpAt": "2026-10-01"},
  {"id": 2, "name": "Al Kern", "email": "al@atonal.org", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None},
]
SETTINGS = {"smtpHost": "smtp.x.org", "smtpPort": 465, "smtpSecure": True, "smtpUser": "me@x.org", "hasPassword": True, "fromName": "Tachy", "fromEmail": "me@x.org", "replyTo": "", "defaultCc": "", "defaultBcc": "me+copy@x.org",
            "imapHost": "", "imapPort": 993, "imapSecure": True, "sentFolder": "Sent", "fileInSent": False, "signatureMd": "— Tachy", "followUpDays": 14}
BLOCKS = [{"id": 1, "name": "Short bio", "blocks": [{"id": 1, "typeId": 1, "title": "50 words", "body": "Tachy is a sound artist."}]}]
sent = []; patches = []; previews = []; send_calls = []
state = {"first": True}

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});")
    def ok(route, b, s=200): route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]; m = req.method
        body = json.loads(req.post_data) if req.post_data and "json" in (req.headers.get("content-type") or "") else {}
        if key == "/api/admin/outreach/state": return ok(route, {"settings": SETTINGS, "columns": COLS, "contacts": CONTACTS, "blockTypes": BLOCKS, "today": "2026-10-12"})
        if key == "/api/admin/outreach/due": return ok(route, {"count": 1, "contacts": [{"id": 1, "name": "Bea Lund", "followUpAt": "2026-10-01"}]})
        if key == "/api/admin/outreach/preview":
            previews.append(body)
            return ok(route, {"html": "<html><body><p id='x'>Hello preview</p></body></html>", "text": "Hello", "subject": body.get("subject", ""), "missing": ["festival"] if "{{festival}}" in body.get("bodyMd", "") and body.get("contactId") == 2 else [], "warnings": [], "attachments": [{"filename": "demo.mp3", "kind": "file", "size": 2048}], "sampleContact": body.get("contactId") is None})
        if key == "/api/admin/outreach/send":
            send_calls.append(body)
            if "{{festival}}" in body.get("bodyMd", "") and not body.get("allowMissing") and 2 in body.get("contactIds", []):
                return ok(route, {"error": "Some fields are empty for some contacts.", "missing": [{"to": "Al Kern", "fields": ["festival"]}]}, 409)
            return ok(route, {"results": [{"to": "x", "ok": True}], "sent": max(1, len(body.get("contactIds", []))), "failed": 0, "skipped": [], "followUpAt": body.get("followUpAt"), "defaultFollowUp": "2026-10-26"})
        if key == "/api/admin/outreach/history": return ok(route, [{"id": 1, "contactId": 1, "to": "Bea Lund <bea@mutek.org>", "subject": "Hello", "sentAt": "2026-09-01T10:00:00Z", "ok": True, "note": None, "filedInSent": False}])
        if m == "PATCH" and key.startswith("/api/admin/outreach/contacts/"):
            patches.append((key, body)); i = int(key.rsplit("/", 1)[1]); c = next(x for x in CONTACTS if x["id"] == i)
            for k in ("name", "email", "lastSentAt", "sentCount", "followUpAt"):
                if k in body: c[k] = body[k]
            for k, v in (body.get("set") or {}).items():
                if v in (None, "", False): c["data"].pop(k, None)
                else: c["data"][k] = v
            return ok(route, c)
        if m == "POST" and key == "/api/admin/outreach/contacts":
            c = {"id": 3, "name": "", "email": "", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None}; CONTACTS.append(c); return ok(route, c, 201)
        if m == "POST" and key == "/api/admin/outreach/columns":
            c = {"id": 3, "key": "fee", "name": body["name"], "type": body["type"], "options": [], "hidden": False, "width": None}; COLS.append(c); return ok(route, c, 201)
        if m == "POST" and key == "/api/admin/outreach/files": return ok(route, {"url": "/uploads/outreach/ab-demo.mp3", "filename": "demo.mp3", "mimeType": "audio/mpeg", "sizeBytes": 10}, 201)
        if m == "POST" and key == "/api/admin/outreach/blocks": return ok(route, {"id": 2, "typeId": body["typeId"], "title": body["title"], "body": body["body"]}, 201)
        if key.startswith("/api/admin/join-requests"): return ok(route, [])
        if path in DATA: return ok(route, DATA[path])
        if key in DATA: return ok(route, DATA[key])
        return ok(route, {})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.goto(f"{BASE}/admin/outreach"); page.wait_for_selector("[data-testid=contact-row]")
    check(page.locator("[data-testid=contact-row]").count() == 2, "Sheet: both contacts shown")
    check("1 follow-up due" in page.locator(".ox-duechip").inner_text(), "Header: the due chip counts follow-ups that have come")
    check(page.locator(".admin-nav a[href='/admin/outreach'] .admin-nav-pending-dot").count() == 1, "Nav: a dot on Outreach when follow-ups are due")
    check(page.locator("tr.due").count() == 1 and "3 weeks ago" in page.locator("tr.due").inner_text() or "weeks ago" in page.locator("tr.due").inner_text(), "Sheet: relative dates shown, the due row is flagged")

    # edit a cell, the last-sent date, and the count (non-site sends)
    c1 = page.locator("[data-testid=contact-row]").first
    c1.locator("td").nth(3).locator("input").fill("Mutek Montréal"); c1.locator("td").nth(3).locator("input").press("Enter")
    page.wait_for_timeout(200)
    check(any(b.get("set", {}).get("festival") == "Mutek Montréal" for _, b in patches), "Cell: a typed value saves on Enter")
    c1.locator("input[aria-label='Times sent']").fill("5"); page.wait_for_timeout(700)
    check(any(b.get("sentCount") == 5 for _, b in patches), "Count: editable by hand, saved once typing pauses")
    c1.locator("input[aria-label='Last sent']").fill("2026-08-15"); page.wait_for_timeout(200)
    check(any(b.get("lastSentAt") == "2026-08-15" for _, b in patches), "Last sent: editable by hand")
    c1.locator("select").select_option("Open"); page.wait_for_timeout(200)
    check(any(b.get("set", {}).get("status") == "Open" for _, b in patches), "Choice column: picking saves")

    # search and filters
    page.fill(".ox-search", "atonal"); check(page.locator("[data-testid=contact-row]").count() == 1, "Search finds across the columns and email")
    page.fill(".ox-search", "")
    page.click("button:has-text('Follow-up due')"); check(page.locator("[data-testid=contact-row]").count() == 1, "Filter: only the follow-ups due")
    page.click("button:has-text('Follow-up due')")

    # columns
    page.click("button:has-text('Columns')"); page.wait_for_selector(".ox-modal")
    page.fill(".ox-addcol input", "Fee"); page.select_option(".ox-addcol select", "number"); page.click("button:has-text('Add column')"); page.wait_for_timeout(200)
    check(page.locator(".ox-collist li").count() == 3, "Columns: a typed column can be added")
    page.click(".ox-modal header button"); check(page.locator("th:has-text('Fee')").count() == 1, "Columns: it appears in the sheet")

    # export
    with page.expect_download() as dl: page.click("button:has-text('Export CSV')")
    check(dl.value.suggested_filename.endswith(".csv"), "Export: CSV downloads")
    with page.expect_download() as dl: page.click("button:has-text('JSON')")
    check(dl.value.suggested_filename.endswith(".json"), "Export: JSON downloads")

    # add a contact
    page.click("button:has-text('+ Contact')"); page.wait_for_timeout(200)
    check(page.locator("[data-testid=contact-row]").count() == 3, "Add: a blank row appears")

    # write to a contact: the ✉ button picks the recipient and goes to the composer
    page.locator("[data-testid=contact-row]").first.locator(".ox-write").click()
    check(page.locator(".ox-chip").count() == 1 and "Bea Lund" in page.locator(".ox-chips").inner_text(), "✉ puts that contact in To")
    check(page.locator(".ox-ccs input").nth(1).input_value() == "me+copy@x.org", "Bcc starts from the default")
    check(page.locator("input[aria-label='Follow-up date']").input_value() == "2026-10-26", "Follow-up date starts at today + the default days")

    # compose: toolbar + blocks + file + merge
    page.fill(".ox-subject", "Submission for {{festival}}")
    ta = page.locator("textarea.ox-body"); ta.fill("hello world"); ta.evaluate("e => e.setSelectionRange(0, 5)")
    page.click("button[aria-label='Underline (Ctrl+U)']"); check(ta.input_value() == "++hello++ world", "Toolbar: underline wraps the selection")
    ta.evaluate("e => e.setSelectionRange(e.value.length, e.value.length)")
    page.click("button:has-text('50 words')"); check("Tachy is a sound artist." in ta.input_value(), "Blocks: clicking a block inserts it")
    page.locator(".ox-toolbar select[aria-label='Insert merge field']").select_option("first_name"); check("{{first_name}}" in ta.input_value(), "Fields: the menu inserts a merge field")
    page.set_input_files(".ox-toolbar input[type=file]", {"name": "demo.mp3", "mimeType": "audio/mpeg", "buffer": b"abc"}); page.wait_for_timeout(300)
    check("@audio(/uploads/outreach/ab-demo.mp3)[demo]" in ta.input_value(), "Files: an upload becomes an attachment line")
    page.wait_for_timeout(700)
    check(len(previews) > 0 and previews[-1]["contactId"] == 1, "Preview: asked for the first recipient")
    check("Hello preview" in page.frame_locator("iframe.ox-frame").locator("#x").inner_text(), "Preview: the server's HTML is shown")
    check(page.locator("iframe.ox-frame").get_attribute("sandbox") == "", "Preview: sandboxed, no scripts")
    check("demo.mp3" in page.locator(".ox-atts").inner_text(), "Preview: attachments are listed")

    # new block from selection
    ta.evaluate("e => e.setSelectionRange(0, 7)")
    page.locator(".ox-btype-head button").first.click(); page.locator(".ox-btype-head button").first.click()
    page.click("text=+ Add a short bio"); page.fill(".ox-modal input", "Tiny"); page.click("button:has-text('Save block')"); page.wait_for_timeout(200)
    check(page.locator(".ox-bins:has-text('Tiny')").count() == 1, "Blocks: saving a new block adds it to its kind")

    # follow-up reminder buttons
    page.click("button:has-text('+1 wk')"); check(page.locator("input[aria-label='Follow-up date']").input_value() == "2026-10-19", "Follow-up: +1 wk")

    # send test
    page.click("button:has-text('Send test to myself')"); page.wait_for_selector(".ox-ok")
    check(send_calls[-1]["test"] is True and "Test sent" in page.locator(".ox-ok").inner_text(), "Test send goes to yourself")

    # send with a missing field -> 409 -> confirm
    page.locator("[data-testid=contact-row]").nth(1).locator("input[type=checkbox]").first.check()
    ta.fill("Dear {{first_name}}, about {{festival}}")
    page.on("dialog", lambda d: d.accept())
    page.click("button:has-text('Send to 2')"); page.wait_for_selector("text=Some merge fields are empty")
    check("Al Kern" in page.locator(".ox-warn[role=alert]").inner_text(), "Send: empty merge fields are listed before anything leaves")
    page.click("button:has-text('Send anyway')"); page.wait_for_selector(".ox-ok")
    last = send_calls[-1]
    check(last["allowMissing"] is True and last["followUpAt"] == "2026-10-19" and last["bcc"] == "me+copy@x.org" and sorted(last["contactIds"]) == [1, 2], "Send: ids, Bcc and reminder date are sent")

    # draft survives a reload
    page.wait_for_timeout(600); print("DRAFT", page.evaluate("localStorage.getItem('exomusica_outreach_draft_v1')")); page.reload(); page.wait_for_selector("textarea.ox-body")
    check("Dear {{first_name}}" in page.locator("textarea.ox-body").input_value(), "Draft: kept across a reload")

    # history
    page.click(".ox-history summary"); page.wait_for_selector(".ox-history li")
    check("Mutek" in page.locator(".ox-history").inner_text() or "bea@mutek.org" in page.locator(".ox-history").inner_text(), "History: lists what was sent")

    # settings
    page.click("button:has-text('Mail settings')"); page.wait_for_selector(".ox-modal")
    check(page.locator(".ox-modal input[type=password]").get_attribute("placeholder") == "••••••••", "Settings: a saved password is not shown")
    page.click(".ox-modal header button")

    # phone width: no sideways page scroll
    page.set_viewport_size({"width": 390, "height": 800}); page.wait_for_timeout(300)
    check(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Phone: the page itself doesn't scroll sideways (the sheet scrolls inside)")

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
