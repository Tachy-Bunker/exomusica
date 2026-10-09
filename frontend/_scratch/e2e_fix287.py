import json, re, sys
from playwright.sync_api import sync_playwright
src = open(__file__.replace("e2e_fix287.py", "e2e_fix277.py")).read()
exec(src.split("def run(playwright):")[0])
uploads = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('exomusica_token','t'); localStorage.setItem('exomusica_user', {json.dumps(json.dumps(ADMIN))});")
    def handle(route):
        req = route.request; path = req.url.replace(BASE, ""); key = path.split("?")[0]
        ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
        if key == "/api/admin/signal/media": uploads.append(len(req.post_data_buffer or b"")); return ok({"url": "/uploads/signal/abc.wav"}, 201)
        if key == "/api/admin/signal": return ok({"today": {"index": 0, "label": "1 Static, Cycle 1"}, "nodes": []})
        if path in DATA: return ok(DATA[path])
        if key in DATA: return ok(DATA[key])
        return ok({})
    ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
    errors = []
    page = ctx.new_page(); page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", str(e)[:200])))

    page.goto(f"{BASE}/admin/signal"); page.wait_for_selector("[data-testid=sa-studio]"); page.click("[data-testid=sa-studio]")
    page.wait_for_selector("[data-testid=signal-studio]")
    page.fill("[data-testid=studio-text]", "@@@"); 
    check(page.locator("[data-testid=studio-go]").is_disabled(), "Text: nothing drawable, nothing to make")
    page.fill("[data-testid=studio-text]", "CQ 73")
    page.click("[data-testid=studio-go]"); page.wait_for_selector("[data-testid=studio-result]", timeout=20000)
    page.wait_for_function("document.querySelector('[data-testid=studio-audio]') && document.querySelector('[data-testid=studio-audio]').src.startsWith('blob:')")
    # the WAV is real and the spectrogram has content in the top (high pitch) and nothing outside the text band
    info = page.evaluate("""async () => {
      const a = document.querySelector('[data-testid=studio-audio]'); const b = new Uint8Array(await (await fetch(a.src)).arrayBuffer());
      const c = document.querySelector('[data-testid=studio-spec]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0, topLit = 0, bottomLit = 0; const H = c.height;
      for (let y = 0; y < H; y++) for (let x = 0; x < c.width; x++) { const v = d[(y*c.width+x)*4]+d[(y*c.width+x)*4+1]+d[(y*c.width+x)*4+2]; if (v > 200) { lit++; if (y > H*0.58 && y < H*0.97) topLit++; if (y < H*0.5 || y > H*0.985) bottomLit++; } }
      return {riff: String.fromCharCode(...b.slice(0,4)), wave: String.fromCharCode(...b.slice(8,12)), len: b.length, lit, topLit, bottomLit, w: c.width, h: c.height};
    }""")
    check(info["riff"] == "RIFF" and info["wave"] == "WAVE" and info["len"] > 44 + 44100 * 2 * 7, f"Text: a real 16-bit WAV ({info['len']//1024} KB)")
    check(info["lit"] > 300 and info["topLit"] > info["lit"] * 0.95 and info["bottomLit"] < info["lit"] * 0.03, f"Text: the spectrogram shows the letters in the pitch band only (lit {info['lit']}, in band {info['topLit']}, outside {info['bottomLit']})")
    page.click("[data-testid=studio-upload]"); page.wait_for_selector("[data-testid=studio-url]")
    check("/uploads/signal/abc.wav" in page.locator("[data-testid=studio-url]").inner_text() and uploads and uploads[-1] > 100000, "Upload: sends the WAV and shows the path to use")
    if __import__("os").environ.get("SHOT"): page.screenshot(path="/tmp/shot_studio.png")
    # xy
    page.click("[data-testid=tab-xy]")
    check(page.locator("[data-testid=studio-go]").is_disabled(), "XY: nothing drawn, nothing to make")
    box = page.locator("[data-testid=studio-pad]").bounding_box()
    page.mouse.move(box["x"] + 100, box["y"] + 100); page.mouse.down()
    for i in range(1, 30): page.mouse.move(box["x"] + 100 + i * 10, box["y"] + 100 + (i % 5) * 20)
    page.mouse.up()
    check(page.locator("[data-testid=studio-pad] path.studio-ink").count() >= 1, "XY: a stroke is drawn on the pad")
    page.select_option("select[aria-label='Bit depth']", "24"); page.fill("input[aria-label=Seconds]", "3")
    page.click("[data-testid=studio-go]"); page.wait_for_function("document.querySelector('[data-testid=studio-result]') && /stereo/.test(document.querySelector('[data-testid=studio-result]').innerText)", timeout=20000)
    ch = page.evaluate("""async () => { const a = document.querySelector('[data-testid=studio-audio]'); const b = new Uint8Array(await (await fetch(a.src)).arrayBuffer()); const v = new DataView(b.buffer); return [v.getUint16(22, true), v.getUint16(34, true)]; }""")
    check(ch == [2, 24], f"XY: stereo, 24-bit WAV {ch}")
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    o = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(o <= 1, f"Phone: no horizontal overflow ({o}px)")
    check(not errors, "no page errors: " + "; ".join(errors[:3]))
    browser.close()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)

with sync_playwright() as p: run(p)
