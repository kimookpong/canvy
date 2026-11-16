# Canvy MCP server

Lets Claude (and other MCP clients) make editable hand-drawn Canvy diagrams in Thai and English.
It has two tools:

- `create_diagram`: takes a diagram in Canvy syntax or Mermaid, plus an optional title, direction (`LR`/`TB`) and style. Returns an edit link, a read-only link and an embed snippet.
- `get_canvy_syntax`: returns the syntax guide.

Nothing is stored anywhere. The diagram travels inside the link (`#c=…`), and opening the link builds it in the person's browser.

## Install

**Claude Desktop:** download [canvy.mcpb](https://canvy.thasala.dev/canvy.mcpb) and double-click it, or drag it into Claude Desktop, then click Install.

**Claude Code**

```sh
claude mcp add canvy -- npx -y github:kimookpong/canvy
```

**claude.ai, Claude Desktop and mobile (remote connector):** in Settings → Connectors → Add custom connector, paste `https://canvy.thasala.dev/mcp` (available once the Cloudflare Worker is deployed).

**Any stdio MCP client**

```json
{ "mcpServers": { "canvy": { "command": "npx", "args": ["-y", "github:kimookpong/canvy"] } } }
```

## Files

| File | What it is |
| --- | --- |
| `core.mjs` | Tools and JSON-RPC handling, shared by both servers. No dependencies |
| `server.mjs` | stdio server (Claude Desktop, Claude Code) |
| `../worker/index.mjs` | Cloudflare Worker: Streamable HTTP at `/mcp`, stateless, no auth. Also serves the site |
| `manifest.json`, `build-mcpb.sh` | `.mcpb` bundle for one-click install (`npm run build:mcpb`) |
| `test.mjs` | Tests stdio, the Worker handler and the built bundle (`npm run test:mcp`) |

## Deploy the Worker (canvy.thasala.dev)

`wrangler.jsonc` at the repo root deploys one Worker. It serves the static site from the repo (minus the paths in `.assetsignore`) and the MCP endpoint at `/mcp`, on the custom domain `canvy.thasala.dev`. The `thasala.dev` zone must be in the same Cloudflare account.

Pick one way to deploy:

- **GitHub Actions** (`.github/workflows/deploy-worker.yml`): add the repository secrets `CLOUDFLARE_API_TOKEN` (token template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`. Every push to `main` then tests and deploys.
- **Cloudflare dashboard**: Workers & Pages → Create → Import a repository → `kimookpong/canvy`, deploy command `npx wrangler deploy`.
- **By hand**: `npx wrangler login && npx wrangler deploy`.

## Without MCP

AIs that only write text can use the same links directly: see [`/llms.txt`](https://canvy.thasala.dev/llms.txt) and the Claude skill in [`skills/canvy-diagrams`](../skills/canvy-diagrams/SKILL.md).
