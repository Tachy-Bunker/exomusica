# fix420: the subscription in the share dialog (idea 10). The webcal and https links, the key of a protected calendar (made once, renewed
# on request, refused for a guest), the steps for each app, and French. On the fix414 mocks, plus the feed-key route.
import json, re, sys, os, datetime as dt, urllib.parse
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
__file__ = D + "/e2e_fix414.py"; exec(open(D + "/e2e_fix414.py").read().split("\ndef run(pw):")[0])

def run(pw):
    out = []
    def check(ok, name): out.append(bool(ok)); print(("ok   " if ok else "FAIL ") + name, flush=True)
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = context(b); store = fresh_store(); mocks(ctx, store)
    st = {"key": "KEYabc_-123", "posts": [], "refuse": False, "open_calls": 0}
    def open_feed(route):
        st["open_calls"] += 1
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"key": "unused"}))
    def secret_feed(route):
        body = json.loads(route.request.post_data or "{}")
        st["posts"].append(body)
        if st["refuse"]:
            return route.fulfill(status=403, content_type="application/json", body=json.dumps({"error": "Only the creator, the site's admin or a member can renew the link."}))
        if body.get("renew") is True: st["key"] = "NEWkey_9"
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"key": st["key"]}))
    ctx.route(re.compile(r".*/api/calendars/club/feed-key.*"), open_feed)
    ctx.route(re.compile(r".*/api/calendars/secret/feed-key.*"), secret_feed)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    host = urllib.parse.urlsplit(BASE).netloc
    share = lambda slug: (pg.goto(f"{BASE}/calendar/{slug}"), pg.wait_for_selector(".cal-head", timeout=8000),
                          pg.click(".cal-head button[aria-label='Share this calendar']"), pg.wait_for_selector(".cal-feed", timeout=3000))

    # 1. an open calendar: the links need no key, and no key is asked for
    share("club")
    webcal = pg.locator(".cal-feed input[readonly]").nth(0).input_value()
    https = pg.locator(".cal-feed input[readonly]").nth(1).input_value()
    check(webcal == f"webcal://{host}/api/calendars/club/feed.ics", f"the open calendar's webcal link ({webcal})")
    check(https == f"{BASE}/api/calendars/club/feed.ics", "and its https link for Google Calendar")
    check(pg.locator("a.cal-open").first.get_attribute("href") == webcal, "'Open in my calendar app' opens the webcal link")
    check(st["open_calls"] == 0, "an open calendar asks for no key")
    check(pg.locator(".cal-feed button", has_text="Renew the link").count() == 0, "an open calendar has no renew button")
    pg.click(".cal-guide summary"); pg.wait_for_timeout(120)
    check(pg.locator(".cal-feed-steps li").count() == 5, "the setup guide has five steps (iPhone, Mac, Outlook, Google, Android)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(120)
    check(pg.locator(".cal-share").count() == 0, "Escape closes the dialog")

    # 2. a protected calendar: the key is asked for once, and its links carry it
    share("secret")
    pg.wait_for_function("document.querySelectorAll('.cal-feed input[readonly]').length >= 2", timeout=3000)
    keyed = pg.locator(".cal-feed input[readonly]").nth(0).input_value()
    check(keyed == f"webcal://{host}/api/calendars/secret/feed.ics?k=KEYabc_-123", f"a protected calendar's link carries its key ({keyed})")
    check(len(st["posts"]) == 1 and st["posts"][0] == {"renew": False}, "the key is asked for once, without renewing")
    check(pg.locator(".cal-feed .cal-note", has_text="without its password").count() == 1, "the protected link says it opens the calendar without its password")

    # 3. renewing: a new key, and the links change to it
    pg.locator(".cal-feed button", has_text="Renew the link").click(); pg.wait_for_timeout(120)
    pg.locator(".cal-feed-renew button.cal-quiet", has_text="Keep this one").click(); pg.wait_for_timeout(120)
    check(len(st["posts"]) == 1, "'Keep this one' asks for nothing")
    pg.locator(".cal-feed button", has_text="Renew the link").click(); pg.wait_for_timeout(120)
    pg.locator(".cal-feed-renew button.cal-primary", has_text="Make a new link").click()
    pg.wait_for_function("document.querySelector('.cal-feed input[readonly]') && document.querySelector('.cal-feed input[readonly]').value.includes('NEWkey_9')", timeout=3000)
    check(st["posts"][-1] == {"renew": True}, "renewing asks the site for a new key")
    check(pg.locator(".cal-note[role='status']", has_text="New link made").count() == 1, "and says the old links no longer work")

    # 4. a guest who may not renew: refused, the links stay as they were
    st["refuse"] = True
    pg.locator(".cal-feed button", has_text="Renew the link").click(); pg.wait_for_timeout(120)
    pg.locator(".cal-feed-renew button.cal-primary", has_text="Make a new link").click(); pg.wait_for_timeout(300)
    check(pg.locator(".cal-note", has_text="Only the creator").count() == 1, "a refused renewal says who may renew")
    check(pg.locator(".cal-feed input[readonly]").nth(0).input_value().endswith("?k=NEWkey_9"), "and the link keeps the key it has")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(120)

    # 5. French on the same dialog
    pg.goto(f"{BASE}/calendar/secret?fr"); pg.wait_for_selector(".cal-head", timeout=8000)
    pg.click(".cal-head button[aria-label='Partager ce calendrier']"); pg.wait_for_selector(".cal-feed", timeout=3000)
    check(pg.locator(".cal-feed h3").first.inner_text() == "S'abonner depuis votre application d'agenda", "the subscription heading is in French")
    check(pg.locator(".cal-guide summary").first.inner_text() == "Comment s'abonner", "and the guide's title")
    check(not errs, f"no page errors {errs[:2]}")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
