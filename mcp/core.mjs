// Canvy MCP core: shared by the local stdio server (mcp/server.mjs) and the Cloudflare Worker (worker/index.mjs).
// No dependencies. A diagram is plain text inside a Canvy command link, so nothing is stored anywhere:
// the tools only write links, and the person's browser builds the diagram when the link is opened.

export const APP_URL = 'https://kimookpong.github.io/canvy/app/';
export const SERVER_INFO = { name: 'canvy', title: 'Canvy diagrams', version: '1.0.0' };
export const PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const STYLES = ['pencil', 'chalk', 'marker', 'blueprint', 'ink', 'neon'];
const MAX_DIAGRAM = 8000;

export const INSTRUCTIONS = `Canvy turns a short text description into an editable hand-drawn diagram (Thai and English).
Call create_diagram with the diagram written in Canvy syntax or Mermaid flowchart syntax, then give the person the edit link.
Call get_canvy_syntax first if you are unsure of the syntax.`;

export const SYNTAX = `# Canvy syntax

a -> b -> c                 boxes joined by arrows
a -(label)-> b              label on an arrow (or: a -> b: label)
a -- b   a <-> b   a ..> b  plain line, two-way arrow, dashed arrow
db:Orders  queue:Jobs  user:Customer  note:Text  cloud:CDN  doc:Report
io:Input  hex:Step  start:Begin  end:Done  decision:OK?  card:Title
                            shape by prefix
[(Orders)] (Round) {Decision?} {{Hex}} [/Input/] ([Pill])
                            shape by brackets
## Heading                  section title above the shapes that follow
, or ; or a new line        start another chain
| a | b |  (rows)           a table

The same label is the same box, so write branches as separate chains that repeat it:
  start:Order -> Check stock -> {In stock?}
  {In stock?} -(yes)-> Ship -> end:Done
  {In stock?} -(no)-> Tell customer

Mermaid also works:
  flowchart TB
    A[Lamp doesn't work] --> B{Plugged in?}
    B -- No --> C[Plug in lamp]

Tips: labels of 1-4 words; {…?} for decisions with both ways labelled; db: for stores,
user: for people; direction TB for org charts, approvals and long processes; 3-25 boxes read well.
Thai labels work as they are: ลูกค้า -> สั่งซื้อ -> {มีของ?}`;

