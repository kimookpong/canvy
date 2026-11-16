// Tests for the Canvy MCP server: stdio (as Claude Desktop/Code run it), the Worker's HTTP handler,
// and the .mcpb bundle's manifest. Run: node mcp/test.mjs
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) failed++; };

function stdioSession(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; const waiting = new Map();
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } } });
  let n = 0;
  return {
    req: (method, params) => new Promise(res => { const id = ++n; waiting.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }),
    note: (method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'),
    raw: (text, id) => new Promise(res => { waiting.set(id, res); p.stdin.write(text + '\n'); }),
    close: () => p.stdin.end()
  };
}

async function exercise(label, s) {
  const init = await s.req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  check(`${label}: initialize`, init.result?.serverInfo?.name === 'canvy' && init.result.protocolVersion === '2025-06-18' && init.result.capabilities.tools);
  s.note('notifications/initialized');
  const list = await s.req('tools/list', {});
  check(`${label}: tools/list`, list.result?.tools?.map(t => t.name).join() === 'create_diagram,get_canvy_syntax');
  const call = await s.req('tools/call', { name: 'create_diagram', arguments: { diagram: 'ลูกค้า -> สั่งซื้อ -> {มีของ?}, {มีของ?} -(มี)-> จัดส่ง', title: 'สั่งซื้อ', direction: 'TB', style: 'marker' } });
  const sc = call.result?.structuredContent;
  check(`${label}: create_diagram returns links`, sc?.edit_url?.startsWith('https://canvy.thasala.dev/app/#c=') && sc.view_url.includes('?view=1#c=') && sc.boxes === 4 && sc.arrows === 3, JSON.stringify(call));
  const back = new URLSearchParams(new URL(sc.edit_url).hash.slice(1));
  check(`${label}: link round-trips the diagram`, back.get('c') === 'ลูกค้า -> สั่งซื้อ -> {มีของ?}, {มีของ?} -(มี)-> จัดส่ง' && back.get('title') === 'สั่งซื้อ' && back.get('dir') === 'TB' && back.get('style') === 'marker');
  const empty = await s.req('tools/call', { name: 'create_diagram', arguments: { diagram: ' ' } });
  check(`${label}: empty diagram is a tool error`, empty.result?.isError === true);
  const syn = await s.req('tools/call', { name: 'get_canvy_syntax', arguments: {} });
  check(`${label}: syntax guide`, syn.result?.content?.[0]?.text.includes('-(label)->'));
  const unk = await s.req('tools/call', { name: 'nope', arguments: {} });
  check(`${label}: unknown tool`, unk.error?.code === -32602);
  const nm = await s.req('does/not/exist', {});
  check(`${label}: unknown method`, nm.error?.code === -32601);
  const ping = await s.req('ping', {});
  check(`${label}: ping`, ping.result && !ping.error);
}

// 1. stdio, straight from the repo
{ const s = stdioSession(process.execPath, [join(root, 'mcp/server.mjs')]); await exercise('stdio', s);
  const bad = await new Promise(res => { const p = spawn(process.execPath, [join(root, 'mcp/server.mjs')]); p.stdout.once('data', d => { res(JSON.parse(String(d).split('\n')[0])); p.kill(); }); p.stdin.write('{not json\n'); });
  check('stdio: bad JSON → parse error', bad.error?.code === -32700); s.close(); }

