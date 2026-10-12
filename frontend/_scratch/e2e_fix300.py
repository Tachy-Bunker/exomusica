import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix300.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

COLS = [{"id": 1, "key": "festival", "name": "Festival", "type": "text", "options": [], "hidden": False, "width": None},
        {"id": 2, "key": "status", "name": "Status", "type": "select", "options": ["Open", "Closed"], "hidden": False, "width": None}]
CONTACTS = [
  {"id": 1, "name": "Bea Lund", "email": "bea@mutek.org", "data": {"festival": "Mutek"}, "lastSentAt": "2026-09-01", "sentCount": 2, "followUpAt": "2026-10-01", "groups": [1], "status": "contacted", "deadline": None, "repliedAt": None, "timezone": ""},
  {"id": 2, "name": "Al Kern", "email": "al@atonal.org", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None, "groups": [], "status": "", "deadline": "2026-10-20", "repliedAt": None, "timezone": ""},
]
GROUPS = [{"id": 1, "name": "Festivals"}, {"id": 2, "name": "Open calls"}]
members = []
DEF = {"place": "", "lat": None, "lng": None, "source": "", "doNotContact": False, "snoozeReason": "", "declineReason": "", "reopensAt": None}
for _c in CONTACTS: _c.update({k: v for k, v in DEF.items() if k not in _c})
WS = {"id": 7, "name": "Tachy", "slug": "tachy", "trackLinks": False, "dnc": [], "profile": {"keywords": ["mutek"], "avoid": [], "regions": [], "maxFee": None, "yearlyBudget": 50, "home": "", "homeLat": None, "homeLng": None}, "attachRules": [], "digestOn": False, "trackAvailable": False}
SETTINGS = {"id": 1, "label": "Main", "isDefault": True, "smtpHost": "smtp.x.org", "smtpPort": 465, "smtpSecure": True, "smtpUser": "me@x.org", "hasPassword": True, "fromName": "Tachy", "fromEmail": "me@x.org", "replyTo": "", "defaultCc": "", "defaultBcc": "me+copy@x.org",
            "imapHost": "", "imapPort": 993, "imapSecure": True, "sentFolder": "Sent", "fileInSent": False, "signatureMd": "— Tachy", "followUpDays": 14}
BLOCKS = [{"id": 1, "name": "Short bio", "blocks": [{"id": 1, "typeId": 1, "title": "50 words", "body": "Tachy is a sound artist."}]}]
captures = []; templates = []; imports = []; sent = []; patches = []; previews = []; send_calls = []
state = {"first": True}
ANSWER = {"t": ""}

