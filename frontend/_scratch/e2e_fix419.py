# fix419: the keys on the calendar page (idea 8) and the places the form remembers (idea 15). On the fix414 mocks.
import json, re, sys, os, datetime as dt, urllib.parse
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
__file__ = D + "/e2e_fix414.py"; exec(open(D + "/e2e_fix414.py").read().split("\ndef run(pw):")[0])

def run(pw):
    out = []
    def check(ok, name): out.append(bool(ok)); print(("ok   " if ok else "FAIL ") + name, flush=True)
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = context(b); store = fresh_store(); mocks(ctx, store)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    open_page = lambda: (pg.goto(f"{BASE}/calendar/club"), pg.wait_for_selector(".cal-cell", timeout=8000), pg.wait_for_selector("#cal-h-tonight", timeout=8000))
    picked = lambda: pg.locator(".cal-cell.is-picked .cal-daynum").all_inner_texts()
    focus_page = lambda: pg.click("h1")  # the page itself has the keys once nothing is typed in

    open_page(); focus_page()
    pg.keyboard.press("/"); pg.wait_for_timeout(120)
    check(pg.evaluate("document.activeElement && document.activeElement.classList.contains('cal-find')"), "'/' puts the cursor in the search")
    check(pg.input_value(".cal-find") == "", "and the '/' is not typed into the search")

    open_page(); focus_page()
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
    check(picked() == [str((TODAY + dt.timedelta(days=1)).day)], "the right arrow picks tomorrow")
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(150)
    check(picked() == [str((TODAY + dt.timedelta(days=8)).day)], "the down arrow moves the pick a week on")
    pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(150)
    check(picked() == [str((TODAY + dt.timedelta(days=1)).day)], "the up arrow moves it back a week")

    open_page(); focus_page()
    for _ in range(3): pg.keyboard.press("ArrowLeft")
    pg.wait_for_timeout(150)
    check(picked() == [str((TODAY - dt.timedelta(days=3)).day)], "three left arrows from nothing picked walk back to three days before today")
    pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(150)
    check(picked() == [str((TODAY + dt.timedelta(days=1)).day)], "and four right arrows come back to tomorrow")

    open_page(); focus_page()
    for _ in range(3): pg.keyboard.press("ArrowRight")  # today + 3 counted from nothing picked: tomorrow, then +2, then +3
    pg.wait_for_timeout(150)
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(120)  # now +2: the Ambient set at Le Trianon
    pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    sheets = " ".join(pg.locator(".cal-sheet").all_inner_texts())
    check("Ambient set" in sheets, "Enter opens the first event of the picked day")
    open_page()

    pg.click(".cal-find"); pg.wait_for_timeout(100)
    pg.keyboard.press("/")
    check(pg.input_value(".cal-find") == "/", "in the search, '/' is typed like any other key")
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(120)
    check(pg.locator(".cal-cell.is-picked").count() == 0, "and an arrow in the search moves the text cursor, not the day")
    pg.fill(".cal-find", ""); pg.wait_for_timeout(350)

    # The form: a remembered place fills its coordinates, and its usual start for a new event.
    open_page(); focus_page()
    pg.click(".cal-plus"); pg.wait_for_selector(".cal-form", timeout=5000)
    pg.fill(".cal-place-block > label > input", "Le Trianon"); pg.wait_for_timeout(250)
    check(pg.locator(".cal-coords label input").nth(0).input_value() == "48.8836", "a remembered place fills its latitude")
    check(pg.locator(".cal-coords label input").nth(1).input_value() == "2.334", "and its longitude")
    expected = dt.datetime.fromisoformat(at(2, "18:00").replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Paris")).strftime("%H:%M")
    check(pg.locator(".cal-form-times input[type='time']").nth(0).input_value() == expected, f"and its usual start ({expected} in Paris)")
    check(pg.locator(".cal-note").count() > 0 and "Known place" in pg.locator(".cal-note").first.inner_text(), "the form says a known place was filled in")

    # A start typed by hand is not overwritten by a place.
    pg.fill(".cal-form-times input[type='time']", "09:15")
    pg.fill(".cal-place-block > label > input", ""); pg.wait_for_timeout(120)
    pg.fill(".cal-place-block > label > input", "Le Trianon"); pg.wait_for_timeout(250)
    check(pg.locator(".cal-form-times input[type='time']").nth(0).input_value() == "09:15", "a start typed by hand stays when a known place is typed")
    check(not errs, f"no page errors {errs[:2]}")
    ctx.close(); b.close()
    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
