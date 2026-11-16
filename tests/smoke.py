"""Canvy smoke tests. Run:  pip install playwright && playwright install chromium && python tests/smoke.py
Serves the repo on a local port and drives the editor in headless Chromium."""
import http.server, threading, functools, sys, os, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'
failures = []

def check(name, cond):
    print(('ok   ' if cond else 'FAIL ') + name)
    if not cond: failures.append(name)

with sync_playwright() as p:
    exe = os.environ.get('CHROME_PATH')
    b = p.chromium.launch(**({'executable_path': exe} if exe else {}))
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '/app/'); pg.wait_for_function("typeof doc !== 'undefined' && doc && STORE.ok")

    pg.evaluate("applyCommand('user:Customer -> Web app -(HTTPS)-> API -> db:Orders, API -> queue:Jobs')")
    check('typed diagram creates shapes and arrows', pg.evaluate("els.filter(e=>e.type==='arrow').length") == 4)
    check('arrow label parsed', pg.evaluate("els.some(e=>e.type==='arrow'&&e.label==='HTTPS')"))

    pg.keyboard.press('Escape'); pg.keyboard.press('r')
    pg.mouse.move(200, 650); pg.mouse.down(); pg.mouse.move(320, 720, steps=4); pg.mouse.up()
    check('draw a rectangle', pg.evaluate("els.at(-1).type") == 'rect')
    pg.keyboard.press('Enter'); pg.keyboard.type('Hello ไทย'); pg.keyboard.press('Enter')
    check('edit a label in Thai', pg.evaluate("els.at(-1).label") == 'Hello ไทย')

    n = pg.evaluate("els.length"); pg.keyboard.press('Control+z')
    check('undo', pg.evaluate("els.at(-1).label") != 'Hello ไทย' or pg.evaluate("els.length") < n)
    pg.keyboard.press('Control+Shift+z')

    pg.wait_for_timeout(500); pg.reload(); pg.wait_for_function("typeof doc !== 'undefined' && doc && els.length > 0")
    check('diagram survives a reload (IndexedDB)', pg.evaluate("els.length") >= n - 1)
    check('data lives in IndexedDB', pg.evaluate("STORE.ok") is True)

    code = pg.evaluate("packDoc()")
    pg.evaluate("openDoc(newDoc('Other'))")
    pg.evaluate(f"location.hash='#d={code}'"); pg.wait_for_timeout(600)
    check('share link opens in an open tab', pg.evaluate("els.length") >= 5)

    pg.evaluate("view.x=-20000;renderView()")  # empty canvas under the cursor
    pg.mouse.click(700, 400, button='right'); pg.wait_for_timeout(100)
    check('right-click opens the quick menu', pg.evaluate("document.querySelector('#dialMenu').classList.contains('show')"))
    pg.keyboard.press('Escape')

    pg.evaluate("setLang('th')")
    check('Thai interface', pg.inner_text('#btnShare').strip() == 'แชร์')
    pg.evaluate("setLang('en')")

    check('Mermaid round trip', 'flowchart' in pg.evaluate("toMermaid()"))
    check('no page errors', not errors)
    if errors: print('\n'.join(errors))
    b.close()

srv.shutdown()
print('\n%d failed' % len(failures) if failures else '\nall passed')
sys.exit(1 if failures else 0)
