#!/usr/bin/env bash
# One-shot setup for transaction-agent. Run from the project root.
#
# Does everything:
#   1. Verifies Node.js is installed
#   2. Installs npm dependencies
#   3. Builds the MCP server
#   4. Registers with Claude Desktop (merges into your config cleanly)
#
# Safe to re-run. Idempotent.

set -euo pipefail

cd "$(dirname "$0")"

echo "transaction-agent setup"
echo "======================="
echo ""

# ---- 1. Check Node.js ----
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed."
  echo "  Install the LTS version from https://nodejs.org, then re-run ./setup.sh"
  exit 1
fi

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*$/\1/')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "✗ Node.js $NODE_MAJOR is too old (need 18+)."
  echo "  Upgrade from https://nodejs.org, then re-run ./setup.sh"
  exit 1
fi

echo "✓ Node.js $(node -v)"
echo ""

# ---- 2. Install npm dependencies ----
echo "→ Installing dependencies (npm install)…"
npm install --silent
echo "✓ Dependencies installed."
echo ""

# ---- 3. Build ----
echo "→ Building (npm run build)…"
npm run build --silent
echo "✓ Build complete."
echo ""

# ---- 4. Register with Claude Desktop ----
echo "→ Registering with Claude Desktop…"
./scripts/install-config.sh
echo ""

cat <<'EOF'
============================================================
✓ Setup complete.

Next steps:
  1. Restart Claude Desktop (or Claude CLI).
  2. In a Claude chat, type:
         /create-transaction <describe your deal>

  Your first draft will open a browser window to sign in to
  Real — your password manager should auto-fill. After that
  you're signed in for the day.
============================================================
EOF
