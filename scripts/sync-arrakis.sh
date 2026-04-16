#!/usr/bin/env bash
# Regenerate OpenAPI clients from arrakis/keymaker/yenta stage specs and show
# the diff. Run this when you want to refresh the typed clients — nothing
# automatic, no nightly cron.
#
# Usage:
#   ./scripts/sync-arrakis.sh           # regen + show diff summary
#   ./scripts/sync-arrakis.sh --commit  # regen, then stage the changes for commit

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Regenerating OpenAPI clients (arrakis, keymaker, yenta) from stage…"
npm run generate --silent

if git diff --quiet src/openapi; then
  echo "✓ No drift. Generated clients match what's committed."
  exit 0
fi

echo ""
echo "⚠ Drift detected in src/openapi/:"
echo ""
git diff --stat src/openapi

if [[ "${1-}" == "--commit" ]]; then
  echo ""
  echo "→ Staging changes (not committing — review with 'git diff --staged' then commit yourself)…"
  git add src/openapi
  echo "✓ Staged. Run 'git commit' when you're ready."
else
  echo ""
  echo "→ Review the diff above, then run:"
  echo "     ./scripts/sync-arrakis.sh --commit   # stage the changes"
  echo "  or  git checkout src/openapi            # discard"
fi
