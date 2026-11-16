#!/bin/sh
# Build canvy.mcpb (a zip: manifest.json + server/ + icon.png) for one-click install in Claude Desktop.
# Output goes to the site root so it can be downloaded from https://kimookpong.github.io/canvy/canvy.mcpb
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
mkdir -p "$tmp/server"
cp mcp/manifest.json "$tmp/manifest.json"
cp mcp/core.mjs mcp/server.mjs "$tmp/server/"
cp icon-512.png "$tmp/icon.png"
rm -f canvy.mcpb
(cd "$tmp" && zip -qr -X "$OLDPWD/canvy.mcpb" manifest.json icon.png server)
rm -rf "$tmp"
echo "built canvy.mcpb ($(wc -c < canvy.mcpb) bytes)"
