# fix418: the tonight strip, the venue index (a tap searches the place), the search's days, and the remembered view. On the fix414 mocks.
import json, re, sys, os, datetime as dt, urllib.parse
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
    agenda_titles = lambda: pg.locator(".cal-section:has(#cal-h-agenda) .cal-agenda .cal-row-title").all_inner_texts()
    settle = lambda: pg.wait_for_timeout(450)  # the search waits 300 ms after typing stops

    pg.goto(f"{BASE}/calendar/club"); pg.wait_for_selector(".cal-cell", timeout=8000); pg.wait_for_selector("#cal-h-tonight", timeout=8000)
    strip = pg.locator(".cal-tonight").inner_text()
    check("Weekly jam" in strip or "Nothing tonight." in strip or "Next:" in strip, "the tonight strip says what is on today, or what is next")
    check(pg.locator(".cal-tonight .cal-badge").count() <= 2, "the strip marks at most one event Now and one Next")

    names = sorted(pg.locator(".cal-venue-name").all_inner_texts())
    check(names == ["Glazart", "Le Trianon", "Studio"], "the venue index lists the three places that are still to come")
    pg.click(".cal-venue:has-text('Le Trianon')"); settle()
    check(pg.input_value(".cal-find") == "Le Trianon", "a tap on a venue puts its name in the search")
    check(agenda_titles() == ["Ambient set"], "the search then shows only what is at that place")
    pg.fill(".cal-find", ""); settle()

    pg.fill(".cal-find", "in 2 weeks"); settle()
    check(agenda_titles() == ["Weekly jam"], "'in 2 weeks' shows the day 14 days on: the weekly jam")
    pg.fill(".cal-find", "sat"); settle()
    heads = pg.locator(".cal-section:has(#cal-h-agenda) .cal-agenda h3").all_inner_texts()
    check(all("Saturday" in h for h in heads), "'sat' shows only Saturdays (or nothing)")
    pg.fill(".cal-find", ""); settle()
    back = agenda_titles()
    check("Ambient set" in back and "Late night" in back, "clearing the search brings the period back: the one-off events are in it again")

    pg.click(".cal-show button:has-text('Sentences')"); pg.wait_for_timeout(150)
    pg.click(".cal-periods:not(.cal-show) .cal-period:has-text('Next week')"); pg.wait_for_timeout(150)
    pg.reload(); pg.wait_for_selector(".cal-cell", timeout=8000); pg.wait_for_timeout(300)
    check(pg.locator(".cal-sentences").count() == 1, "the sentence view is still on after a reload")
    pressed = pg.locator(".cal-periods:not(.cal-show) .cal-period[aria-pressed='true']").all_inner_texts()
    check(pressed == ["Next week"], "the period is still 'Next week' after a reload")
    check(pg.input_value(".cal-find") == "", "the search itself is not remembered: a visit starts with the whole calendar")
    check(not errs, f"no page errors on the desktop {errs[:2]}")
    ctx.close()

    # A phone: the venue chips and the tonight strip wrap; the page does not scroll sideways.
    mctx = context(b, mobile=True); mstore = fresh_store(); mocks(mctx, mstore)
    mp = mctx.new_page(); merrs = []
    mp.on("pageerror", lambda e: merrs.append(str(e)))
    mp.goto(f"{BASE}/calendar/club"); mp.wait_for_selector(".cal-venue", timeout=8000)
    wide = mp.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check(wide <= 0, f"on a phone the page does not scroll sideways (overflow {wide}px)")
    check(not merrs, f"no page errors on the phone {merrs[:2]}")
    mctx.close(); b.close()

    print(f"{sum(out)}/{len(out)} checks passed")
    sys.exit(0 if all(out) else 1)

with sync_playwright() as pw:
    run(pw)
