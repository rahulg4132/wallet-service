#!/usr/bin/env bash
# Fires the same transfer (same idempotency_key) K times concurrently.
# Expect exactly one debit/credit and identical transfer ids in the responses.
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
K="${2:-30}"

TS=$(date +%s%N)
USER_A="idem-a-$TS"
USER_B="idem-b-$TS"
IDEM_KEY="idem-key-$TS"
AMOUNT=1000

echo "Setting up wallets for A=$USER_A, B=$USER_B"
WALLET_A=$(curl -s -X POST "$BASE_URL/wallets" -H "Authorization: Bearer $USER_A" -H "Content-Type: application/json" -d "{\"user_id\":\"$USER_A\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
WALLET_B=$(curl -s -X POST "$BASE_URL/wallets" -H "Authorization: Bearer $USER_B" -H "Content-Type: application/json" -d "{\"user_id\":\"$USER_B\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

echo "Crediting wallet A with $AMOUNT paise"
curl -s -f -X POST "$BASE_URL/wallets/$WALLET_A/credit" \
  -H "Authorization: Bearer $USER_A" \
  -H "Content-Type: application/json" \
  -d "{\"amount_paise\":$AMOUNT}" > /dev/null

BODY="{\"from\":\"$WALLET_A\",\"to\":\"$WALLET_B\",\"amount_paise\":$AMOUNT,\"idempotency_key\":\"$IDEM_KEY\"}"

echo "Firing $K concurrent identical transfer requests"
tmpdir=$(mktemp -d)
seq "$K" | xargs -P "$K" -I{} curl -s -o "$tmpdir/{}.json" -X POST "$BASE_URL/transfers" \
  -H "Authorization: Bearer $USER_A" -H "Content-Type: application/json" -d "$BODY"

distinct_ids=$(cat "$tmpdir"/*.json | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    const ids = new Set();
    data.split(/(?<=\})\s*(?=\{)/).forEach(chunk => {
      try { const o = JSON.parse(chunk); ids.add(o.id || (o.error||"")); } catch (e) {}
    });
    console.log([...ids].join(","));
  });
')

rm -rf "$tmpdir"
echo "Distinct outcomes seen across $K requests: $distinct_ids"

BALANCE_B=$(curl -s "$BASE_URL/wallets/$WALLET_B" -H "Authorization: Bearer $USER_B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).balance')
echo "Wallet B balance after storm: $BALANCE_B (expect exactly $AMOUNT)"
