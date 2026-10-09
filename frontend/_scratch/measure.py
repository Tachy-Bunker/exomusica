import json, re, sys
from playwright.sync_api import sync_playwright
src = open("_scratch/e2e_fix277.py").read()
exec(src.split("def run(playwright):")[0])
def go(url, w=390, h=800, shot=None, js=None):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": w, "height": h})
        ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ME))});")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            body = DATA.get(path, DATA.get(key, {}))
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.goto(BASE + url); pg.wait_for_timeout(1200)
        out = pg.evaluate(js) if js else None
        if shot: pg.screenshot(path=shot)
        b.close(); return out
if __name__ == "__main__":
    print(go(sys.argv[1], js=sys.argv[2] if len(sys.argv) > 2 else None, shot=sys.argv[3] if len(sys.argv) > 3 else None))
