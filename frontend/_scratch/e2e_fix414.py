import json, re, sys, os, datetime as dt, urllib.parse
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); _s = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(_s.split("\ndef run(playwright):")[0])

# Calendar redesign (fix414): one stacked page (Month, Week, Agenda, Places), the plus button, the share dialog, the highlighted
# event days, repeats with a weekly series, the place search, the lazy map, and the phone popup with its X.
TODAY = dt.datetime.now(dt.timezone.utc).date()
def at(days, hhmm_utc):
    return f"{(TODAY + dt.timedelta(days=days)).isoformat()}T{hhmm_utc}:00.000Z"
def ev(i, title, text, url, location, when, image=None, by="Léa", lat=None, lng=None, rec=None, until=None, exdates=None):
    return {"id": i, "title": title, "text": text, "url": url, "location": location, "startsAt": when, "endsAt": None, "allDay": False,
            "addedBy": by, "lat": lat, "lng": lng, "recurrence": rec, "recurUntil": until, "exdates": exdates or [],
            "image": image, "createdAt": when, "updatedAt": when}
OPEN = {"slug": "club", "name": "Club Nights", "timezone": "Europe/Paris", "protected": False, "editMode": "guests", "members": [], "pictureCap": 200}
SECRET = {"slug": "secret", "name": "Secret Room", "timezone": "Europe/Paris", "protected": True, "editMode": "guests", "members": [], "pictureCap": 200}
PARIS = {"lat": 48.8566, "lng": 2.3522, "label": "Paris, Île-de-France, France"}
TRIANON = {"lat": 48.8836, "lng": 2.3340, "label": "Le Trianon, Boulevard de Rochechouart, Paris, France"}

def context(b, mobile=False):
    kw = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True) if mobile else dict(viewport={"width": 1100, "height": 900})
    ctx = b.new_context(service_workers="block", **kw)
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t');localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});localStorage.setItem('exomusica_classic','0');")
    return ctx

def mocks(ctx, store):
    def handle(route):
        req = route.request; full = req.url; key = full.replace(BASE, "").split("?")[0]
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(full).query))
        ok = lambda x, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(x))
        if key in ("/api/auth/me", "/api/auth/session"): return ok({"user": ADMIN})
        if key == "/api/site-settings": return ok({"ambienceUrl": None, "defaultFont": None, "faviconUrl": None, "usernameColor": None, "moireOffsetMax": 0, "moireOffsetSpeed": 0, "moireWaveform": "sine", "moireRotationSpeed": 0})
        if key == "/api/admin/inbox": return ok({"total": 0, "counts": {"join": 0, "submission": 0, "reward": 0}, "items": []})
        if key == "/api/calendars/club" and req.method == "GET": return ok({**OPEN, "locked": False, "canEdit": True, "canManage": True})
        if key == "/api/calendars/club/events" and req.method == "GET":
            return ok({"events": sorted(store["events"], key=lambda e: e["startsAt"]), "truncated": False, "calendar": OPEN, "canEdit": True})
        if key == "/api/calendars/club/events" and req.method == "POST":
            body = json.loads(req.post_data or "{}"); store["posts"].append(body)
            e = ev(100 + len(store["posts"]), body["title"], body["text"], body["url"], body["location"], body["startsAt"], by=body["addedBy"], lat=body["lat"], lng=body["lng"], rec=body["recurrence"], until=body["recurUntil"])
            store["events"].append(e); return ok(e, 201)
        if key.startswith("/api/calendars/club/events/") and key.endswith("/skip"):
            body = json.loads(req.post_data or "{}"); store["skips"].append(body)
            eid = int(key.split("/")[-2]); e = next(x for x in store["events"] if x["id"] == eid)
            e["exdates"] = sorted(set(e["exdates"]) | {body["day"]}) if body["skipped"] else [d for d in e["exdates"] if d != body["day"]]
            return ok(e)
        if key == "/api/calendars/club/geocode" and req.method == "GET":
            qq = q.get("q", "")
            if "Trianon" in qq: return ok({"places": [TRIANON]})
            if "Paris" in qq: return ok({"places": [PARIS, {"lat": 33.66, "lng": -95.55, "label": "Paris, Texas, USA"}]})
            return ok({"places": []})
        if key == "/api/calendars/secret" and req.method == "GET":
            return ok({**SECRET, "locked": False, "canEdit": True, "canManage": True})
        if key == "/api/calendars/secret/events" and req.method == "GET":
            return ok({"events": [], "truncated": False, "calendar": SECRET, "canEdit": True})
        return ok([])
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    ctx.route(re.compile(r".*tile\.openstreetmap\.org.*"), lambda r: r.abort())

