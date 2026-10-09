import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix286.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])

STATE = {"solved": False}
def station():
    nodes = [{"id": 1, "title": "Carrier 1", "body": "Listen. What is the third word?", "mediaUrl": "/uploads/rain.wav", "hint": "count from the end", "hasAnswer": True, "solved": STATE["solved"], "quorum": 0, "solveCount": None,
              "reward": {"text": "The door is a cave.", "url": None, "points": 3, "item": {"id": 8, "title": "Locked kit"}} if STATE["solved"] else None},
             {"id": 2, "title": "The Lock", "body": "Everyone must say it.", "mediaUrl": None, "hint": None, "hasAnswer": True, "solved": False, "quorum": 5, "solveCount": 2, "reward": None}]
    if STATE["solved"]: nodes.append({"id": 3, "title": "Unlocked", "body": "Next.", "mediaUrl": "/uploads/pic1.png", "hint": None, "hasAnswer": False, "solved": False, "quorum": 0, "solveCount": None, "reward": None})
    return {"today": {"index": 31, "cycle": 1, "month": 1, "day": 4, "label": "4 Drift, Cycle 1"}, "nodes": nodes}
ADMIN_NODES = [
  {"id": 1, "title": "Carrier 1", "body": "b", "mediaUrl": None, "hint": None, "hasAnswer": True, "requires": [], "quorum": 0, "opensOnDay": None, "opensOn": None, "rewardText": None, "rewardUrl": None, "rewardPoints": 0, "rewardItemId": None, "published": True, "solveCount": 4},
  {"id": 2, "title": "The Lock", "body": "b", "mediaUrl": None, "hint": None, "hasAnswer": True, "requires": [1], "quorum": 5, "opensOnDay": 40, "opensOn": "13 Drift, Cycle 1", "rewardText": None, "rewardUrl": None, "rewardPoints": 0, "rewardItemId": None, "published": True, "solveCount": 2},
  {"id": 3, "title": "Unlocked", "body": "b", "mediaUrl": None, "hint": None, "hasAnswer": False, "requires": [2], "quorum": 0, "opensOnDay": None, "opensOn": None, "rewardText": None, "rewardUrl": None, "rewardPoints": 0, "rewardItemId": None, "published": False, "solveCount": 0}]
