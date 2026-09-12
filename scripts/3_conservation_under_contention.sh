#!/usr/bin/env bash
# Seeds a handful of wallets, then fires many concurrent transfers among them
# (including A->B and B->A simultaneously, and some that would overdraw).
# Verifies: total balance unchanged, no wallet negative.
#
# Requires DATABASE_URL to be set so this script can seed initial balances
# directly (there is no public faucet endpoint by design).
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
NUM_TRANSFERS="${2:-300}"
: "${DATABASE_URL:?Set DATABASE_URL so this script can seed balances, e.g. postgres://wallet:wallet@localhost:5432/wallet}"

TS=$(date +%s%N)
USERS=(a b c d)
declare -A WALLET_ID

echo "Creating wallets..."
for u in "${USERS[@]}"; do
  uid="contention-$u-$TS"
  id=$(curl -s -X POST "$BASE_URL/wallets" -H "Authorization: Bearer $uid" -H "Content-Type: application/json" -d "{\"user_id\":\"$uid\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
  WALLET_ID[$u]=$id
  echo "  $u -> $id"
done

echo "Seeding balances (10000 paise each) directly via SQL..."
for u in "${USERS[@]}"; do
  psql "$DATABASE_URL" -v wallet_id="'${WALLET_ID[$u]}'" -v amount=10000 -f "$(dirname "$0")/seed.sql" > /dev/null
done

TOTAL_BEFORE=$((10000 * ${#USERS[@]}))
echo "Total balance before: $TOTAL_BEFORE"

echo "Firing $NUM_TRANSFERS concurrent transfers among wallets (random pairs, some amounts large enough to overdraw)..."
tmpdir=$(mktemp -d)
for i in $(seq 1 "$NUM_TRANSFERS"); do
  from_u=${USERS[$((RANDOM % 4))]}
  to_u=${USERS[$((RANDOM % 4))]}
  if [ "$from_u" == "$to_u" ]; then continue; fi
  amount=$((RANDOM % 3000 + 1))
  body="{\"from\":\"${WALLET_ID[$from_u]}\",\"to\":\"${WALLET_ID[$to_u]}\",\"amount_paise\":$amount,\"idempotency_key\":\"contention-$TS-$i\"}"
  {
    curl -s -o "$tmpdir/$i.json" -X POST "$BASE_URL/transfers" \
      -H "Authorization: Bearer contention-$from_u-$TS" -H "Content-Type: application/json" -d "$body"
  } &
done
wait

echo "Checking final balances..."
TOTAL_AFTER=0
NEGATIVE_FOUND=0
for u in "${USERS[@]}"; do
  bal=$(curl -s "$BASE_URL/wallets/${WALLET_ID[$u]}" -H "Authorization: Bearer contention-$u-$TS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).balance')
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
