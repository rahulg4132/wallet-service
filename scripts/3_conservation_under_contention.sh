#!/usr/bin/env bash
# Seeds a handful of wallets, then fires many concurrent transfers among them
# (including A->B and B->A simultaneously, and some that would overdraw).
# Verifies: total balance unchanged, no wallet negative.
#
if [ -z "${BASH_VERSION:-}" ]; then
  echo "Run this script with bash, not sh: bash $0 [base_url] [transfer_count]" >&2
  exit 2
fi
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
NUM_TRANSFERS="${2:-300}"

TS=$(date +%s%N)
USERS=(a b c d)
WALLET_IDS=()

echo "Creating wallets..."
for i in "${!USERS[@]}"; do
  u=${USERS[$i]}
  uid="contention-$u-$TS"
  id=$(curl -s -X POST "$BASE_URL/wallets" -H "Authorization: Bearer $uid" -H "Content-Type: application/json" -d "{\"user_id\":\"$uid\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
  WALLET_IDS[$i]=$id
  echo "  $u -> $id"
done

echo "Crediting balances (10000 paise each) via API..."
for i in "${!USERS[@]}"; do
  u=${USERS[$i]}
  curl -s -f -X POST "$BASE_URL/wallets/${WALLET_IDS[$i]}/credit" \
    -H "Authorization: Bearer contention-$u-$TS" \
    -H "Content-Type: application/json" \
    -d '{"amount_paise":10000}' > /dev/null
done

TOTAL_BEFORE=$((10000 * ${#USERS[@]}))
echo "Total balance before: $TOTAL_BEFORE"

echo "Firing $NUM_TRANSFERS concurrent transfers among wallets (random pairs, some amounts large enough to overdraw)..."
tmpdir=$(mktemp -d)
for i in $(seq 1 "$NUM_TRANSFERS"); do
  from_index=$((RANDOM % ${#USERS[@]}))
  to_index=$((RANDOM % ${#USERS[@]}))
  from_u=${USERS[$from_index]}
  to_u=${USERS[$to_index]}
  if [ "$from_u" == "$to_u" ]; then continue; fi
  amount=$((RANDOM % 3000 + 1))
  body="{\"from\":\"${WALLET_IDS[$from_index]}\",\"to\":\"${WALLET_IDS[$to_index]}\",\"amount_paise\":$amount,\"idempotency_key\":\"contention-$TS-$i\"}"
  {
    curl -s -o "$tmpdir/$i.json" -X POST "$BASE_URL/transfers" \
      -H "Authorization: Bearer contention-$from_u-$TS" -H "Content-Type: application/json" -d "$body"
  } &
done
wait

echo "Checking final balances..."
TOTAL_AFTER=0
NEGATIVE_FOUND=0
for i in "${!USERS[@]}"; do
  u=${USERS[$i]}
  bal=$(curl -s "$BASE_URL/wallets/${WALLET_IDS[$i]}" -H "Authorization: Bearer contention-$u-$TS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).balance')
  echo "  $u balance: $bal"
  TOTAL_AFTER=$((TOTAL_AFTER + bal))
  if [ "$bal" -lt 0 ]; then NEGATIVE_FOUND=1; fi
done

rm -rf "$tmpdir"

echo "Total before: $TOTAL_BEFORE, Total after: $TOTAL_AFTER"
if [ "$TOTAL_BEFORE" -eq "$TOTAL_AFTER" ] && [ "$NEGATIVE_FOUND" -eq 0 ]; then
  echo "PASS: conservation held, no negative balances"
else
  echo "FAIL: conservation broken or negative balance found"
  exit 1
fi
