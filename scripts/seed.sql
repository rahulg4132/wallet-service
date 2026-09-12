-- Test-only helper: credit a wallet directly for burst-testing purposes.
-- Usage: psql "$DATABASE_URL" -v wallet_id="'<id>'" -v amount=100000 -f seed.sql
UPDATE wallets SET balance = balance + :amount WHERE id = :wallet_id;
