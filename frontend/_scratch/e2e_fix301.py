import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix301.py", "e2e_fix277.py")).read()
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
inbox_checks = []; acct_puts = []; emls = []; members = []; geocodes = []; merges = []; leads_acts = []; blocks_made = []; ws_puts = []; entered = []
DEF = {"place": "", "lat": None, "lng": None, "source": "", "doNotContact": False, "snoozeReason": "", "declineReason": "", "reopensAt": None}
for _c in CONTACTS: _c.update({k: v for k, v in DEF.items() if k not in _c})
WS = {"id": 7, "name": "Tachy", "slug": "tachy", "trackLinks": False, "dnc": [], "profile": {"keywords": ["mutek"], "avoid": [], "regions": [], "maxFee": None, "yearlyBudget": 50, "home": "", "homeLat": None, "homeLng": None}, "attachRules": [], "digestOn": False, "trackAvailable": False}
SETTINGS = {"id": 1, "label": "Main", "isDefault": True, "smtpHost": "smtp.x.org", "smtpPort": 465, "smtpSecure": True, "smtpUser": "me@x.org", "hasPassword": True, "fromName": "Tachy", "fromEmail": "me@x.org", "replyTo": "", "defaultCc": "", "defaultBcc": "me+copy@x.org",
            "inboxOn": False, "inboxFolder": "INBOX", "inboxCheckedAt": None, "inboxError": None, "imapHost": "imap.x.org", "imapPort": 993, "imapSecure": True, "sentFolder": "Sent", "fileInSent": False, "signatureMd": "— Tachy", "followUpDays": 14}
BLOCKS = [{"id": 1, "name": "Short bio", "blocks": [{"id": 1, "typeId": 1, "title": "50 words", "body": "Tachy is a sound artist."}]}]
captures = []; templates = []; imports = []; sent = []; patches = []; previews = []; send_calls = []
state = {"first": True}
ANSWER = {"t": ""}

def _it(i, t, a, g):
    return {"id": i, "source": "official", "trackId": i, "title": t, "fileUrl": "/uploads/x.wav", "durationSeconds": 60, "albumTitle": a, "albumSlug": a.lower().replace(" ", "-"), "coverArtUrl": None, "composer": "Ana", "branchSlug": "b1", "replayGainDb": None, "genres": g, "lyrics": None, "trackPosition": i}
PL = {"id": 0, "slug": "collab-ana", "title": "Ana — discography", "description": None, "owner": "Ana", "ownerId": 0, "collaborators": [], "fxSettings": None,
      "albums": [{"slug": "first-album", "title": "First Album", "coverArtUrl": None, "source": "official"}, {"slug": "second-album", "title": "Second Album", "coverArtUrl": None, "source": "official"}],
      "items": [_it(1, "Alpha", "First Album", ["drone"]), _it(2, "Beta", "First Album", ["noise"]), _it(3, "Gamma", "Second Album", ["drone"])]}
