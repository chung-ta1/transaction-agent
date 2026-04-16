#!/usr/bin/env bash
# Wires transaction-agent into Claude Desktop's config file. Creates the file
# if it doesn't exist, merges cleanly if it does. Idempotent — safe to re-run.
#
# Usage: ./scripts/install-config.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_PATH="$PROJECT_ROOT/dist/index.js"

if [[ ! -f "$BIN_PATH" ]]; then
  echo "✗ Build output not found at $BIN_PATH"
  echo "  Run 'npm install && npm run build' first, then re-run this script."
  exit 1
fi

case "$(uname)" in
  Darwin)
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    ;;
  Linux)
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
    CONFIG_DIR="$HOME/.config/Claude"
    ;;
  *)
    echo "✗ Unsupported OS: $(uname). Open claude-desktop-config.example.json and copy the block into your Claude config file manually."
    exit 1
    ;;
esac

mkdir -p "$CONFIG_DIR"

# Seed with {} if missing or empty.
if [[ ! -s "$CONFIG_PATH" ]]; then
  echo "{}" > "$CONFIG_PATH"
fi

# Merge the mcpServers.transaction-builder entry in place using node.
node -e '
const fs = require("fs");
const path = process.argv[1];
const bin = process.argv[2];
const raw = fs.readFileSync(path, "utf8").trim() || "{}";
let cfg;
try { cfg = JSON.parse(raw); }
catch (e) {
  console.error("✗ Existing config is not valid JSON: " + path);
  process.exit(1);
}
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers["transaction-builder"] = {
  command: "node",
  args: [bin],
};
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
' "$CONFIG_PATH" "$BIN_PATH"

echo "✓ Registered transaction-agent in Claude Desktop."
echo "  Config file : $CONFIG_PATH"
echo "  Binary path : $BIN_PATH"
echo ""
echo "→ Restart Claude Desktop to pick up the change."