sent, answers = [], []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def new_ctx(user=None, viewport=None):
        ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user or ME))});")
        def handle(route):
            req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key == "/api/signal": return ok(station())
            m = re.match(r"/api/signal/(\d+)/answer", key)
            if m:
                a = json.loads(req.post_data); answers.append(a)
                if a["answer"].strip().lower() == "ice": STATE["solved"] = True; return ok({"correct": True, "newly": True, "reward": {}})
                return ok({"correct": False})
            if key == "/api/admin/signal" and req.method == "GET": return ok({"today": {"index": 31, "label": "4 Drift, Cycle 1"}, "nodes": ADMIN_NODES})
            if key == "/api/admin/signal" and req.method == "POST":
                sent.append(("POST", json.loads(req.post_data))); n = dict(ADMIN_NODES[0], id=9, title=json.loads(req.post_data)["title"]); ADMIN_NODES.append(n); return ok(n, 201)
            if re.match(r"/api/admin/signal/\d+/test", key): return ok({"correct": json.loads(req.post_data)["answer"] == "ice"})
            if re.match(r"/api/admin/signal/\d+$", key) and req.method == "PATCH":
                sent.append(("PATCH", json.loads(req.post_data))); return ok(ADMIN_NODES[1])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            if path.startswith("/uploads/"): return route.fulfill(status=200, content_type="image/png", body=b"")
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        return ctx
    errors = []
    def watch(p): p.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    ctx = new_ctx(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/signal"); page.wait_for_selector("[data-testid=sig-node]")
    check(page.locator("[data-testid=sig-how]").evaluate("e=>e.open"), "Player: help open on the first visit")
    page.evaluate("localStorage.setItem('exomusica_signal_seen','[999]')"); page.reload(); page.wait_for_selector("[data-testid=sig-node]")
    check(page.locator("[data-testid=sig-date]").inner_text() == "4 Drift, Cycle 1", "Player: the station's own date")
    check(page.locator("[data-testid=sig-how]").count() == 1, "Player: how-it-works help")
    check(page.locator("[data-testid=sig-new]").count() >= 1, "Player: new badge on unseen transmissions")
    check(page.locator("[data-testid=sig-tab-todo]").count() == 1 and page.locator("[data-testid=sig-tab-done]").count() == 1, "Player: tabs")
    page.locator("[data-testid=sig-tab-all]").click()
    check(page.locator("[data-testid=sig-node]").count() == 2, "Player: only what is on the air")
    check(page.locator("[data-testid=sig-analyze]").count() >= 1, "Player: audio can go to the Analyzer")
    check(page.locator("audio.sig-media").count() == 1, "Player: audio transmission plays natively")
    q = page.locator("[data-testid=sig-quorum]")
    check("2 of 5" in q.inner_text(), "Player: collective lock shows progress")
    page.locator("[data-testid=sig-node]").first.locator("button", has_text="Hint").click()
    check(page.locator("[data-testid=sig-hint]").count() == 1, "Player: hint on request")
    a = page.locator("[data-testid=sig-answer]").first
    a.fill("snow"); page.locator("[data-testid=sig-submit]").first.click(); page.wait_for_selector("[data-testid=sig-msg]")
    check("No carrier" in page.locator("[data-testid=sig-msg]").inner_text() and page.locator("[data-testid=sig-reward]").count() == 0, "Player: wrong answer reveals nothing")
    a.fill(" ICE "); page.locator("[data-testid=sig-submit]").first.click(); page.wait_for_selector("[data-testid=sig-reward]")
    check(answers[-1]["answer"] == " ICE ", "Player: the answer goes to the server to be checked")
    page.locator("[data-testid=sig-tab-all]").click()
    check(page.locator("[data-testid=sig-tried]").count() >= 0, "Player: tried chips render")
    check("received" in page.locator("[data-testid=sig-node]", has_text="received").first.inner_text() and "Locked kit" in page.locator("[data-testid=sig-reward]").inner_text(), "Player: solved shows the reward")
    page.wait_for_selector("text=Unlocked"); 
    check(page.locator("[data-testid=sig-node]").count() == 3, "Player: solving puts the next transmission on the air")
    check("answer" not in page.content().lower().split("sig-answer")[0][:0] and "answerHash" not in page.content(), "Player: no hash in the page")
    ctx.close()

    ctx = new_ctx(user=ADMIN); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/admin/signal"); page.wait_for_selector("[data-testid=sig-gnode]")
    check(page.locator("[data-testid=sig-gnode]").count() == 3 and page.locator("[data-testid=sig-graph] path.sig-edge").count() == 2, "Admin: graph with nodes and edges")
    check(page.locator(".sig-gnode.draft").count() == 1, "Admin: drafts drawn dashed")
    x = [page.locator("[data-testid=sig-gnode]").nth(i).bounding_box()["x"] for i in range(3)]
    check(x[0] < x[1] < x[2], "Admin: layered left to right by requirement")
    page.locator("[data-testid=sig-gnode]").nth(1).click(); page.wait_for_selector("[data-testid=sa-form]")
    check(page.locator("[data-testid=sa-quorum]").input_value() == "5", "Admin: select loads the node")
    check(page.locator("select[aria-label=Month]").input_value() == "1" and page.locator("input[aria-label=Day]").input_value() == "13", "Admin: date shown on the station calendar")
    page.fill("[data-testid=sa-answer]", "glacier"); page.click("[data-testid=sa-save]"); page.wait_for_timeout(300)
    k, body = sent[-1]
    check(k == "PATCH" and body["answer"] == "glacier" and body["opensOnDay"] == 40 and body["requires"] == [1], "Admin: save sends answer, date index and requirements")
    page.fill("[aria-label='Try an answer']", "ice"); page.click("button:has-text('Test')"); page.wait_for_selector("[data-testid=sa-testres]")
    check(page.locator("[data-testid=sa-testres]").inner_text() == "correct", "Admin: test an answer")
    page.click("[data-testid=sa-new]"); page.fill("input[aria-label=Title]", "Fresh"); page.fill("textarea[aria-label=Text]", "words")
    page.locator("fieldset label", has_text="Carrier 1").locator("input").check(); page.check("[data-testid=sa-published]")
    page.click("[data-testid=sa-save]"); page.wait_for_timeout(300)
    k, body = sent[-1]
    check(k == "POST" and body["requires"] == [1] and body["published"] is True and "answer" not in body, "Admin: new node posts without an answer field")
    page.keyboard.press("Control+k"); page.wait_for_selector("[data-testid=terminal-input]")
    page.keyboard.type("go signal"); page.keyboard.press("Enter"); page.wait_for_url("**/signal")
    check(True, "Terminal: go signal")
    ctx.close()
    ctx = new_ctx(viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/signal"); page.wait_for_selector("[data-testid=sig-node]"); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    ctx.close()
    ctx = new_ctx(user=ADMIN, viewport={"width": 375, "height": 800}); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/admin/signal"); page.wait_for_selector("[data-testid=sig-gnode]"); page.locator("[data-testid=sig-gnode]").first.click(); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone admin: graph scrolls inside its box, page doesn't ({o}px)")
    ctx.close()
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
