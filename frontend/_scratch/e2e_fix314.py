import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])

def run(playwright):
    browser = playwright.chromium.launch()
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(user, classic="0"):
        ctx = browser.new_context(viewport={"width": 1280, "height": 700}, service_workers="block")
        init = f"localStorage.setItem('exomusica_classic','{classic}');"
        if user: init += f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(user))});"
        ctx.add_init_script(init)
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key in ("/api/branches", "/api/landmarks", "/api/field-log", "/api/chart"): return ok([])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    after = lambda p, sel: p.evaluate("s=>{const e=document.querySelector(s);return e?getComputedStyle(e,'::after').content:null}", sel)
    # inject probe links so the test does not depend on nav layout
    ADD = "()=>{const w=document.createElement('div');w.id='t';w.innerHTML='<a id=lj href=\"/jam\">j</a><a id=lj2 href=\"/jam/ABCD\">j2</a><a id=lo href=\"/jammer\">o</a><a id=la href=\"/admin/users\">a</a><a id=ln data-nolock href=\"/jam\">n</a><a id=lh href=\"/\">h</a>';document.body.appendChild(w)}"
    g = mk(None); g.goto(f"{BASE}/chart"); g.wait_for_selector("[data-testid=chart-page]"); g.evaluate(ADD)
    check(after(g, "#lj") not in (None, "none", "normal"), f"Guest: /jam tagged ({after(g, '#lj')})")
    check(after(g, "#lj2") not in (None, "none", "normal"), "Guest: /jam/ABCD tagged")
    check(after(g, "#la") not in (None, "none", "normal"), "Guest: /admin tagged")
    check(after(g, "#lo") in ("none", "normal"), "Guest: /jammer (similar name) not tagged")
    check(after(g, "#lh") in ("none", "normal"), "Guest: home not tagged")
    check(after(g, "#ln") in ("none", "normal"), "data-nolock opts a link out")
    col = g.evaluate("()=>[getComputedStyle(document.getElementById('lj'),'::after').backgroundColor,getComputedStyle(document.getElementById('la'),'::after').backgroundColor]")
    check(col[0] != col[1], f"Members and staff tags differ in colour {col}")
    m = mk(ME); m.goto(f"{BASE}/chart"); m.wait_for_selector("[data-testid=chart-page]"); m.evaluate(ADD)
    check(after(m, "#lj") in ("none", "normal"), "Member: /jam not tagged")
    check(after(m, "#la") not in (None, "none", "normal"), "Member: /admin still tagged")
    a = mk({**ME, "isAdmin": True}); a.goto(f"{BASE}/chart"); a.wait_for_selector("[data-testid=chart-page]"); a.evaluate(ADD)
    check(after(a, "#la") in ("none", "normal") and after(a, "#lj") in ("none", "normal"), "Staff: nothing tagged")
    check(a.locator("style[data-access]").count() == 0, "Staff: no style element at all")
    # classic mode keeps the tags
    c = mk(None, "1"); c.goto(f"{BASE}/chart"); c.wait_for_selector("[data-testid=chart-page]"); c.evaluate(ADD)
    check(after(c, "#lj") not in (None, "none", "normal"), "Classic mode keeps lock tags")
    # wipe colour by destination
    w = mk(None); w.goto(f"{BASE}/chart"); w.wait_for_selector("[data-testid=chart-page]")
    w.evaluate("()=>{const a=document.createElement('a');a.id='go';a.href='/jam';a.textContent='go';document.body.appendChild(a)}")
    w.evaluate("()=>{window.history.pushState({}, '', '/jam'); window.dispatchEvent(new PopStateEvent('popstate'))}")
    try:
        w.wait_for_selector("[data-testid=door-wipe]", timeout=3000)
        check(w.get_attribute("[data-testid=door-wipe]", "data-door") == "members", "Wipe into /jam is members-coloured")
        bi = w.evaluate("()=>getComputedStyle(document.querySelector('.door-wipe')).backgroundImage"); check("63, 201, 187" in bi, f"Wipe edge is teal {bi[:90]}")
    except Exception as e:
        check(False, f"wipe: {e}")
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
