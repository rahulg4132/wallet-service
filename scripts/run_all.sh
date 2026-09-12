#!/usr/bin/env bash
set -euo pipefail
DIR="$(dirname "$0")"
BASE_URL="${1:-http://localhost:3000}"

echo "=== 1/3: concurrent get-or-create ==="
bash "$DIR/1_concurrent_get_or_create.sh" "$BASE_URL"
echo
echo "=== 2/3: idempotent retry storm ==="
bash "$DIR/2_idempotent_retry_storm.sh" "$BASE_URL"
echo
echo "=== 3/3: conservation under contention ==="
bash "$DIR/3_conservation_under_contention.sh" "$BASE_URL"