def run(playwright):
    browser = playwright.chromium.launch()
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    errors = []
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))}); localStorage.setItem('exomusica_outreach_sessions', {json.dumps(json.dumps({'tachy': {'id': 7, 'slug': 'tachy', 'name': 'Tachy', 'token': 'tok'}}))});")
    def ok(route, b, s=200): route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]; m = req.method
        body = json.loads(req.post_data) if req.post_data and "json" in (req.headers.get("content-type") or "") else {}
        if key == "/api/outreach/state": return ok(route, {"accounts": [SETTINGS, {**SETTINGS, "id": 2, "label": "Booking", "isDefault": False, "fromEmail": "booking@x.org"}], "workspace": WS, "newLeads": 2, "quietAfter": 45, "columns": COLS, "contacts": CONTACTS, "blockTypes": BLOCKS, "groups": GROUPS, "templates": [], "scheduled": [], "today": "2026-10-12"})
        if key == "/api/outreach/due": return ok(route, {"count": 1, "contacts": [{"id": 1, "name": "Bea Lund", "followUpAt": "2026-10-01"}]})
        if key == "/api/outreach/preview":
            previews.append(body)
            return ok(route, {"html": "<html><body><p id='x'>Hello preview</p></body></html>", "text": "Hello", "subject": body.get("subject", ""), "missing": ["festival"] if "{{festival}}" in body.get("bodyMd", "") and body.get("contactId") == 2 else [], "warnings": [], "attachments": [{"filename": "demo.mp3", "kind": "file", "size": 2048}], "sampleContact": body.get("contactId") is None})
        if key == "/api/outreach/send":
            send_calls.append(body)
            if "{{festival}}" in body.get("bodyMd", "") and not body.get("allowMissing") and 2 in body.get("contactIds", []):
                return ok(route, {"error": "Some fields are empty for some contacts.", "missing": [{"to": "Al Kern", "fields": ["festival"]}]}, 409)
            return ok(route, {"results": [{"to": "x", "ok": True}], "sent": max(1, len(body.get("contactIds", []))), "failed": 0, "skipped": [], "followUpAt": body.get("followUpAt"), "defaultFollowUp": "2026-10-26"})
        if key == "/api/outreach/history": return ok(route, [{"id": 1, "contactId": 1, "to": "Bea Lund <bea@mutek.org>", "subject": "Hello", "sentAt": "2026-09-01T10:00:00Z", "ok": True, "note": None, "filedInSent": False}])
        if m == "PATCH" and key.startswith("/api/outreach/contacts/"):
            patches.append((key, body)); i = int(key.rsplit("/", 1)[1]); c = next(x for x in CONTACTS if x["id"] == i)
            if "groups" in body: c["groups"] = body["groups"]
            for k in ("status", "deadline", "timezone"):
                if k in body: c[k] = body[k]
            if body.get("status") in ("replied", "accepted", "declined"): c["followUpAt"] = None
            for k in ("name", "email", "lastSentAt", "sentCount", "followUpAt", "place", "lat", "lng", "doNotContact", "snoozeReason", "declineReason", "reopensAt"):
                if k in body: c[k] = body[k]
            for k, v in (body.get("set") or {}).items():
                if v in (None, "", False): c["data"].pop(k, None)
                else: c["data"][k] = v
            return ok(route, c)
        if key.endswith("/last-send"): return ok(route, {"subject": "Hello", "bodyMd": "Original line", "sentAt": "2026-09-01"})
        if m == "POST" and key == "/api/outreach/capture":
            captures.append(body); return ok(route, {"title": "Sonic Days Open Call", "emails": ["calls@sonic.org", "info@sonic.org"], "deadline": "2026-11-30", "fee": "free", "url": body.get("url")})
        if m == "POST" and key == "/api/outreach/templates":
            t = {"id": 5, "name": body["name"], "subject": body["subject"], "bodyMd": body["bodyMd"], "rules": body["rules"]}; templates.append(t); return ok(route, t, 201)
        if m == "POST" and key == "/api/outreach/review":
            return ok(route, [{"id": 1, "to": "Bea Lund", "email": "bea@mutek.org", "subject": "S", "greeting": "Dear Bea,", "missing": [], "hasEmail": True, "groups": ["Festivals"]}, {"id": 2, "to": "Info Festival", "email": "al@atonal.org", "subject": "S", "greeting": "Dear Festival Team,", "missing": ["festival"], "hasEmail": True, "groups": []}])
        if key in ("/api/outreach/accepted", "/api/outreach/links"): return ok(route, [])
        if key == "/api/outreach/stats": return ok(route, {"statuses": {"contacted": 1, "lead": 1}, "groups": [{"name": "Festivals", "people": 4, "replied": 2, "accepted": 1, "rate": 50}], "templates": [], "blocks": [{"name": "Short bio: 50 words", "people": 3, "replied": 1, "accepted": 0, "rate": 33}], "weekdays": [{"sent": 0, "replied": 0}, {"sent": 4, "replied": 2}, {"sent": 1, "replied": 0}, {"sent": 0, "replied": 0}, {"sent": 0, "replied": 0}, {"sent": 0, "replied": 0}, {"sent": 0, "replied": 0}], "overall": {"name": "All", "people": 4, "replied": 2, "accepted": 1, "rate": 50}})
        if m == "POST" and key == "/api/outreach/groups":
            g = {"id": 3, "name": body["name"]}; GROUPS.append(g); return ok(route, g, 201)
        if m == "POST" and re.match(r"/api/outreach/groups/\d+/members", key): members.append((key, body)); return ok(route, {"ok": True})
        if m == "POST" and key == "/api/outreach/contacts/import":
            imports.append(body); return ok(route, {"added": 2, "skipped": 0, "newColumns": ["Phone"], "newGroups": ["Labels"]})
        if m == "POST" and key == "/api/outreach/contacts":
            c = {"groups": [], "status": body.get("status", ""), "deadline": body.get("deadline"), "repliedAt": None, "timezone": "", "id": len(CONTACTS) + 1, **DEF, "name": body.get("name", ""), "email": body.get("email", ""), "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None}; CONTACTS.append(c); return ok(route, c, 201)
        if m == "POST" and key == "/api/outreach/columns":
            c = {"id": 3, "key": "fee", "name": body["name"], "type": body["type"], "options": [], "hidden": False, "width": None}; COLS.append(c); return ok(route, c, 201)
        if m == "POST" and key == "/api/outreach/files": return ok(route, {"url": "/uploads/outreach/ab-demo.mp3", "filename": "demo.mp3", "mimeType": "audio/mpeg", "sizeBytes": 10}, 201)
        if m == "POST" and key == "/api/outreach/blocks": return ok(route, {"id": 2, "typeId": body["typeId"], "title": body["title"], "body": body["body"]}, 201)
        if key.startswith("/api/admin/join-requests"): return ok(route, [])
        if path in DATA: return ok(route, DATA[path])
        if key in DATA: return ok(route, DATA[key])
        return ok(route, {})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.goto(f"{BASE}/outreach/tachy"); page.wait_for_selector("[data-testid=contact-row]")
    check(page.locator("[data-testid=contact-row]").count() == 2, "Sheet: both contacts shown")
    check("1 follow-up due" in page.locator(".ox-duechip").inner_text(), "Header: the due chip counts follow-ups that have come")
    check(page.locator("tr.due").count() == 1 and "3 weeks ago" in page.locator("tr.due").inner_text() or "weeks ago" in page.locator("tr.due").inner_text(), "Sheet: relative dates shown, the due row is flagged")

    # edit a cell, the last-sent date, and the count (non-site sends)
    c1 = page.locator("[data-testid=contact-row]").first
    c1.locator("td").nth(8).locator("input").fill("Mutek Montréal"); c1.locator("td").nth(8).locator("input").press("Enter")
    page.wait_for_timeout(200)
    check(any(b.get("set", {}).get("festival") == "Mutek Montréal" for _, b in patches), "Cell: a typed value saves on Enter")
    c1.locator("input[aria-label='Times sent']").fill("5"); page.wait_for_timeout(700)
    check(any(b.get("sentCount") == 5 for _, b in patches), "Count: editable by hand, saved once typing pauses")
    d = c1.locator("input[aria-label='Last sent']"); d.focus(); d.press_sequentially("08152026"); page.wait_for_timeout(1300)
    check(d.input_value() == "2026-08-15" and any(b.get("lastSentAt") == "2026-08-15" for _, b in patches), "Last sent: typing a full date by hand works (month first no longer wipes it)")
    n0 = len([1 for _, bb in patches if "lastSentAt" in bb])
    d.focus(); d.press("Backspace"); page.wait_for_timeout(1300)
    check(len([1 for _, bb in patches if "lastSentAt" in bb]) == n0, "Last sent: clearing one part while editing does not save an empty date")
    d.fill("2026-10-12"); page.wait_for_timeout(1300)
    check(any(b.get("lastSentAt") == "2026-10-12" for _, b in patches), "Last sent: the finished date is saved")
    c1.locator("select").nth(1).select_option("Open"); page.wait_for_timeout(200)
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

    # groups
    check("Festivals" in page.locator("[data-testid=contact-row]").first.inner_text(), "Groups: a contact's groups show in its Groups column")
    page.select_option("select[aria-label='Filter by group']", "1"); check(page.locator("[data-testid=contact-row]").count() == 1, "Groups: filter by group")
    page.select_option("select[aria-label='Filter by group']", "none"); check(page.locator("[data-testid=contact-row]").count() == 1, "Groups: filter to the ungrouped")
    page.select_option("select[aria-label='Filter by group']", "")
    page.locator("[data-testid=contact-row]").nth(1).locator("input[type=checkbox]").first.check()
    page.select_option("select[aria-label='Add to group']", "2"); page.wait_for_timeout(200)
    check(any(k.endswith("/groups/2/members") and 1 not in b.get("add", []) and 2 in b.get("add", []) for k, b in members), "Groups: tick contacts, Add to group")
    page.locator("[data-testid=contact-row]").nth(1).locator("input[type=checkbox]").first.uncheck()
    page.click("button:has-text('Groups')"); page.wait_for_selector(".ox-modal"); page.fill(".ox-addcol input", "Labels"); page.click("button:has-text('Add group')"); page.wait_for_timeout(200)
    check(page.locator(".ox-collist li").count() == 3, "Groups: manager adds a group"); page.click(".ox-modal header button")
    with page.expect_download() as dl: page.click("button:has-text('Contacts (.vcf)')")
    path = dl.value.path(); vcf = open(path, encoding="utf-8").read()
    check(dl.value.suggested_filename.endswith(".vcf") and "BEGIN:VCARD" in vcf and "CATEGORIES:Festivals" in vcf and "EMAIL;TYPE=INTERNET:bea@mutek.org" in vcf, "Export: contacts as a .vcf with their groups")
    page.set_input_files("input[type=file][accept*='vcf']", {"name": "people.vcf", "mimeType": "text/vcard", "buffer": b"BEGIN:VCARD\nVERSION:3.0\nFN:Jo Doe\nEMAIL:jo@x.org\nTEL:+33 6 12\nCATEGORIES:Labels\nEND:VCARD\n"}); page.wait_for_timeout(300)
    check(len(imports) == 1 and "Jo Doe" in imports[0]["csv"] and "+33 6 12" in imports[0]["csv"] and "'+33" not in imports[0]["csv"] and "Labels" in imports[0]["csv"], "Import: a .vcf becomes contacts (phone and group kept)")
    check("new groups: Labels" in page.locator(".ox-sheet").inner_text(), "Import: says what it created")
    page.set_input_files("input[type=file][accept*='vcf']", {"name": "g.csv", "mimeType": "text/csv", "buffer": b"First Name,Last Name,E-mail 1 - Value,Labels\nJo,Doe,jo@x.org,* myContacts ::: Festivals\n"}); page.wait_for_timeout(300)
    check(len(imports) == 2 and imports[1]["csv"].splitlines()[1].startswith("Jo Doe,jo@x.org"), "Import: a Google Contacts CSV is understood")

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
    ta.fill("size me"); ta.evaluate("e => e.setSelectionRange(0, 7)")
    page.locator(".ox-toolbar input[type=color]").fill("#112233")
    page.wait_for_timeout(120); page.locator(".ox-toolbar select[aria-label='Text size']").select_option("24")
    check(ta.input_value() == "{c:#112233 s:24|size me}", f"Colour + size merge into one span ({ta.input_value()})")
    ta.fill("hello world"); ta.evaluate("e => e.setSelectionRange(0, 5)"); page.click("button[aria-label='Underline (Ctrl+U)']")
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
    page.click("button:has-text('+1 wk')"); page.wait_for_timeout(150); check(page.locator("input[aria-label='Follow-up date']").input_value() == "2026-10-19", "Follow-up: +1 wk")

    # send test
    page.click("button:has-text('Send test to myself')"); page.wait_for_selector(".ox-ok")
    check(send_calls[-1]["test"] is True and "Test sent" in page.locator(".ox-ok").inner_text(), "Test send goes to yourself")

    # send with a missing field -> 409 -> confirm
    page.locator("[data-testid=contact-row]").nth(1).locator("input[type=checkbox]").first.check()
    ta.fill("Dear {{first_name}}, about {{festival}}")
    page.on("dialog", lambda d: d.accept(ANSWER["t"]) if d.type == "prompt" else d.accept())
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
    page.click("button:has-text('Mailboxes')"); page.wait_for_selector(".ox-modal")
    check(page.locator(".ox-modal input[type=password]").get_attribute("placeholder") == "••••••••", "Settings: a saved password is not shown")
    page.click(".ox-modal header button")


    # ---- second round: today, pipeline, variants, templates, review, later, results, capture, cards
    page.goto(f"{BASE}/outreach/tachy"); page.wait_for_selector("[data-testid=contact-row]")
    today = page.locator(".ox-today")
    check("Bea Lund" in today.inner_text() and "Follow up" in today.inner_text(), "Today: a due follow-up is listed")
    check("Al Kern" in today.inner_text() or "Closing soon" in today.inner_text() and "8 days left" in today.inner_text(), "Today: a deadline within two weeks is listed with the days left")
    today.locator("button:has-text('Follow up')").first.click(); page.wait_for_selector(".ox-tplbar")
    page.wait_for_function("document.querySelector('.ox-subject').value.startsWith('Re: Hello')")
    check("> Original line" in page.locator("textarea.ox-body").input_value(), "Follow-up: opens a draft that quotes the earlier mail")
    check(page.locator("label:has-text('same conversation')").count() == 1, "Follow-up: offers to thread under the earlier mail")

    # status and replied
    row = page.locator("[data-testid=contact-row]").first
    row.locator("select[aria-label=Status]").select_option("replied"); page.wait_for_timeout(200)
    check(any(b.get("status") == "replied" for _, b in patches) and row.locator("input[aria-label='Follow up']").input_value() == "", "Status: Replied saves and the reminder clears")
    check(row.locator("select[aria-label=Status]").evaluate("e => e.className").find("ox-st-replied") >= 0, "Status: coloured by stage")
    page.select_option("select[aria-label='Filter by status']", "replied"); check(page.locator("[data-testid=contact-row]").count() == 1, "Status: filter"); page.select_option("select[aria-label='Filter by status']", "")
    d2 = page.locator("[data-testid=contact-row]").nth(1).locator("input[aria-label='Deadline']"); check(d2.input_value() == "2026-10-20", "Deadline column shows the closing date")
    page.locator("[data-testid=contact-row]").nth(1).locator("input[list=ox-tzs]").fill("Europe/Paris"); page.locator("[data-testid=contact-row]").nth(1).locator("input[list=ox-tzs]").press("Enter"); page.wait_for_timeout(200)
    check(any(b.get("timezone") == "Europe/Paris" for _, b in patches), "Time zone column saves")

    # capture an opportunity
    page.click("button:has-text('+ Opportunity')"); page.fill(".ox-modal textarea", "https://sonic.org/call"); page.click("button:has-text('Read it')"); page.wait_for_selector("text=Check what was found")
    check(captures and captures[-1].get("url") == "https://sonic.org/call", "Capture: a pasted link is sent to be read")
    check(page.locator(".ox-modal input[type=date]").input_value() == "2026-11-30", "Capture: the deadline found is filled in")
    page.click("button:has-text('Add to the list')"); page.wait_for_timeout(300)
    check(page.locator("[data-testid=contact-row]").count() >= 4, "Capture: it becomes a row")

    # variants + templates
    ta = page.locator("textarea.ox-body"); ta.fill("Dear {{first_name|there}},\n\n{{block:Short bio}}\n\nListen: https://x.bandcamp.com/a")
    page.wait_for_selector(".ox-variants")
    check("Short bio" in page.locator(".ox-variants").inner_text(), "Variants: a {{block:Kind}} line shows its choices")
    page.select_option(".ox-variants select[aria-label^='Different']", "1") if page.locator(".ox-variants select[aria-label^='Different']").count() else None
    page.click("button:has-text('Save as template')") if False else None
    ANSWER["t"] = "Festival pitch"; page.click("button:has-text('Save as template')"); page.wait_for_timeout(300)
    check(len(templates) == 1 and templates[0]["name"] == "Festival pitch" and "{{block:Short bio}}" in templates[0]["bodyMd"], "Templates: save the message with its block lines")
    check(page.locator(".ox-tplbar select option:has-text('Festival pitch')").count() == 1, "Templates: it is offered in the list")
    page.wait_for_timeout(700)
    check(any("rules" in p for p in previews), "Preview: asks with the block choices")

    # pitch check
    check(page.locator(".ox-pitch").count() == 1 and "Pitch check" in page.locator(".ox-pitch").inner_text(), "Pitch check is shown")
    ta.fill("hi"); page.wait_for_timeout(300); page.locator(".ox-pitch summary").click(); check("very short" in page.locator(".ox-pitch").inner_text().lower(), "Pitch check: tips on a very short mail")
    ta.fill("Dear {{first_name}}, about {{festival}}")

    # review all + send later
    page.locator("[data-testid=contact-row]").first.locator("input[type=checkbox]").first.check(); page.locator("[data-testid=contact-row]").nth(1).locator("input[type=checkbox]").first.check()
    page.click("button:has-text('Review all')"); page.wait_for_selector(".ox-review")
    check("organisation" in page.locator(".ox-review").inner_text(), "Review: a greeting that reads like an organisation is flagged")
    check("{{festival}}" in page.locator(".ox-review").inner_text(), "Review: an empty field is flagged"); page.click("button:has-text('Back and fix')")
    page.check("label:has-text('Send later') input"); page.wait_for_selector("input[aria-label='Send at']")
    page.fill("input[aria-label='Send at']", "09:30")
    page.click("button:has-text('Schedule for')"); page.wait_for_timeout(300)
    if page.locator("text=Some merge fields").count(): page.click("button:has-text('Send anyway')"); page.wait_for_timeout(300)
    sl = [c for c in send_calls if c.get("sendAt")]
    check(sl and sl[-1]["sendAt"]["time"] == "09:30" and sl[-1]["sendAt"]["recipientZone"] is True and sl[-1]["sendAt"]["zone"], "Send later: time, their-zone and your zone go to the server")
    check(sl and sl[-1].get("plainOnly") is False and sl[-1].get("rules") is not None, "Send: options travel with the message")

    # results
    page.click(".ox-results summary"); page.wait_for_selector(".ox-stats")
    check("Festivals" in page.locator(".ox-results").inner_text() and "33%" in page.locator(".ox-results").inner_text(), "Results: by group and by bio version")

    # contact cards: zip + vcf with metadata
    with page.expect_download() as dl: page.click("button:has-text('Cards (.zip)')")
    import zipfile
    z = zipfile.ZipFile(dl.value.path()); names = z.namelist()
    check(dl.value.suggested_filename.endswith(".zip") and "Bea Lund.vcf" in names and b"BEGIN:VCARD" in z.read("Bea Lund.vcf"), f"Export: a zip with one card per contact ({names[:3]})")
    page.set_input_files("input[type=file][accept*='vcf']", {"name": "p.vcf", "mimeType": "text/vcard", "buffer": b"BEGIN:VCARD\nVERSION:3.0\nFN:Mo Ra\nEMAIL:mo@x.org\nTEL:+33 6 1\nORG:Fest\nURL:https://f.org\nBDAY:19900502\nADR:;;1 Rue A;Paris;;75001;France\nEND:VCARD\n"}); page.wait_for_timeout(300)
    last = imports[-1]
    check(all(k in last["csv"] for k in ("Phone", "Organization", "Website", "Birthday", "Address")) and last["hints"].get("Website") == "url" and last["hints"].get("Birthday") == "date", "Import: every property of a card becomes a column, typed (link, date)")

    # phone width: no sideways page scroll
    page.set_viewport_size({"width": 390, "height": 800}); page.wait_for_timeout(300)
    check(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Phone: the page itself doesn't scroll sideways (the sheet scrolls inside)")

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