// 2. the Worker's fetch handler
{ const worker = (await import(join(root, 'worker/index.mjs'))).default; let n = 0;
  const post = async body => { const r = await worker.fetch(new Request('https://x.workers.dev/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) })); return r.status === 202 ? { status: 202 } : r.json(); };
  await exercise('worker', { req: (method, params) => post({ jsonrpc: '2.0', id: ++n, method, params }), note: () => {}, close() {} });
  const note = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  check('worker: notification → 202', note.status === 202);
  const get = await worker.fetch(new Request('https://x.workers.dev/mcp'));
  check('worker: GET /mcp → 405', get.status === 405);
  const pre = await worker.fetch(new Request('https://x.workers.dev/mcp', { method: 'OPTIONS' }));
  check('worker: CORS preflight', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*');
  const info = await (await worker.fetch(new Request('https://x.workers.dev/'))).json();
  check('worker: info page', info.mcp_endpoint === 'https://x.workers.dev/mcp');
  const batch = await post([{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 'b', method: 'tools/list' }]);
  check('worker: batch', Array.isArray(batch) && batch.length === 2);
  const own = await (await worker.fetch(new Request('https://canvy.thasala.dev/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'create_diagram', arguments: { diagram: 'a -> b' } } }) }))).json();
  check('worker: links use its own domain', own.result?.structuredContent?.edit_url.startsWith('https://canvy.thasala.dev/app/#c='), JSON.stringify(own)); }

// 2b. link previews on the Worker (with an in-memory stand-in for Workers KV)
{ const worker = (await import(join(root, 'worker/index.mjs'))).default;
  const store = new Map(), env = { PREVIEWS: {
    async put(k, v, o) { store.set(k, { v: v instanceof ArrayBuffer ? v : await new Response(v).arrayBuffer(), m: o?.metadata ?? null }); },
    async get(k, o) { const e = store.get(k); if (!e) return null; const t = typeof o === 'string' ? o : o?.type; return t === 'text' ? new TextDecoder().decode(e.v) : t === 'stream' ? new Response(e.v).body : e.v; },
    async getWithMetadata(k, o) { const e = store.get(k); if (!e) return { value: null, metadata: null }; const t = typeof o === 'string' ? o : o?.type;
      return { value: t === 'stream' ? new Response(e.v).body : e.v, metadata: e.m }; } } };
  // a real 1200x630 JPEG header is enough for the size check
  const jpeg = new Uint8Array(600); jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0]);
  const id = '0123456789abcdef', base = 'https://canvy.thasala.dev';
  const put = (q, body, h = {}) => worker.fetch(new Request(base + '/api/preview' + q, { method: 'PUT', body, headers: { 'Content-Type': 'image/jpeg', Origin: base, 'X-Canvy-Title': encodeURIComponent('ขั้นตอน <อนุมัติ>'), ...h } }), env);
  check('preview: upload accepted', (await put('?id=' + id, jpeg)).status === 204);
  check('preview: bad id refused', (await put('?id=../x', jpeg)).status === 400);
  check('preview: other site refused', (await put('?id=' + id, jpeg, { Origin: 'https://evil.example' })).status === 403);
  const small = new Uint8Array(600); small.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10]);
  check('preview: wrong size refused', (await put('?id=' + id, small)).status === 415);
  check('preview: not an image refused', (await put('?id=' + id, new Uint8Array(600))).status === 415);
  const page = await worker.fetch(new Request(base + '/s/' + id), env), html = await page.text();
  check('preview: share page has og:image of the diagram', page.status === 200 && html.includes(`<meta property="og:image" content="${base}/s/${id}.jpg">`) && html.includes('summary_large_image'));
  check('preview: share page title is escaped', html.includes('<meta property="og:title" content="ขั้นตอน &lt;อนุมัติ&gt;">'));
  check('preview: people are sent on to the editor', html.includes("location.replace('/app/'+location.search+(location.hash||(D?'#d='+D:'')))"));
  // stored diagrams for social posts
  const code = 'zq1YqUqpKzi_IBdGBOakFqboKVkpJ-fklqXmlRUWZjnqZuXlqOkopRZlJSZkKOjmpBSX5RZn5qcVKOjk51SB2SnpOJkZufmlRYgk', sid = await (async () => { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)); return [...new Uint8Array(h)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); })();
  const sh = (i, body, h = {}) => worker.fetch(new Request(base + '/api/share?id=' + i, { method: 'PUT', body, headers: { Origin: base, ...h } }), env);
  check('share: stores a diagram under its own hash', (await sh(sid, code)).status === 204);
  check('share: refuses a mismatched id', (await sh('0123456789abcdef', code)).status === 409);
  check('share: refuses odd characters', (await sh(sid, code + '<script>')).status === 400);
  check('share: other site refused', (await sh(sid, code, { Origin: 'https://evil.example' })).status === 403);
  const sp = await (await worker.fetch(new Request(base + '/s/' + sid), env)).text();
  check('share: page opens the stored diagram even without #', sp.includes('var D=' + JSON.stringify(code)));
  const firstPic = jpeg.slice(); const other = jpeg.slice(); other[599] = 7;
  await put('?id=' + id, other);
  check('preview: the first picture for an id is kept', new Uint8Array(await (await worker.fetch(new Request(base + '/s/' + id + '.jpg'), env)).arrayBuffer())[599] === firstPic[599]);
  const img = await worker.fetch(new Request(base + '/s/' + id + '.jpg'), env);
  check('preview: picture served', img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && (await img.arrayBuffer()).byteLength === 600);
  const missing = await worker.fetch(new Request(base + '/s/ffffffffffffffff.jpg'), env);
  check('preview: unknown picture falls back to the site image', missing.status === 302 && missing.headers.get('location').endsWith('/og-image.png'));
  const noKv = await worker.fetch(new Request(base + '/api/preview?id=' + id, { method: 'PUT', body: jpeg, headers: { Origin: base } }), {});
  check('preview: without storage the app falls back', noKv.status === 503); }

// 3. the .mcpb bundle: build, unzip, run the server the way the manifest says
{ execSync('sh mcp/build-mcpb.sh', { cwd: root, stdio: 'ignore' });
  check('mcpb: built', existsSync(join(root, 'canvy.mcpb')));
  const dir = mkdtempSync(join(tmpdir(), 'mcpb-')); execSync(`unzip -q "${join(root, 'canvy.mcpb')}" -d "${dir}"`);
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  check('mcpb: manifest has required fields', ['manifest_version', 'name', 'version', 'description', 'author', 'server'].every(k => m[k]) && existsSync(join(dir, m.server.entry_point)) && existsSync(join(dir, m.icon)));
  const args = m.server.mcp_config.args.map(a => a.replace('${__dirname}', dir));
  const s = stdioSession(process.execPath, args); await exercise('mcpb', s); s.close(); }

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
