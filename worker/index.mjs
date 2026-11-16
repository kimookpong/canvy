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

export default {
  async fetch(request) {
    const url = new URL(request.url);
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
