#!/usr/bin/env bash
# Public deploy helper — Render API + Vercel SPA (Railway retired).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec bash "$ROOT/scripts/deploy-render.sh"