def fresh_store():
    return {"events": [
        ev(1, "Ambient set", "Doors 19h", "https://example.org/ev", "Le Trianon", at(2, "18:00"), by="Léa", lat=48.8836, lng=2.3340),
        ev(2, "Late night", "", None, "Glazart", at(5, "20:00"), image={"id": 9, "url": "/api/calendar-images/9/abcdefghijklmnop"}, by="Tachy"),
        ev(3, "Weekly jam", "", None, "Studio", at(-14, "18:00"), rec="weekly", by="Ana", lat=None, lng=None),
    ], "posts": [], "skips": []}

def run(pw):
    out = []
    def check(c, m): out.append(bool(c)); print(("ok   " if c else "FAIL ") + m, flush=True)
    b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = context(b); store = fresh_store(); mocks(ctx, store)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.route_web_socket(re.compile(r".*/ws/.*"), lambda w: None)

    # 1. one stacked page: Month, Week, Agenda (Places waits for the screen); no tabs
    pg.goto(f"{BASE}/calendar/club"); pg.wait_for_selector(".cal-cell", timeout=8000)
    check(pg.locator(".cal-views").count() == 0, "no tabs: the view bar is gone")
    check(pg.locator("section.cal-section:has(#cal-h-month), section.cal-section:has(#cal-h-agenda)").count() == 2, "Month and Agenda are stacked on the page (Places waits for the screen)")
    check(pg.locator(".cal-week-day").count() == 0, "no week section")
    check(pg.locator(".cal-head button.cal-plus[aria-label='Add an event']").count() == 1 and pg.locator(".cal-head button:has-text('Add event')").count() == 0, "a plus button replaces the Add event text button")
    head = pg.locator(".cal-head")
    check("Europe/Paris" not in head.inner_text() and "password" not in head.inner_text().lower(), "the header has no time zone and no password line")
    labels = pg.eval_on_selector_all(".cal-head .cal-actions > *", "els => els.map(e => e.getAttribute('aria-label') || e.textContent.trim())")
    check(labels[:4] == ["Add an event", "Settings", "Share this calendar", "Switch to French"], f"share and the flags sit on the right of settings ({labels})")
    check(pg.locator(".cal-head button.cal-icon[aria-label='Settings'] svg").count() == 1, "settings is a cog icon")
    check(pg.locator(".cal-lang .cal-flag").count() == 2, "the language button shows two flags")
    check(pg.locator("text=With a picture").count() == 0 and pg.locator("select[aria-label='Place']").count() == 0, "the picture and place filters are gone")

    # 2. the month: today, highlighted event days, small empty days, the weekday names 1.75 times their old size
    px = pg.eval_on_selector(".cal-month-head span", "el => parseFloat(getComputedStyle(el).fontSize)")
    check(abs(px - 21) < 0.6, f"weekday names are 1.75 times the old 12px (now {px:.1f}px)")
    check(pg.locator(".cal-cell.is-today").count() == 1, "today is highlighted in the month")
    check(pg.locator(".cal-cell.has-events").count() >= 3, "days with events are highlighted, not just dotted")
    empty_h = pg.eval_on_selector(".cal-cell:not(.has-events)", "el => el.getBoundingClientRect().height")
    busy_h = pg.eval_on_selector(".cal-cell.has-events", "el => el.getBoundingClientRect().height")
    check(empty_h < busy_h, f"empty days are smaller ({empty_h:.0f}px) than days with events ({busy_h:.0f}px)")

    # 2b. the agenda: 30 days by default; this week, or a number of days typed in
    check(pg.locator(".cal-periods:not(.cal-show) .cal-period[aria-pressed='true']").inner_text().strip() == "Next 30 days", "the agenda shows the next 30 days by default")
    pg.click(".cal-periods:not(.cal-show) .cal-period:has-text('This week')"); pg.wait_for_timeout(250)
    check(pg.locator(".cal-periods:not(.cal-show) .cal-period[aria-pressed='true']").inner_text().strip() == "This week", "the agenda can show this week")
    pg.fill(".cal-days-input input", "7"); pg.wait_for_timeout(300)
    check(pg.locator(".cal-periods:not(.cal-show) .cal-period[aria-pressed='true']").count() == 0, "a typed number of days takes over the period")
    pg.fill(".cal-days-input input", ""); pg.click(".cal-periods:not(.cal-show) .cal-period:has-text('Next 30 days')"); pg.wait_for_timeout(250)

    # 3. a weekly repeat shows on each of its days
    check(pg.locator(".cal-chip-title", has_text="Weekly jam").count() >= 3, "a weekly event shows on each of its days in the month")
    pg.locator(".cal-chip", has_text="Weekly jam").first.click(); pg.wait_for_selector(".cal-sheet[role=dialog]", timeout=4000)
    check(pg.locator(".cal-scope button").count() == 4, "a repeat asks: change or delete this day, or the whole series")
    with pg.expect_download() as dl:
        pg.locator(".cal-sheet button", has_text="Add to calendar").click()
    ics = open(dl.value.path(), encoding="utf-8").read()
    check("BEGIN:VCALENDAR" in ics and "BEGIN:VTIMEZONE" in ics and "RRULE:FREQ=WEEKLY" in ics, "Add to calendar downloads the repeat as a calendar file, with its rule")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)

    # 4. search: one box above the sections
    pg.fill(".cal-find", "Ambient"); pg.wait_for_timeout(600)
    check(pg.locator(".cal-chip-title", has_text="Late night").count() == 0 and pg.locator(".cal-chip-title", has_text="Ambient").count() >= 1, "the search narrows every section to the words typed")
    pg.fill(".cal-find", "")

    # 5. French: the button rewrites ?fr, the section titles follow
    pg.click(".cal-lang"); pg.wait_for_timeout(200)
    check("fr" in pg.url and pg.locator("#cal-h-month").inner_text().strip() == "Mois", "the French button switches the page and the link carries ?fr")

    # 6. share: the plain link, in the language on screen
    pg.click(".cal-head button[aria-label='Partager ce calendrier']"); pg.wait_for_selector(".cal-share", timeout=3000)
    link = pg.locator(".cal-share input[readonly]").first.input_value()
    check(link.endswith("/calendar/club?fr"), "the share dialog gives the calendar's link, in the language on screen")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    check(pg.locator(".cal-share").count() == 0, "Escape closes the share dialog")
    pg.click(".cal-lang"); pg.wait_for_timeout(150)

    # 7. the map: it loads when Places comes near; the dots are the events with a place; an address search lists its answers
    pg.evaluate("() => document.querySelector('.cal-main').lastElementChild.scrollIntoView()")
    pg.wait_for_selector(".leaflet-container", timeout=8000)
    pg.wait_for_timeout(400)
    check(pg.locator(".leaflet-interactive").count() >= 1, "the map shows a dot for the event with a place")
    check(pg.locator(".cal-places-search button", has_text="Draw a zone").count() == 1 and pg.locator(".cal-places-search button[type=submit]").count() == 0, "the zone button sits by the search; there is no search button")
    pg.fill(".cal-places-search input", "Paris")  # searched as it is typed, no button
    pg.wait_for_selector(".cal-found button", timeout=4000)
    check(pg.locator(".cal-found button").count() == 2, "an address search lists the places it finds, as it is typed")
    pg.locator(".cal-found button").first.click(); pg.wait_for_timeout(200)
    check(pg.locator(".cal-found").count() == 0, "choosing a place moves the map and clears the list")
    pg.locator(".cal-row", has_text="Ambient set").first.click(); pg.wait_for_selector(".cal-sheet", timeout=4000)
    check(pg.locator(".cal-geo a[href*='google.com/maps']").count() == 1 and pg.locator(".cal-geo a[href*='openstreetmap.org']").count() == 1 and pg.locator(".cal-geo button").count() == 1,
          "an event with a place has three icons: Google Maps, OpenStreetMap and copy the coordinates")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)

    # 8. adding: the plus opens the form; the place is found and its coordinates come with it; a weekly repeat is sent
    pg.click(".cal-plus"); pg.wait_for_selector(".cal-form", timeout=4000)
    form = pg.locator("form.cal-form")
    form.locator("input").nth(1).fill("Test set")
    form.locator(".cal-place-block input").first.fill("Le Trianon")
    pg.wait_for_timeout(1100)  # the place is searched as it is typed, after a short pause
    lat = form.locator("input[type=number]").first.input_value()
    check(lat.startswith("48.88"), f"a typed address fills in its coordinates (latitude {lat})")
    check(form.locator("button", has_text="No place").count() == 0 and form.locator("button", has_text="Find on").count() == 0, "no find button and no clear-place button in the form")
    form.locator("select").first.select_option("weekly")
    check(form.locator("label:has-text('Until') input[type=date]").count() == 1, "a repeat offers an end date")
    form.locator("button[type=submit]").click(); pg.wait_for_timeout(400)
    post = store["posts"][-1] if store["posts"] else {}
    check(post.get("recurrence") == "weekly" and post.get("lat") is not None and abs(post.get("lat", 0) - 48.8836) < 0.01, "the new event is saved with its repeat and its place on the map")

    check(pg.locator("form.cal-form").count() == 0, "saving closes the form")

    # 9. a day of a repeat is deleted alone (it is skipped in the series) and comes back from the series' editor
    before = pg.locator(".cal-chip-title", has_text="Weekly jam").count()
    pg.locator(".cal-chip", has_text="Weekly jam").first.click(); pg.wait_for_selector(".cal-scope", timeout=4000)
    pg.locator(".cal-scope button", has_text="Delete this day").click(); pg.wait_for_timeout(400)
    check(len(store["skips"]) == 1 and store["skips"][0]["skipped"] is True, "deleting one day of a repeat skips that day in the series")
    check(pg.locator(".cal-chip-title", has_text="Weekly jam").count() == before - 1, "the skipped day leaves the calendar; the others stay")
    pg.locator(".cal-chip", has_text="Weekly jam").first.click(); pg.wait_for_selector(".cal-scope", timeout=4000)
    pg.locator(".cal-scope button", has_text="Change the series").click(); pg.wait_for_selector("form.cal-form", timeout=4000)
    pg.locator(".cal-skips li button", has_text="Put it back").first.click(); pg.wait_for_timeout(400)
    check(len(store["skips"]) == 2 and store["skips"][1]["skipped"] is False, "a day left out of a series can be put back from its editor")

    # 10. a phone: the event is a popup with a visible X; the calendar stays behind it
    mctx = context(b, mobile=True); mstore = fresh_store(); mocks(mctx, mstore)
    mp = mctx.new_page(); merrs = []
    mp.on("pageerror", lambda e: merrs.append(str(e)))
    mp.goto(f"{BASE}/calendar/club"); mp.wait_for_selector(".cal-cell", timeout=8000)
    mp.wait_for_timeout(200)
    check(mp.locator(".cal-chips").first.is_visible() is False and mp.locator(".cal-count").first.is_visible(), "on a phone a day shows its count, not its titles")
    mp.locator(".cal-agenda .cal-row").first.click(); mp.wait_for_selector(".cal-sheet", timeout=4000)
    x = mp.locator(".cal-sheet-x").bounding_box()
    sheet = mp.locator(".cal-sheet").bounding_box()
    month = mp.locator(".cal-month").bounding_box()
    check(x is not None and 0 <= x["x"] and x["x"] + x["width"] <= 390 and x["width"] >= 36, "the X is visible on the phone popup")
    check(sheet is not None and sheet["width"] < 390 and sheet["x"] > 0, "the event is a popup, not a full-screen page")
    check(month is not None and month["height"] > 100, "the calendar stays visible behind the popup")
    mp.click(".cal-sheet-x"); mp.wait_for_timeout(150)
    check(mp.locator(".cal-sheet").count() == 0, "the X closes the popup")

    check(not errs and not merrs, f"no page errors ({(errs + merrs)[:3]})")
    ctx.close(); mctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)
with sync_playwright() as pw:
    run(pw)