COLLAB = {"slug": "ana", "name": "Ana", "role": "Producer", "bio": "bio", "pictureUrl": None, "links": [], "linkedUsername": None, "gallery": [],
          "discography": [{"slug": "first-album", "title": "First Album", "coverArtUrl": None, "branchSlug": "b1", "tracks": [{"id": 1, "title": "Alpha", "fileUrl": "/uploads/x.wav", "format": "wav", "durationSeconds": 60, "position": 1, "genres": ["drone"]}]}]}
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
        if m == "POST" and re.match(r"/api/outreach/accounts/\d+/inbox-check", key): inbox_checks.append(key); return ok(route, {"scanned": 12, "found": 2, "added": 2, "already": 0})
        if m == "PUT" and re.match(r"/api/outreach/accounts/\d+$", key): acct_puts.append(body); return ok(route, {**SETTINGS, **{k: v for k, v in body.items() if k.startswith("inbox")}})
        if key == "/api/outreach/newsletter/eml": emls.append(1); return ok(route, {"files": 2, "mailsWithCalls": 1, "found": 3, "added": 2, "already": 1, "failed": 0})
        if key == "/api/channels/hall/messages": return ok(route, [])
        if key == "/api/channels/hall/archive": return ok(route, [])
        if key == "/api/channels/hall": return ok(route, {"name": "The Hall", "font": None, "branch": None})
        if key == "/api/collaborators/ana/playlist": return ok(route, PL)
        if key == "/api/collaborators/ana": return ok(route, COLLAB)
        if path in DATA: return ok(route, DATA[path])
        if key in DATA: return ok(route, DATA[key])
        return ok(route, {})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    ctx.close(); ctx = browser.new_context(viewport={"width": 1400, "height": 1000}); ctx.add_init_script("localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', %s);" % json.dumps(json.dumps(ADMIN)))
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    page = ctx.new_page(); page.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.on("dialog", lambda d: d.accept())
    page.goto(f"{BASE}/outreach/tachy"); page.wait_for_selector(".ox-gate"); page.fill("input[type=password]", "hunter22!"); page.click("button:has-text('Enter')"); page.wait_for_selector("[data-testid=contact-row]")
    # centred
    box = page.locator(".ox-page").bounding_box()
    check(abs((box["x"] + box["width"] / 2) - 700) < 3, "Outreach page: centred in a wide window")
    # paste with formatting into the composer
    page.locator("[data-testid=contact-row]").first.locator(".ox-write").click(); page.wait_for_selector("textarea.ox-body")
    PASTE = """([sel, html, text]) => { const el = document.querySelector(sel); el.focus(); const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', text);
        return el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }"""
    page.locator("textarea.ox-body").fill("")
    page.evaluate(PASTE, ["textarea.ox-body", "<p>Hello <b>bold</b> and <i>it</i> <a href='https://x.org/a'>link</a></p><ul><li>one</li><li>two</li></ul>", "Hello bold and it link one two"])
    v = page.locator("textarea.ox-body").input_value()
    check("**bold**" in v and "*it*" in v and "[link](https://x.org/a)" in v and "- one" in v and "- two" in v, "Composer paste: rich text becomes the mail markup: " + repr(v[:90]))
    page.locator("textarea.ox-body").fill("")
    not_prevented = page.evaluate(PASTE, ["textarea.ox-body", "<p>just plain words</p>", "just plain words"])
    check(not_prevented is True, "Composer paste: plain text is left to the browser")
    # settings: signature paste + inbox checker
    page.click("button:has-text('Mailboxes')"); page.wait_for_selector(".ox-modal")
    sig = page.locator(".ox-modal textarea").first
    sig.fill("")
    page.evaluate(PASTE, [".ox-modal textarea", "<p><b>Tachy</b><br><a href='https://tachy.net'>tachy.net</a></p>", "Tachy tachy.net"])
    check("**Tachy**" in sig.input_value() and "[tachy.net](https://tachy.net)" in sig.input_value(), "Signature paste: keeps bold and the link")
    check(page.locator(".ox-modal :text('Look for open calls in my inbox')").count() >= 1, "Settings: the inbox checker is offered")
    page.locator(".ox-modal label:has-text('inbox') input[type=checkbox], .ox-modal fieldset input[type=checkbox]").last.check()
    page.click(".ox-modal button:has-text('Save & check now')"); page.wait_for_timeout(500)
    check(inbox_checks and any(p.get("inboxOn") is True for p in acct_puts), "Settings: saving turns the check on and runs it")
    page.click(".ox-modal header button")
    # newsletter eml import
    page.click("button[title^='Calls found']"); page.click("[role=tab]:has-text('Newsletters')"); page.wait_for_timeout(200)
    check(page.locator("label:has-text('Import .eml')").count() >= 1, "Newsletters: .eml / .zip import button exists")
    page.set_input_files("input[type=file][accept*='.eml']", {"name": "a.eml", "mimeType": "message/rfc822", "buffer": b"From: a@b.c\nSubject: x\n\nhi"}); page.wait_for_timeout(500)
    check(len(emls) == 1, "Newsletters: the file is sent to the importer")

    # collaborator discography on the playlist views
    page.goto(f"{BASE}/collaborator/ana"); page.wait_for_selector("a:has-text('Constellation')")
    check(all(page.locator(f"a.btn:has-text('{t}')").count() == 1 for t in ("Constellation", "Spacemap", "List")), "Profile: three view buttons")
    page.click("a.btn:has-text('List')"); page.wait_for_selector("text=Gamma")
    check(page.url.endswith("/collaborator/ana/list") and page.locator("text=Gamma").count() >= 1 and page.locator("button:has-text('rename')").count() == 0, "List: the discography, read-only")
    check(page.locator("input[placeholder*='collaborator']").count() == 0, "List: no collaborator editor")
    page.goto(f"{BASE}/collaborator/ana/spacemap"); page.wait_for_timeout(1500)
    check(page.locator("[data-testid=share-open-btn]").count() == 1, "Spacemap: loads for the collaborator")
    page.goto(f"{BASE}/collaborator/ana/spacemap#venn"); page.wait_for_timeout(1500)
    check(not errors, "Constellation: loads without page errors")

    # notification opens in the dock
    NOTES = [{"id": 5, "eventKey": "reply", "channelSlug": "hall", "messageId": 99, "title": "ghost9 replied", "body": "hi", "read": False, "createdAt": "2026-09-01T10:00:00Z"}]
    DATA["/api/notifications"] = NOTES
    DATA["/api/recent-messages"] = []
    page.goto(f"{BASE}/"); page.wait_for_timeout(1200)
    bell = page.locator("[aria-label*='otification'], [title*='otification']").first
    bell.click(); page.wait_for_timeout(300)
    page.locator("text=ghost9 replied").first.click(); page.wait_for_timeout(1200)
    st = json.loads(page.evaluate("localStorage.getItem('exomusica_chat_dock')") or "{}").get("state", {})
    check(st.get("openChannelSlug") == "hall" and "/topic/" not in page.url, "Notification: opens the room in the chat dock without leaving the page")
    check(page.locator("button:has-text('Live chat')").count() >= 1, "Notification: an older message offers the way back to live chat")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
