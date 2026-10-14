import json, re, sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); src = open(D + "/e2e_fix277.py").read()
__file__ = D + "/e2e_fix277.py"; exec(src.split("\ndef run(playwright):")[0])
def run(pw):
    b = pw.chromium.launch()
    for W in (390, 360, 320):
        ctx = b.new_context(viewport={"width": W, "height": 800}, has_touch=True, is_mobile=True)
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))}); localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda x, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(x))
            if key in ("/api/landmarks", "/api/field-log", "/api/scans", "/api/chart"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        p = ctx.new_page(); p.goto(f"{BASE}/"); p.wait_for_selector("[data-testid=faceplate]"); p.wait_for_timeout(500)
        # worst case: every badge shows two digits
        p.evaluate("()=>{document.querySelectorAll('.faceplate em').forEach(e=>e.textContent='99'); const a=document.querySelector('[data-testid=fp-around]'); if(a){a.removeAttribute('disabled')}}")
        r = p.evaluate("""()=>{const f=document.querySelector('.faceplate');const W=window.innerWidth;const out=[];f.querySelectorAll('button,a').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>W+0.5||r.left<-0.5)out.push((e.getAttribute('data-testid')||e.className)+':'+Math.round(r.left)+'-'+Math.round(r.right))});return {fsw:f.scrollWidth,fcw:f.clientWidth,doc:document.documentElement.scrollWidth-W,out,kids:[...f.children].map(c=>(c.getAttribute('data-testid')||c.className||c.tagName).toString().slice(0,18)+':'+Math.round(c.getBoundingClientRect().width))}}""")
        print(W, r)
        p.screenshot(path=f"/tmp/fp{W}.png", clip={"x":0,"y":0,"width":W,"height":130})
with sync_playwright() as pw: run(pw)
