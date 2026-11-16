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
  check(`${label}: create_diagram returns links`, sc?.edit_url?.startsWith('https://kimookpong.github.io/canvy/app/#c=') && sc.view_url.includes('?view=1#c=') && sc.boxes === 4 && sc.arrows === 3, JSON.stringify(call));
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
