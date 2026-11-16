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
    # ---- phase 2 ----
    pg.evaluate("openDoc(newDoc('Phase 2'));view={x:640,y:400,z:1};render()")
    pg.evaluate("applyCommand('Alpha -> Beta')"); pg.keyboard.press('Escape')
    a = pg.evaluate("(()=>{const e=els.find(x=>x.label==='Alpha');return [e.x,e.y,e.w,e.h]})()")
    b0 = pg.evaluate("(()=>{const e=els.find(x=>x.label==='Beta');return [e.x,e.y,e.w,e.h]})()")
    # drag Beta so its top is 4px off Alpha's top: it should snap level
    sx = lambda wx: wx*1+640; sy = lambda wy: wy*1+400
    cx, cy = sx(b0[0]+b0[2]/2), sy(b0[1]+b0[3]/2)
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx+30, cy+60, steps=4); pg.mouse.move(cx+30, cy+(a[1]-b0[1])+4, steps=3)
    check('smart guide shows while dragging', pg.evaluate("guides.length") > 0)
    pg.mouse.up()
    check('snaps level with a neighbour', abs(pg.evaluate("els.find(x=>x.label==='Beta').y") - a[1]) < 0.5)

    pg.evaluate("sel=new Set(els.filter(e=>e.type!=='arrow').map(e=>e.id));groupSel()")
    scr = lambda lab: pg.evaluate("(l=>{const e=els.find(x=>x.label===l);return [(e.x+e.w/2)*view.z+view.x,(e.y+e.h/2)*view.z+view.y]})", lab)
    pg.evaluate("sel.clear();render()")
    pg.mouse.click(*scr('Alpha'))
    check('clicking one grouped shape selects the group', pg.evaluate("sel.size") >= 2)
    pg.evaluate("lockSel()"); pg.wait_for_timeout(450)  # not a double-click
    pg.mouse.click(*scr('Alpha'))
    check('locked shapes ignore clicks', pg.evaluate("sel.size") == 0)
    pg.evaluate("sel=new Set(els.filter(e=>e.locked).map(e=>e.id));lockSel();sel.clear();render()")

    pg.evaluate("applyCommand('Ein Satz der viel zu lang ist um in eine einzige Zeile zu passen und umbrechen muss')")
    check('long labels wrap instead of growing forever', pg.evaluate("(()=>{const e=els.at(-1);return e.w<=330&&shownLabel(e).includes('\\n')})()"))
    pg.evaluate("applyCommand('ระบบจัดการคำสั่งซื้อและการชำระเงินสำหรับร้านค้าออนไลน์ขนาดใหญ่มาก')")
    check('Thai labels wrap on word boundaries', pg.evaluate("(()=>{const e=els.at(-1);const t=shownLabel(e);return t.includes('\\n')&&t.replace(/\\n/g,'')===e.label})()"))

    pg.evaluate("sel.clear();render()")
    pg.evaluate("view={x:640,y:400,z:1};renderView()")
    al = pg.evaluate("(()=>{const e=els.find(x=>x.label==='Alpha');return [(e.x+e.w)*view.z+view.x,(e.y+e.h/2)*view.z+view.y]})()")
    pg.mouse.move(al[0]-10, al[1]); pg.wait_for_timeout(50)
    pg.mouse.move(al[0]+20, al[1]); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.keyboard.press('Escape')
    check('quick-connect + adds a connected shape', pg.evaluate("els.filter(e=>e.type==='arrow'&&e.start===els.find(x=>x.label==='Alpha').id).length") >= 2)

    pg.evaluate("""(async()=>{const c=document.createElement('canvas');c.width=40;c.height=30;const g=c.getContext('2d');g.fillStyle='#d95b35';g.fillRect(0,0,40,30);
      const b=await new Promise(r=>c.toBlob(r,'image/png'));await addImage(new File([b],'x.png',{type:'image/png'}))})()""")
    pg.wait_for_timeout(300)
    check('images can be added', pg.evaluate("els.some(e=>e.type==='image'&&e.src.startsWith('data:image/'))"))
    check('links leave images out', 'image' not in pg.evaluate("packDoc().then(c=>unpack(c)).then(d=>d.e.map(e=>e.type).join())"))

    # ---- rotation, bends, cards, tables ----
    pg.evaluate("openDoc(newDoc('Rest of phase 2'));view={x:640,y:400,z:1};render()")
    pg.evaluate("applyCommand('One -> Two')"); pg.keyboard.press('Escape')
    one = lambda: pg.evaluate("(()=>{const e=els.find(x=>x.label==='One');return {x:e.x,y:e.y,w:e.w,h:e.h,rot:e.rot||0}})()")
    o = one(); pg.evaluate("sel=new Set([els.find(x=>x.label==='One').id]);render()")
    hx, hy = pg.evaluate("(()=>{const e=els.find(x=>x.label==='One');const h=rotHandle(e);return [h[0]*view.z+view.x,h[1]*view.z+view.y]})()")
    cx, cy = pg.evaluate("(()=>{const e=els.find(x=>x.label==='One');return [(e.x+e.w/2)*view.z+view.x,(e.y+e.h/2)*view.z+view.y]})()")
    pg.mouse.move(hx, hy); pg.mouse.down(); pg.mouse.move(cx+120, cy, steps=5); pg.mouse.up()
    check('rotate with the handle (snaps to 90°)', one()['rot'] == 90)
    check('rotated shape still hit-tests', pg.evaluate(f"hitTest(toWorld({cx},{cy}+{o['w']}/2-6))?.label") == 'One')
    pg.evaluate("sel=new Set([els.find(e=>e.type==='arrow').id]);render()")
    mx, my = pg.evaluate("(()=>{const g=arrowGeom(els.find(e=>e.type==='arrow'));return [g.mid[0]*view.z+view.x,g.mid[1]*view.z+view.y]})()")
    pg.mouse.move(mx, my); pg.mouse.down(); pg.mouse.move(mx, my-80, steps=5); pg.mouse.up()
    check('drag the arrow midpoint to bend it', pg.evaluate("arrowGeom(els.find(e=>e.type==='arrow')).kind") == 'curve')
    pg.evaluate("applyCommand('| Task | Owner | Status |')")
    check('typed table', pg.evaluate("els.at(-1).type==='table'&&els.at(-1).rows.length===2&&els.at(-1).rows[0][2]==='Status'"))
    t = pg.evaluate("(()=>{const e=els.at(-1);const r=cellRect(e,{r:1,c:0});return [(r.x+10)*view.z+view.x,(r.y+r.h/2)*view.z+view.y]})()")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400); pg.mouse.dblclick(*t); pg.keyboard.type('Write docs'); pg.keyboard.press('Tab'); pg.keyboard.type('มานี'); pg.keyboard.press('Enter')
    check('edit table cells with Tab', pg.evaluate("JSON.stringify(els.at(-1).rows[1].slice(0,2))") == '["Write docs","มานี"]')
    pg.evaluate("sel=new Set([els.at(-1).id]);tableEdit('+row')")
    check('add a table row', pg.evaluate("els.at(-1).rows.length") == 3)
    pg.evaluate("applyCommand('card:Launch plan')")
    check('card shape', pg.evaluate("els.some(e=>e.type==='card'&&e.label==='Launch plan')"))
    # ---- phase 3 ----
    pg.evaluate("openDoc(newDoc('Phase 3'));view={x:640,y:400,z:1};render()")
    pg.evaluate("runTemplate(TEMPLATES.find(t=>t.name==='วิเคราะห์ SWOT'))")
    check('SWOT template builds a frame and four cards', pg.evaluate("els.filter(e=>e.type==='card').length===4&&els.some(e=>e.type==='frame')"))
    pg.evaluate("runTemplate(TEMPLATES.find(t=>t.name==='ผังองค์กร'))")
    check('Thai org chart template', pg.evaluate("els.some(e=>e.label==='ผู้บริหาร')"))
    pdf = pg.evaluate("(async()=>{const b=await boxImage(frames()[0]?rectOf(frames()[0]):unionBox(els));const bytes=pdfBytes([b,b]);return [bytes.length,new TextDecoder('latin1').decode(bytes.slice(0,8)),new TextDecoder('latin1').decode(bytes.slice(-6))]})()")
    check('PDF bytes look right', pdf[0] > 5000 and pdf[1].startswith('%PDF-1.4') and 'EOF' in pdf[2])
    m = pg.evaluate("QR.encode('https://kimookpong.github.io/canvy/').length")
    check('QR code matrix', m == 29)
    ex = {"type":"excalidraw","elements":[{"id":"a","type":"rectangle","x":0,"y":0,"width":120,"height":60,"strokeColor":"#1e1e1e","backgroundColor":"#a5d8ff"},
          {"id":"t","type":"text","x":10,"y":10,"width":50,"height":20,"text":"Hello","containerId":"a"},
          {"id":"b","type":"ellipse","x":300,"y":0,"width":120,"height":60,"strokeColor":"#1e1e1e","backgroundColor":"transparent"},
          {"id":"r","type":"arrow","x":120,"y":30,"width":180,"height":0,"points":[[0,0],[180,0]],"startBinding":{"elementId":"a"},"endBinding":{"elementId":"b"},"endArrowhead":"arrow","strokeColor":"#1e1e1e"}]}
    conv = pg.evaluate("d=>{const o=excalidrawToCanvy(d);const r=o.find(e=>e.type==='rect'),a=o.find(e=>e.type==='arrow');return [r.label,r.fill,!!a.start&&!!a.end,a.ends]}", ex)
    check('Excalidraw import converts shapes, labels and bound arrows', conv == ['Hello','blue',True,'end'])
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(100); pg.keyboard.type('present')
    check('command palette finds actions', 'Present' in pg.inner_text('#palList') or 'นำเสนอ' in pg.inner_text('#palList'))
    pg.keyboard.press('Escape')
    code = pg.evaluate("packDoc()")
    vp = ctx.new_page(); vp.on('pageerror', lambda e: errors.append('view: '+str(e)))
    vp.goto(BASE + '/app/?view=1#d=' + code); vp.wait_for_function("typeof doc!=='undefined'&&doc&&els.length>0")
    n_before = vp.evaluate("indexList().length")
    check('view-only link opens read-only', vp.evaluate("READONLY&&document.body.classList.contains('readonly')"))
    vp.mouse.move(600,400); vp.mouse.down(); vp.mouse.move(700,450,steps=3); vp.mouse.up()
    check('view-only link does not save a copy', vp.evaluate("indexList().length") == n_before and not vp.evaluate("indexList().some(d=>d.id===doc.id)"))
    vp.close()
    pg.evaluate("view={x:-3000,y:-3000,z:1};renderView()")
    check('minimap shows when the diagram is off screen', pg.evaluate("getComputedStyle(document.querySelector('#minimap')).display") == 'block')

    check('no page errors', not errors)
    if errors: print('\n'.join(errors))
    b.close()

srv.shutdown()
print('\n%d failed' % len(failures) if failures else '\nall passed')
sys.exit(1 if failures else 0)