export const TOOLS = [
  {
    name: 'create_diagram',
    title: 'Create a Canvy diagram',
    description: 'Make an editable hand-drawn diagram (flowchart, process, architecture, org chart, decision tree) from Canvy syntax or Mermaid flowchart syntax, in Thai or English. Returns a link that opens the diagram in the Canvy editor, where the person can edit, restyle, present and export it; plus a read-only link and an embed snippet. Example diagram: "user:Customer -> Web App -> API -(SQL)-> db:Orders". Nothing is uploaded or stored: the diagram travels inside the link.',
    inputSchema: {
      type: 'object',
      properties: {
        diagram: { type: 'string', description: 'The diagram in Canvy syntax (see get_canvy_syntax) or Mermaid flowchart/graph syntax. Chains separated by commas, semicolons or new lines.' },
        title: { type: 'string', description: 'Diagram name shown in the editor.' },
        direction: { type: 'string', enum: ['LR', 'TB'], description: 'LR = left to right (default). TB = top to bottom: better for org charts, approvals and long processes.' },
        style: { type: 'string', enum: STYLES, description: 'Look of the drawing. Default pencil.' }
      },
      required: ['diagram'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        edit_url: { type: 'string' }, view_url: { type: 'string' }, embed_html: { type: 'string' },
        boxes: { type: 'integer' }, arrows: { type: 'integer' }, warnings: { type: 'array', items: { type: 'string' } }
      },
      required: ['edit_url', 'view_url', 'embed_html']
    },
    annotations: { title: 'Create a Canvy diagram', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'get_canvy_syntax',
    title: 'Canvy syntax guide',
    description: 'Return the Canvy diagram syntax with examples and tips. Read it before writing a diagram for create_diagram if you are unsure.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Canvy syntax guide', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
];

// Rough count of boxes and arrows, and gentle warnings, so the model can fix obvious slips before sharing.
export function inspect(diagram) {
  const text = diagram.trim(), warnings = [];
  const mermaid = /^\s*(flowchart|graph)\b/i.test(text);
  const chains = mermaid ? text.split(/\n|;/).slice(1) : text.split(/\n|;|,/);
  const ARROW = mermaid ? /\s*(?:--\s[^-]*?-->|-->|---|-\.->|==>)\s*/ : /\s*(?:<->|\.\.>|-\([^)]*\)->|->|--)\s*/;
  const nodes = new Set(); let arrows = 0;
  for (const raw of chains) {
    const line = raw.trim(); if (!line || line.startsWith('##') || line.startsWith('|')) continue;
    const bits = line.split(ARROW).map(s => s.trim()).filter(Boolean);
    if (!mermaid && bits.length > 1) bits[bits.length - 1] = bits[bits.length - 1].replace(/:\s+.*$/, ''); // "b: label" labels the arrow
    arrows += Math.max(0, bits.length - 1);
    for (const b of bits) nodes.add(mermaid ? b.replace(/^(\w+).*$/, '$1') : b);
  }
  if (!arrows && nodes.size > 1) warnings.push('No arrows found. Join boxes with -> (for example "a -> b").');
  if (nodes.size > 40) warnings.push(`About ${nodes.size} boxes: consider splitting with "## Heading" sections or into two diagrams.`);
  if ([...nodes].some(n => n.length > 60)) warnings.push('Some labels are long; 1-4 words per box reads best.');
  return { boxes: nodes.size, arrows, warnings };
}

export function commandLinks({ diagram, title, direction, style }, appUrl = APP_URL) {
  const p = ['c=' + encodeURIComponent(diagram.trim())];
  if (title) p.push('title=' + encodeURIComponent(String(title).trim().slice(0, 120)));
  if (direction === 'LR' || direction === 'TB') p.push('dir=' + direction);
  if (STYLES.includes(style)) p.push('style=' + style);
  const hash = '#' + p.join('&');
  const view = appUrl + '?view=1' + hash, embed = appUrl + '?embed=1' + hash;
  const safeTitle = String(title || 'Canvy diagram').replace(/[<>"&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
  return {
    edit_url: appUrl + hash,
    view_url: view,
    embed_html: `<iframe src="${embed.replace(/"/g, '%22')}" width="800" height="500" style="border:0;border-radius:12px" title="${safeTitle}" loading="lazy"></iframe>`
  };
}

function toolError(text) { return { content: [{ type: 'text', text }], isError: true }; }

export function callTool(name, args = {}, appUrl = APP_URL) {
  if (name === 'get_canvy_syntax') return { content: [{ type: 'text', text: SYNTAX }] };
  if (name !== 'create_diagram') return null;
  const diagram = typeof args.diagram === 'string' ? args.diagram : '';
  if (!diagram.trim()) return toolError('diagram is empty. Write it in Canvy syntax, for example "user:Customer -> Web App -> db:Orders". Call get_canvy_syntax for the full guide.');
  if (diagram.length > MAX_DIAGRAM) return toolError(`diagram is ${diagram.length} characters; keep it under ${MAX_DIAGRAM} so the link stays usable. Split it into two diagrams.`);
  if (args.direction && !['LR', 'TB'].includes(args.direction)) return toolError('direction must be "LR" or "TB".');
  if (args.style && !STYLES.includes(args.style)) return toolError('style must be one of: ' + STYLES.join(', ') + '.');
  const links = commandLinks(args, appUrl), info = inspect(diagram);
  const out = { ...links, ...info };
  const lines = [
    `Open and edit: ${links.edit_url}`,
    `Read-only: ${links.view_url}`,
    `About ${info.boxes} boxes and ${info.arrows} arrows.`,
    ...info.warnings.map(w => 'Note: ' + w),
    'Give the person the edit link. Opening it builds the diagram in their browser and saves it there; nothing is uploaded.'
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }], structuredContent: out };
}

const err = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });

// One JSON-RPC message in, one response out (null for notifications).
export function handleMessage(msg, appUrl = APP_URL) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && 'id' in msg && !('method' in msg) ? null : err(msg?.id, -32600, 'Invalid request');
  }
  const { id, method, params = {} } = msg;
  const isNotification = !('id' in msg);
  if (isNotification) return null;
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const r = callTool(params.name, params.arguments || {}, appUrl);
      return r ? ok(id, r) : err(id, -32602, `Unknown tool: ${params.name}`);
    }
    case 'resources/list': return ok(id, { resources: [] });
    case 'prompts/list': return ok(id, { prompts: [] });
    default: return err(id, -32601, `Method not found: ${method}`);
  }
}
