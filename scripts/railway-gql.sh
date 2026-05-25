#!/usr/bin/env bash
set -euo pipefail

railway_cookies() {
  python3 -c "import browser_cookie3; cj=browser_cookie3.chrome(); print('; '.join(f'{c.name}={c.value}' for c in cj if 'railway.com' in c.domain or 'railway.app' in c.domain))"
}

railway_gql() {
  local query="$1"
  local vars="${2:-{}}"
  curl -sS -X POST 'https://backboard.railway.com/graphql/v2' \
    -H 'Content-Type: application/json' \
    -H "Cookie: $(railway_cookies)" \
    -d "{\"query\":$(python3 -c "import json; print(json.dumps('$query'))"),\"variables\":$vars}"
}
