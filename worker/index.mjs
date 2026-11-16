// Canvy MCP server as a Cloudflare Worker (Streamable HTTP, stateless, no auth, nothing stored).
// Endpoint: POST /mcp with JSON-RPC. Add the URL as a custom connector in Claude (Settings → Connectors).
import { handleMessage, SERVER_INFO, TOOLS, APP_URL } from '../mcp/core.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const MAX_BODY = 64 * 1024;

// ---------- link previews: /s/<id> shows crawlers a picture of the diagram, people go on to the editor ----------
const ID_RE = /^[a-f0-9]{16}$/;
const MAX_IMG = 1.5 * 1024 * 1024, MAX_CODE = 200 * 1024, TTL = 60 * 60 * 24 * 400;
const CODE_RE = /^[A-Za-z0-9_-]+$/;
async function codeId(code) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)); return [...new Uint8Array(h)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); }
// Posting to social apps: those apps may drop the #… part of a link, so the diagram itself is stored under its own hash.
async function putShare(request, env, url) {
  if (!env.PREVIEWS) return new Response('Sharing is not set up', { status: 503 });
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  const id = url.searchParams.get('id') || '';
  const code = (await request.text()).trim();
  if (!ID_RE.test(id) || !code || code.length > MAX_CODE || !CODE_RE.test(code)) return new Response('Bad request', { status: 400 });
  if (await codeId(code) !== id) return new Response('id does not match the diagram', { status: 409 });
  await env.PREVIEWS.put('d:' + id, code, { expirationTtl: TTL });
  return new Response(null, { status: 204 });
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function imageInfo(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) { const v = new DataView(buf); return { type: 'image/png', w: v.getUint32(16), h: v.getUint32(20) }; }
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: walk to the SOF marker for the size
    let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'image/jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len; }
  }
  return null;
}
async function putPreview(request, env, url) {
  if (!env.PREVIEWS) return new Response('Previews are not set up', { status: 503 });
  const id = url.searchParams.get('id') || '';
  if (!ID_RE.test(id)) return new Response('Bad id', { status: 400 });
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  const len = +request.headers.get('Content-Length') || 0;
  if (len > MAX_IMG) return new Response('Too large', { status: 413 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_IMG || buf.byteLength < 100) return new Response('Bad size', { status: 413 });
  const info = imageInfo(buf);
  if (!info || info.w !== 1200 || info.h !== 630) return new Response('Expected a 1200x630 PNG or JPEG', { status: 415 });
  let title = ''; try { title = decodeURIComponent(request.headers.get('X-Canvy-Title') || '').slice(0, 120); } catch { }
  const had = await env.PREVIEWS.get('pv:' + id, { type: 'stream' });
  if (had) { if (had.cancel) had.cancel(); return new Response(null, { status: 204 }); }
  await env.PREVIEWS.put('pv:' + id, buf, { metadata: { t: title, ct: info.type }, expirationTtl: TTL });
  return new Response(null, { status: 204 });
}
async function getPreviewImage(env, id) {
  const r = env.PREVIEWS && ID_RE.test(id) ? await env.PREVIEWS.getWithMetadata('pv:' + id, { type: 'arrayBuffer', cacheTtl: 86400 }) : null;
  if (!r || !r.value) return Response.redirect(new URL('/og-image.png', 'https://canvy.thasala.dev').href, 302);
  return new Response(r.value, { headers: { 'Content-Type': (r.metadata && r.metadata.ct) || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
async function sharePage(env, url, id) {
  let title = '', code = '';
  if (env.PREVIEWS && ID_RE.test(id)) {
    const r = await env.PREVIEWS.getWithMetadata('pv:' + id, { type: 'stream', cacheTtl: 86400 }); if (r.value && r.value.cancel) r.value.cancel(); title = (r.metadata && r.metadata.t) || '';
    const c = await env.PREVIEWS.get('d:' + id, { type: 'text', cacheTtl: 86400 }); if (c && CODE_RE.test(c)) code = c;
  }
  const name = title || 'Canvy diagram', img = url.origin + '/s/' + id + '.jpg', desc = 'แผนภาพที่วาดด้วย Canvy เปิดลิงก์เพื่อดูและแก้ไขสำเนาของคุณ · A hand-drawn diagram made with Canvy. Open the link to view and edit your own copy.';
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} · Canvy</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="Canvy"><meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url.origin + '/s/' + id)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(name)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(name)}"><meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/favicon.svg"><script>var D=${JSON.stringify(code)};location.replace('/app/'+location.search+(location.hash||(D?'#d='+D:'')))</script>
</head><body style="font-family:system-ui;padding:40px"><p><a href="/app/">Open in Canvy</a></p></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/api/share') {
      if (request.method === 'PUT') return putShare(request, env, url);
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'PUT' } });
    }
    if (url.pathname === '/api/preview') {
      if (request.method === 'PUT') return putPreview(request, env, url);
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'PUT' } });
    }
    const sm = url.pathname.match(/^\/s\/([a-f0-9]{16})(\.jpg|\.png)?$/);
    if (sm && (request.method === 'GET' || request.method === 'HEAD')) return sm[2] ? getPreviewImage(env, sm[1]) : sharePage(env, url, sm[1]);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
      // Stateless server: no server-to-client stream, no sessions to end.
      if (request.method === 'GET' || request.method === 'DELETE') return json({ name: SERVER_INFO.title, version: SERVER_INFO.version, transport: 'streamable-http (stateless): send JSON-RPC with POST', tools: TOOLS.map(t => t.name), how_to_connect: 'In Claude: Settings → Connectors → Add custom connector, and paste ' + url.origin + '/mcp' }, 405);
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', ...CORS } });
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, 413);
      let msg;
      try { msg = JSON.parse(text); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
      const app = /\.workers\.dev$|^localhost$|^127\./.test(url.hostname) ? APP_URL : url.origin + '/app/';
      if (Array.isArray(msg)) {
        const out = msg.map(m => handleMessage(m, app)).filter(Boolean);
        return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
      }
      const out = handleMessage(msg, app);
      return out ? json(out) : new Response(null, { status: 202, headers: CORS });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return json({
        name: SERVER_INFO.title, version: SERVER_INFO.version,
        mcp_endpoint: url.origin + '/mcp', transport: 'streamable-http (stateless)',
        tools: TOOLS.map(t => t.name), editor: APP_URL,
        how_to_connect: 'In Claude: Settings → Connectors → Add custom connector, and paste the mcp_endpoint URL.'
      });
    }
    return new Response('Not found', { status: 404, headers: CORS });
  }
};
