#!/usr/bin/env bash
# Fires N concurrent POST /wallets for a brand-new user. Expect exactly one
# distinct wallet id across all responses.
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
N="${2:-50}"
USER_ID="burst-user-$(date +%s%N)"
TOKEN="$USER_ID"  # bearer token == user id, per this service's simple auth

echo "Firing $N concurrent POST /wallets for user=$USER_ID against $BASE_URL"

tmpdir=$(mktemp -d)
seq "$N" | xargs -P "$N" -I{} curl -s -o "$tmpdir/{}.json" -X POST "$BASE_URL/wallets" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\"}"

distinct_ids=$(cat "$tmpdir"/*.json | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    const ids = new Set();
    data.split(/(?<=\})\s*(?=\{)/).forEach(chunk => {
      try { ids.add(JSON.parse(chunk).id); } catch (e) {}
    });
    console.log(ids.size);
  });
')

rm -rf "$tmpdir"

echo "Distinct wallet ids returned: $distinct_ids"
if [ "$distinct_ids" -eq 1 ]; then
  echo "PASS: race-free get-or-create"
else
  echo "FAIL: expected 1 distinct wallet, got $distinct_ids"
  exit 1
fi
