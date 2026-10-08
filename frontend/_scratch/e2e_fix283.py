import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix283.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

H = {1: {"id": 1, "title": "Dark pads mask clicks", "claim": "A dark pad hides a 5 ms click better than a bright one.", "status": "open", "requirements": ["headphones"], "author": "ghost9", "testable": True, "n": 3, "tally": None, "answered": False},
     2: {"id": 2, "title": "Breathing in the room", "claim": "Reverb tails sound longer when you are alone.", "status": "testing", "requirements": [], "author": "tachy", "testable": False, "n": 12, "tally": {"n": 12, "claim": 8, "other": 3, "unsure": 1, "informative": 11, "share": 8/11, "p": 0.226}, "answered": False}}
DET = {1: dict(H[1], protocol="Listen to both with eyes closed.", question="Which hides the click better?", statusNote=None, study=None, stimulusA="https://example.org/a.mp3", stimulusB="https://example.org/b.mp3", suggested=None, canEdit=False, isAuthor=False, mine=None, notes=[]),
       2: dict(H[2], protocol="Clap, then repeat with a friend.", question=None, statusNote="Waiting on more", study=None, stimulusA=None, stimulusB=None, suggested="testing", canEdit=True, isAuthor=True, mine=None, notes=[{"note": "felt longer", "pick": "claim", "by": None, "createdAt": "2026-10-01T00:00:00Z"}])}
DET[3] = dict(DET[1], id=3, title='T')
sent = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(logged_in=True, user=None, viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        if logged_in: ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user or ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/hypotheses" and req.method == "GET": return ok(list(H.values()))
            if key == "/api/hypotheses" and req.method == "POST": sent.append("create"); return ok({"id": 3}, 201)
            if key == "/api/hypotheses/draw": return route.fulfill(status=204, body="") if H[1].get("answered") and not DET[2].get("x") and False else ok({"id": 1})
            m = re.match(r"/api/hypotheses/(\d+)$", key)
            if m and req.method == "GET": return ok(DET[int(m.group(1))])
            m = re.match(r"/api/hypotheses/(\d+)/trials", key)
            if m:
                b = json.loads(req.post_data); sent.append(b)
                d = DET[int(m.group(1))]; d["mine"] = {"pick": "claim"}; d["tally"] = {"n": 4, "claim": 3, "other": 1, "unsure": 0, "informative": 4, "share": .75, "p": .6}
                return ok({"ok": True, "earned": 1, "tally": d["tally"]})
            if req.method == "PATCH" and key.startswith("/api/hypotheses/"): sent.append(json.loads(req.post_data)); return ok({"status": "ok"})
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    # anonymous participant, blind A/B
    ctx = new_ctx(logged_in=False); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/hypotheses"); page.wait_for_selector("[data-testid=hyp-card]")
    check(page.locator("[data-testid=hyp-card]").count() == 2, "List: both hypotheses")
    check(page.locator("[data-testid=hyp-add]").count() == 0, "List: proposing needs a login")
    page.click("[data-testid=hyp-draw]"); page.wait_for_url("**/hypothesis/1"); page.wait_for_selector("[data-testid=hyp-try]")
    check(page.locator("[data-testid=hyp-try]").count() == 1 and page.locator("[data-testid=tally]").count() == 0, "A/B: test shown, tally hidden before answering")
    check(page.locator("[data-testid=sample-play]").count() == 2, "A/B: two clips")
    check("No account needed" in page.locator("[data-testid=hyp-try]").inner_text(), "A/B: says no account is needed")
    page.fill("input[aria-label=Note]", "second was duller")
    page.click("[data-testid=ans-first]"); page.wait_for_selector("[data-testid=hyp-thanks]")
    body = sent[-1]
    check(body["pick"] == "first" and isinstance(body["swapped"], bool) and len(body["token"]) >= 16 and body["note"] == "second was duller", "A/B: sends pick, swap flag, token and note")
    check(page.locator("[data-testid=tally]").count() == 1, "A/B: tally appears after answering")
    tok = page.evaluate("localStorage.getItem('exomusica_participant')")
    check(tok == body["token"], "Participant token is kept in this browser only")
    ctx.close()

    # protocol-only, as author
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/hypothesis/2"); page.wait_for_selector("[data-testid=hypothesis-page]")
    check(page.locator("[data-testid=hyp-try]").count() == 0, "Author: cannot answer their own")
    check(page.locator("[data-testid=tally]").count() == 1 and page.locator("[data-testid=hyp-notes] li").count() == 1, "Author: sees tally and notes")
    check(page.locator("[data-testid=hyp-admin]").count() == 1, "Author: controls shown")
    page.select_option("[data-testid=hyp-set-status]", "supported"); page.wait_for_timeout(300)
    check(any(isinstance(s, dict) and s.get("status") == "supported" for s in sent), "Author: setting status sends PATCH")
    ctx.close()

    # member answers a protocol-only one
    DET[2].update(isAuthor=False, canEdit=False)
    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/hypothesis/2"); page.wait_for_selector("[data-testid=hyp-try]")
    check(page.locator("[data-testid=ans-claim]").count() == 1, "Protocol-only: holds / doesn't buttons")
    page.click("[data-testid=ans-other]"); page.wait_for_selector("[data-testid=hyp-thanks]")
    check(sent[-1]["pick"] == "other" and "+1 point" in page.locator("[data-testid=hyp-thanks]").inner_text(), "Member: answer sent, point earned")
    # propose form
    page.goto(f"{BASE}/hypotheses"); page.wait_for_selector("[data-testid=hyp-add]"); page.click("[data-testid=hyp-add]")
    page.fill("input[name=title]", "T"); page.fill("textarea[name=claim]", "C"); page.fill("textarea[name=protocol]", "P")
    page.click("[data-testid=hyp-save]"); page.wait_for_url("**/hypothesis/3")
    check("create" in sent, "Propose: form posts and opens the new page")
    # terminal
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("go basket"); page.keyboard.press("Enter"); page.wait_for_url("**/hypotheses")
    check(True, "Terminal: go basket")
    for w in (375,):
        page.set_viewport_size({"width": w, "height": 800}); page.goto(f"{BASE}/hypothesis/1"); page.wait_for_selector("[data-testid=hypothesis-page]"); page.wait_for_timeout(300)
        o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(o <= 1, f"No horizontal overflow on a phone ({o}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
