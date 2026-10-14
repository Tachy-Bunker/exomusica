import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix334.py", "e2e_fix277.py")).read()
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

    box = page.locator("[data-testid=ox-scroll]"); grip = page.locator("[data-testid=ox-grip]")
    check(grip.count() == 1, "A resize bar sits under the contact list")
    h0 = box.evaluate("e => e.offsetHeight")
    bb = grip.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 6); page.mouse.down(); page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 6 + 120, steps=6); page.mouse.up()
    h1 = box.evaluate("e => e.offsetHeight")
    check(abs((h1 - h0) - 120) <= 4 or h1 > h0, f"Dragging down makes the list taller ({h0} → {h1})")
    check(page.evaluate("localStorage.getItem('exomusica_ox_list_h')") == str(h1), "…and the height is remembered")
    bb = grip.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 6); page.mouse.down(); page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] - 4000, steps=4); page.mouse.up()
    h2 = box.evaluate("e => e.offsetHeight")
    check(h2 >= 160 and h2 < h1, f"It can be made shorter, but not below a usable minimum ({h2})")
    grip.focus(); page.keyboard.press("ArrowDown"); h3 = box.evaluate("e => e.offsetHeight")
    check(h3 == h2 + 40, f"Arrow keys resize by 40px ({h2} → {h3})")
    page.reload(); page.wait_for_selector("[data-testid=contact-row]")
    check(abs(page.locator("[data-testid=ox-scroll]").evaluate("e => e.offsetHeight") - h3) <= 2, "The height comes back after a reload")
    page.locator("[data-testid=ox-grip]").dblclick()
    check(page.evaluate("localStorage.getItem('exomusica_ox_list_h')") is None and page.locator("[data-testid=ox-scroll]").evaluate("e => e.style.height") == "", "Double-click puts it back to the default")
    page.locator("[data-testid=ox-grip]").focus(); page.keyboard.press("ArrowDown"); page.keyboard.press("Home")
    check(page.locator("[data-testid=ox-scroll]").evaluate("e => e.style.height") == "", "Home resets too")
    check(not errors, f"No page errors {errors[:2]}")
    browser.close()
    bad = [m for ok_, m in results if not ok_]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
