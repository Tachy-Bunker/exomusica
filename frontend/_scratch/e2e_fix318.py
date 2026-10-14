import json, re, sys
from playwright.sync_api import sync_playwright
D = __file__.rsplit("/", 1)[0]
src = open(D + "/e2e_fix277.py").read()
exec(src.split("def run(playwright):")[0])
WAV = open("/tmp/claude-0/-home-claude/79b8691e-ce21-54a4-9b06-b8ca9b258796/scratchpad/bursts.wav", "rb").read()
TR = lambda i, t, alb, pos: {"id": i, "title": t, "fileUrl": "/uploads/rain.wav", "format": "WAV", "durationSeconds": 8, "position": pos, "albumTitle": alb, "albumSlug": "al1", "coverArtUrl": None, "composer": "Ghost", "branchSlug": "b2", "bookmarks": [], "replayGainDb": 0, "source": "official", "genres": []}
TRACKS = [TR(2, "Second Piece", "First", 1), TR(1, "Rain Piece", "First", 0), TR(3, "Other Album Song", "Zed", 0)]
fetched = []

def run(playwright):
    browser = playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    results = []; errors = []
    def check(c, m): results.append((bool(c), m)); print(("ok   " if c else "FAIL ") + m)
    def mk(w=1280):
        ctx = browser.new_context(viewport={"width": w, "height": 800}, permissions=["clipboard-read", "clipboard-write"])
        ctx.add_init_script("document.addEventListener('timeupdate',e=>{if(window.__first===undefined&&e.target.currentTime>=1)window.__first=e.target.currentTime},true);if(localStorage.getItem('exomusica_classic')===null)localStorage.setItem('exomusica_classic','0');")
        def handle(route):
            path = route.request.url.replace(BASE, ""); key = path.split("?")[0]
            ok = lambda b, s=200: route.fulfill(status=s, content_type="application/json", body=json.dumps(b))
            if key.startswith("/uploads/") and key.endswith(".wav"):
                rng = route.request.headers.get("range"); n = len(WAV)
                if rng:  # a real file server answers byte ranges, which is what makes seeking possible
                    a, b = re.match(r"bytes=(\d*)-(\d*)", rng).groups(); a = int(a or 0); b = int(b) if b else n - 1
                    return route.fulfill(status=206, headers={"Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Content-Range": f"bytes {a}-{b}/{n}"}, body=WAV[a:b + 1])
                return route.fulfill(status=200, headers={"Content-Type": "audio/wav", "Accept-Ranges": "bytes"}, body=WAV)
            if key == "/api/branches/b2/tracks/shuffle": fetched.append(path); return ok(TRACKS)
            if key.endswith("/spectrogram"): return ok({"error": "no"}, 501)
            if key in ("/api/landmarks", "/api/field-log", "/api/scans"): return ok([])
            if path in DATA: return ok(DATA[path])
            if key in DATA: return ok(DATA[key])
            return ok({})
        ctx.route(re.compile(r".*/(api|uploads)/.*"), handle)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: ("sandboxed" in str(e) or errors.append(str(e)), print("PAGEERROR", str(e)[:200])))
        return pg
    p = mk(); p.goto(f"{BASE}/soundbay?sort=az&show=all"); p.wait_for_selector("[data-testid=branch-row]")
    row = p.locator("[data-slug=b2]")
    check(row.locator("[data-testid=row-share]").count() == 1, "Each branch row has a Share button")
    check(len(fetched) == 0, "Its songs are not fetched until you ask")
    row.locator("[data-testid=row-share]").click(); p.wait_for_selector("[data-testid=share-modal]")
    check(len(fetched) == 1, "Clicking Share fetches the branch's songs once")
    check(p.locator("[data-testid=share-modal]").evaluate("e => e.parentElement.parentElement === document.body"), "The dialog is on the page itself, not clipped inside the row")
    opts = p.locator("[data-testid=share-track] option").all_inner_texts()
    check(opts[0].startswith("No particular") and "Rain Piece" in opts[1] and "Second Piece" in opts[2] and "Other Album Song" in opts[3], f"Songs are listed by album then position {opts}")
    check(p.locator("[data-testid=share-genres-row]").count() == 0 and p.locator("[data-testid=share-view-map]").count() == 0, "No map-only options on a branch")
    check(p.locator("[data-testid=share-embed]").count() == 0, "No embed code (Soundbay is not an embeddable map)")
    link0 = p.input_value("[data-testid=share-link]")
    check(link0.endswith("/soundbay?open=b2"), f"With no song the link opens the branch ({link0})")
    p.select_option("[data-testid=share-track]", "1"); p.fill("[data-testid=share-time]", "0:03")
    link = p.input_value("[data-testid=share-link]")
    q = dict(x.split("=") for x in link.split("?")[1].split("&"))
    check(q.get("open") == "b2" and q.get("track") == "1" and q.get("t") == "0%3A03" and q.get("play") == "1", f"Link carries branch, song, time and play ({link})")
    p.fill("[data-testid=share-time]", "nope"); check(p.locator("[data-testid=share-time-error]").count() == 1, "A bad time is flagged")
    p.fill("[data-testid=share-time]", "0:03")
    p.click("[data-testid=share-copy-link]"); p.wait_for_timeout(200)
    check(p.evaluate("navigator.clipboard.readText()") == link, "Copy puts the link on the clipboard")
    p.keyboard.press("Escape"); check(p.locator("[data-testid=share-modal]").count() == 0, "Esc closes it")
    # open the link in a fresh visit
    fetched.clear()
    r = mk(); r.goto(link.replace(BASE, BASE)); r.wait_for_selector("[data-testid=branch-row]")
    try:
        r.wait_for_selector("[data-testid=share-prompt]", timeout=1500); prompt = True
    except Exception: prompt = False
    if prompt:
        check("Rain Piece" in r.inner_text("[data-testid=share-prompt]") and "0:03" in r.inner_text("[data-testid=share-prompt]"), "Arriving cold: the prompt names the song and the moment")
        r.click("[data-testid=share-prompt-play]")
    else:
        check(True, "Arriving warm: started without a prompt")
    r.wait_for_function("()=>{const a=document.querySelector('audio');return a && !a.paused && a.currentTime>0}", timeout=10000)
    r.wait_for_function("()=>window.__first!==undefined", timeout=5000); t0 = r.evaluate("()=>window.__first")
    check(2.9 <= t0 < 4.5, f"The right song starts from the right moment ({t0:.1f}s)")
    check("Rain Piece" in r.inner_text(".player-bar-wrapper"), "The player shows that song")
    check(len(fetched) == 1, "The branch's songs were fetched once for the link")
    # a song that no longer exists falls back to the first song
    fetched.clear(); n = mk(); n.goto(f"{BASE}/soundbay?open=b2&track=99&play=1&show=all"); n.wait_for_selector("[data-testid=branch-row]")
    try: n.wait_for_selector("[data-testid=share-prompt]", timeout=6000); n.click("[data-testid=share-prompt-play]")
    except Exception: pass
    n.wait_for_function("()=>{const a=document.querySelector('audio');return a && !a.paused}", timeout=10000)
    check("Rain Piece" in n.inner_text(".player-bar-wrapper"), "A removed song falls back to the branch's first")
    # no play=1: nothing fetched, nothing plays
    fetched.clear(); z = mk(); z.goto(f"{BASE}/soundbay?open=b2&track=1&t=0:03&show=all"); z.wait_for_selector("[data-testid=branch-row]"); z.wait_for_timeout(800)
    check(len(fetched) == 0 and z.locator("[data-testid=share-prompt]").count() == 0, "Without play=1 the link only opens the branch")
    ph = mk(390); ph.goto(f"{BASE}/soundbay?sort=az&show=all"); ph.wait_for_selector("[data-testid=branch-row]")
    ov = ph.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth")
    ph.locator("[data-slug=b2] [data-testid=row-share]").click(); ph.wait_for_selector("[data-testid=share-modal]")
    box = ph.locator("[data-testid=share-modal]").bounding_box()
    check(ov <= 0 and box["x"] >= 0 and box["x"] + box["width"] <= 390, f"Phone 390px: no sideways scroll, dialog fits (overflow {ov}, dialog {box['x']:.0f}+{box['width']:.0f})")
    check(not errors, f"No page errors {errors[:2]}")
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
with sync_playwright() as p: run(p)
