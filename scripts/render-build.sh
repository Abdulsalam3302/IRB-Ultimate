#!/usr/bin/env bash
# Render build. Render's Node images ship a read-only global prefix
# (/usr/lib/node_modules), so `npm install -g pnpm` and `corepack enable` fail
# with EROFS. Run the exact pnpm pinned in package.json through npx instead;
# npx caches it under the writable user cache.
set -euo pipefail
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"
run_pnpm() { npx --yes "pnpm@${PNPM_VERSION}" "$@"; }
echo "[render-build] node $(node -v), pnpm ${PNPM_VERSION}"
run_pnpm install --frozen-lockfile
run_pnpm exec playwright install chromium
run_pnpm run build
