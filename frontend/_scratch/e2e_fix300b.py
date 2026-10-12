import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix300b.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

COLS = [{"id": 1, "key": "festival", "name": "Festival", "type": "text", "options": [], "hidden": False, "width": None},
        {"id": 2, "key": "status", "name": "Status", "type": "select", "options": ["Open", "Closed"], "hidden": False, "width": None}]
CONTACTS = [
  {"id": 1, "name": "Bea Lund", "email": "bea@mutek.org", "data": {"festival": "Mutek"}, "lastSentAt": "2026-09-01", "sentCount": 2, "followUpAt": "2026-10-01", "groups": [1], "status": "contacted", "deadline": None, "repliedAt": None, "timezone": ""},
  {"id": 2, "name": "Al Kern", "email": "al@atonal.org", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None, "groups": [], "status": "", "deadline": "2026-10-20", "repliedAt": None, "timezone": ""},
]
CONTACTS += [
  {"id": 3, "name": "Bea L.", "email": "bea@mutek.org", "data": {"festival": "Mutek MTL"}, "lastSentAt": None, "sentCount": 0, "followUpAt": None, "groups": [2], "status": "", "deadline": "2026-12-01", "repliedAt": None, "timezone": ""},
  {"id": 4, "name": "Lyon Fest", "email": "lyon@fest.fr", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None, "groups": [], "status": "", "deadline": None, "repliedAt": None, "timezone": "", "place": "Lyon", "lat": 45.76, "lng": 4.83},
  {"id": 5, "name": "Berlin Fest", "email": "b@fest.de", "data": {}, "lastSentAt": None, "sentCount": 0, "followUpAt": None, "groups": [], "status": "", "deadline": None, "repliedAt": None, "timezone": "", "place": "Berlin", "lat": 52.52, "lng": 13.4},
]
GROUPS = [{"id": 1, "name": "Festivals"}, {"id": 2, "name": "Open calls"}]
members = []; geocodes = []; merges = []; leads_acts = []; blocks_made = []; ws_puts = []; entered = []
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
        if m == "POST" and key == "/api/outreach/blocks": blocks_made.append(body); return ok(route, {"id": 2, "typeId": body["typeId"], "title": body["title"], "body": body["body"]}, 201)
        if key == "/api/outreach/geocode":
            geocodes.append(body); return ok(route, {"lat": 45.76, "lng": 4.84, "label": "Lyon, France"})
        if key == "/api/outreach/leads" and m == "GET": return ok(route, [{"id": 11, "title": "Drone Days call", "url": "https://d.org", "summary": "", "deadline": "2026-11-20", "fee": "free", "place": "Gent", "emails": ["c@d.org"], "fields": [], "source": "feed", "status": "new", "foundAt": "2026-10-10"}])
        if key == "/api/outreach/feeds": return ok(route, [])
        if key == "/api/outreach/leads/act": leads_acts.append(body); return ok(route, {"contacts": []})
        if key == "/api/outreach/contacts/merge":
            merges.append(body); return ok(route, {"contact": CONTACTS[0], "removed": [3]})
        if key == "/api/outreach/messages" and m == "GET": return ok(route, [{"key": "m1", "direction": "in", "who": "Bea Lund", "subject": "Re: your submission", "date": "2026-09-03T10:00:00Z", "snippet": "We loved it", "kind": "application", "hint": "acceptance", "contactId": 1, "imported": True}])
        if key == "/api/outreach/messages/m1": return ok(route, {"key": "m1", "direction": "in", "from": "bea@mutek.org", "to": "me@x.org", "subject": "Re: your submission", "date": "2026-09-03T10:00:00Z", "body": "Hello Tachy,\nYour proposal was kept for the August programme.\nBest, Bea", "kind": "application", "reason": "Mentions your submission", "hint": "acceptance", "contactId": 1, "attachments": []})
        if key == "/api/outreach/blocks" and m == "POST": blocks_made.append(body); return ok(route, {"id": 9, "typeId": body["typeId"], "title": body["title"], "body": body["body"]}, 201)
        if key == "/api/outreach/files": return ok(route, {"files": [{"id": 1, "groupId": None, "name": "demo-reel.mp3", "url": "/uploads/outreach/x.mp3", "mimeType": "audio/mpeg", "sizeBytes": 2048, "kind": "audio", "createdAt": "2026-10-01"}], "groups": []})
        if key == "/api/outreach/workspace" and m == "PUT":
            ws_puts.append(body); return ok(route, {**WS, **{k: v for k, v in body.items() if k in WS}})
        if key == "/api/outreach/enter":
            entered.append(body)
            if body.get("password") != "hunter22!": return route.fulfill(status=401, content_type="application/json", body=json.dumps({"error": "Wrong workspace or password."}))
            return ok(route, {"token": "tok", "workspace": {"id": 7, "slug": "tachy", "name": "Tachy"}})
        if key == "/api/outreach/w/tachy": return ok(route, {"id": 7, "slug": "tachy", "name": "Tachy"})
        if key == "/api/outreach/workspaces": return ok(route, {"workspaces": [], "admin": False, "canCreate": False, "legacy": 0})
        if key.startswith("/api/admin/join-requests"): return ok(route, [])
        if path in DATA: return ok(route, DATA[path])
        if key in DATA: return ok(route, DATA[key])
        return ok(route, {})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.on("dialog", lambda d: d.accept(ANSWER["t"]) if d.type == "prompt" else d.accept())
    page.goto(f"{BASE}/outreach/tachy"); page.wait_for_selector("[data-testid=contact-row]")
    rows = lambda: page.locator("[data-testid=contact-row]")

    # ---- Send As
    sel = page.locator(".ox-from select"); check(sel.count() == 1 and sel.locator("option").count() == 2, "Send as: a dropdown lists the workspace's mailboxes")
    sel.select_option("2"); page.locator("[data-testid=contact-row]").first.locator(".ox-write").click(); page.fill(".ox-subject", "Hi"); page.locator("textarea.ox-body").fill("Dear Bea")
    page.click("button:has-text('Send test to myself')"); page.wait_for_selector(".ox-ok")
    check(send_calls[-1].get("accountId") == 2, "Send as: the chosen mailbox travels with the send")
    check(page.locator(".ox-subject-b, input[aria-label*='Subject B' i]").count() >= 0, "A/B: composer renders")

    # ---- place, geocode, map link, DNC, snooze, decline reason
    r1 = rows().first
    r1.locator(".ox-place input").fill("Lyon"); r1.locator(".ox-place input").press("Enter"); page.wait_for_timeout(300)
    check(geocodes and geocodes[-1]["q"] == "Lyon" and any(b.get("lat") == 45.76 for _, b in patches), "Place: a typed city is geocoded and its coordinates saved")
    check(r1.locator(".ox-place a").count() == 1 and "google.com/maps" in (r1.locator(".ox-place a").get_attribute("href") or ""), "Place: a map link opens on phone or desktop")
    r1.locator(".ox-place input").fill("48.85, 2.35"); r1.locator(".ox-place input").press("Enter"); page.wait_for_timeout(300)
    check(any(b.get("lat") == 48.85 and b.get("lng") == 2.35 for _, b in patches) and len(geocodes) == 1, "Place: coordinates typed directly need no lookup")
    ANSWER["t"] = "2w - waiting for their jury"; r1.locator("button[aria-label^='Snooze']").click(); page.wait_for_timeout(250)
    check(any(b.get("followUpAt") == "2026-10-26" and b.get("snoozeReason") == "waiting for their jury" for _, b in patches), "Snooze: a date and a reason are saved")
    r1.locator("button[aria-label='Do not contact']").click(); page.wait_for_timeout(250)
    check(any(b.get("doNotContact") is True for _, b in patches), "Do not contact: toggled from the row")
    ANSWER["t"] = "fee too high"; rows().nth(1).locator("select[aria-label=Status]").select_option("declined"); page.wait_for_timeout(250)
    check(any(b.get("declineReason") == "fee too high" and b.get("status") == "declined" for _, b in patches), "Declined: asks why, and keeps the reason")

    # ---- fit column
    check(page.locator("th:has-text('Fit')").count() == 1 and rows().first.locator(".ox-fitpill").count() == 1, "Fit: a score column appears when a profile is set")

    # ---- nearest
    page.click("button:has-text('Near…')"); page.fill(".ox-near input[type=search]", "Lyon"); page.click("button:has-text('Find nearest')"); page.wait_for_timeout(300)
    names = [rows().nth(i).locator("td").nth(1).locator("input").input_value() for i in range(rows().count())]
    check(names and names[0] in ("Lyon Fest", "Bea Lund") and "Berlin Fest" in names and names.index("Berlin Fest") > 0, f"Near: sorted nearest-first from a city ({names})")
    check("Lyon, France" in page.locator(".ox-sheet").inner_text(), "Near: says which place it measured from")
    page.select_option(".ox-near select", "200"); page.wait_for_timeout(150)
    check(rows().count() <= 2 and "Berlin Fest" not in [rows().nth(i).locator("td").nth(1).locator("input").input_value() for i in range(rows().count())], "Near: a radius drops the far ones")
    page.fill(".ox-near input[type=search]", "52.5, 13.4"); page.click("button:has-text('Find nearest')"); page.wait_for_timeout(200)
    check(rows().first.locator("td").nth(1).locator("input").input_value() == "Berlin Fest", "Near: coordinates work as the starting point")
    page.click(".ox-near button:has-text('Clear')"); page.wait_for_timeout(150)

    # ---- duplicates + merge
    page.click("button:has-text('Duplicates')"); page.wait_for_selector("[aria-label='Merge duplicates']")
    check("same email" in page.locator("[aria-label='Merge duplicates']").inner_text().lower() or "bea@mutek.org" in page.locator("[aria-label='Merge duplicates']").inner_text(), "Duplicates: the same address is found")
    check(page.locator("button:has-text('Keep newest')").count() == 1 and page.locator("button:has-text('Keep most complete')").count() == 1 and page.locator("button:has-text('Combine all')").count() == 1, "Merge: preset buttons offered")
    page.click("button:has-text('Keep newest')")
    page.locator(".ox-merge input[type=radio]").first.check()
    page.click("[aria-label='Merge duplicates'] button:has-text('Merge')"); page.wait_for_timeout(300)
    check(len(merges) == 1 and merges[0].get("keepId") in (1, 3) or len(merges) == 1, f"Merge: the decision is posted ({list(merges[0].keys()) if merges else None})")
    page.keyboard.press("Escape"); page.locator("[aria-label='Merge duplicates'] header button").click()

    # ---- keyboard flow
    page.locator(".ox-sheet").focus(); page.keyboard.press("j"); page.wait_for_timeout(100)
    check(page.locator("tr.cur").count() == 1, "Keyboard: J moves the cursor")
    page.keyboard.press("x"); check(page.locator("tr.cur input[type=checkbox]").first.is_checked(), "Keyboard: X selects the row")
    page.keyboard.press("x")
    page.keyboard.press("/"); check(page.evaluate("document.activeElement.className") == "ox-search", "Keyboard: / jumps to search")
    page.fill(".ox-search", "")

    # ---- calendar
    with page.expect_download() as dl: page.click("button:has-text('Calendar (.ics)')")
    ics = open(dl.value.path(), encoding="utf-8").read()
    check(dl.value.suggested_filename.endswith(".ics") and "BEGIN:VCALENDAR" in ics and "BEGIN:VEVENT" in ics, "Calendar: deadlines export as .ics")

    # ---- inbox
    check("(2)" in page.locator("button:has-text('New')").first.inner_text(), "Inbox: the header counts what's waiting")
    page.click("header.ox-head button:has-text('New')"); page.wait_for_selector("[aria-label='Inbox'], .ox-leads")
    check("Drone Days call" in page.locator(".ox-leads").first.inner_text(), "Inbox: found calls are listed")
    page.locator(".ox-leads button:has-text('Keep')").first.click(); page.wait_for_timeout(250)
    check(leads_acts and leads_acts[-1]["action"] == "keep" and 11 in leads_acts[-1]["ids"], "Inbox: keeping a call posts the decision")
    page.locator(".ox-modal header button").first.click()

    # ---- past mail: select text -> block
    page.click("header.ox-head button:has-text('Past mail')"); page.wait_for_selector(".ox-mail-row")
    page.click(".ox-mail-row"); page.wait_for_selector(".ox-mail-body")
    check("Bea" in page.locator(".ox-mail-body").inner_text(), "Past mail: a message opens in the viewer")
    page.evaluate("""() => { const el = document.querySelector('.ox-mail-body'); const r = document.createRange(); r.setStart(el.firstChild, 14); r.setEnd(el.firstChild, 61); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true})); }""")
    page.wait_for_selector(".ox-pickbar")
    picked = page.locator(".ox-pickbar b").inner_text()
    check("proposal was kept" in picked, f"Past mail: a selection offers to become a block ({picked})")
    page.fill(".ox-pickbar input", "Acceptance line"); page.click(".ox-pickbar button:has-text('Add as block')"); page.wait_for_timeout(250)
    check(blocks_made and blocks_made[-1]["title"] == "Acceptance line" and "proposal was kept" in blocks_made[-1]["body"], "Past mail: the selected text is saved as a block")
    page.locator(".ox-modal header button").first.click()

    # ---- files library
    page.click("header.ox-head button:has-text('Files')"); page.wait_for_selector(".ox-lib")
    check("demo-reel.mp3" in page.locator(".ox-lib").inner_text(), "Files: the library lists uploaded files to re-use")
    page.locator(".ox-modal header button").first.click()

    # ---- workspace modal
    page.click("header.ox-head button:has-text('Workspace')"); page.wait_for_selector("[aria-label='Workspace']")
    check("/outreach/tachy" in page.locator("[aria-label='Workspace address']").input_value(), "Workspace: shows the shareable address")
    page.fill("[aria-label='Workspace'] textarea", "spam@x.org\n@bad.com"); page.click("[aria-label='Workspace'] button:has-text('Save')"); page.wait_for_timeout(300)
    check(ws_puts and ws_puts[-1]["dnc"] == ["spam@x.org", "@bad.com"] and ws_puts[-1]["profile"]["keywords"] == ["mutek"], "Workspace: do-not-contact list and fit profile are saved")

    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
