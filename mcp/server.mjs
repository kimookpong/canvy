#!/usr/bin/env node
// Canvy MCP server over stdio, for Claude Desktop (as a .mcpb bundle) and Claude Code / other local MCP clients.
// Run:  npx -y github:kimookpong/canvy     or     node mcp/server.mjs
// No dependencies, no network, nothing stored: tools return Canvy links that build the diagram when opened.
import { handleMessage } from './core.mjs';
import { createInterface } from 'node:readline';

const send = m => process.stdout.write(JSON.stringify(m) + '\n');
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', line => {
  line = line.trim(); if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
  try {
    if (Array.isArray(msg)) { const out = msg.map(handleMessage).filter(Boolean); if (out.length) send(out); }
    else { const out = handleMessage(msg); if (out) send(out); }
  } catch (e) {
    process.stderr.write('canvy-mcp: ' + (e && e.stack || e) + '\n');
    if (msg && 'id' in msg) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Internal error' } });
  }
});
rl.on('close', () => process.exit(0));
process.stderr.write('canvy-mcp ready (stdio)\n');
