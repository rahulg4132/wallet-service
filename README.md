# Wallet Service

An Express and PostgreSQL wallet service with wallet creation, wallet crediting, transfers, idempotency protection, request logging, and Prometheus metrics.

## Requirements

- Node.js 20+
- PostgreSQL 16+
- Docker and Docker Compose (optional)

## Configuration

Set these environment variables:

```env
DATABASE_URL=postgres://wallet:wallet@localhost:5432/wallet
PGSSL=false
PORT=3000
```

The service runs database migrations during startup. In Docker Compose, PostgreSQL is available at `db` and the connection is configured automatically.

## Run Locally

```bash
npm install
npm run build
npm start
```

For development:

```bash
npm run dev
```

## Run With Docker

```bash
docker compose up --build
```

The API is available at `http://localhost:3000`.

## Authentication

Wallet, transfer, and metrics endpoints require a bearer token. The current simple authentication middleware accepts any non-empty bearer token and treats it as the user ID.

```http
Authorization: Bearer user-123
```

Every response includes an `x-correlation-id` header. Send your own value with the request, or the service generates one:

```http
x-correlation-id: request-123
```

## API

### Health Check

`GET /health`

No authentication required.

```bash
curl http://localhost:3000/health
```

Response:

```json
{
	"success": true,
	"message": "Database is connected",
	"data": {
		"currentTime": "2026-09-13T12:00:00.000Z"
	}
}
```

### Create or Get Wallet

`POST /wallets`

Headers:

```http
Authorization: Bearer user-123
Content-Type: application/json
```

Request:

```json
{
	"user_id": "user-123"
}
```

Example:

```bash
curl -X POST http://localhost:3000/wallets \
	-H "Authorization: Bearer user-123" \
	-H "Content-Type: application/json" \
	-d '{"user_id":"user-123"}'
```

Response:

```json
{
	"id": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"user_id": "user-123",
	"balance": "0",
	"created_at": "2026-09-13T12:00:00.000Z"
}
```

Calling this endpoint again for the same `user_id` returns the existing wallet.

### Get Wallet

`GET /wallets/:id`

```bash
curl http://localhost:3000/wallets/17b61922-32a1-4ece-b2bd-c9d69b7b0150 \
	-H "Authorization: Bearer user-123"
```

Response:

```json
{
	"id": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"user_id": "user-123",
	"balance": "0",
	"created_at": "2026-09-13T12:00:00.000Z"
}
```

### Credit Wallet

`POST /wallets/:id/credit`

Adds an amount in paise to the wallet balance.

Request:

```json
{
	"amount_paise": 5000
}
```

Example:

```bash
curl -X POST http://localhost:3000/wallets/17b61922-32a1-4ece-b2bd-c9d69b7b0150/credit \
	-H "Authorization: Bearer user-123" \
	-H "Content-Type: application/json" \
	-d '{"amount_paise":5000}'
```

Response:

```json
{
	"id": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"user_id": "user-123",
	"balance": "5000",
	"created_at": "2026-09-13T12:00:00.000Z"
}
```

`amount_paise` must be a positive safe integer.

### Create Transfer

`POST /transfers`

Transfers funds atomically between two wallets. Both wallets are locked in a deterministic database order. Reusing an idempotency key with the same request returns the original result.

Request:

```json
{
	"from": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"to": "b58e2526-6c6e-4fd0-bc2c-09a3f4975f53",
	"amount_paise": 1000,
	"idempotency_key": "transfer-request-001"
}
```

Example:

```bash
curl -X POST http://localhost:3000/transfers \
	-H "Authorization: Bearer user-123" \
	-H "Content-Type: application/json" \
	-d '{"from":"17b61922-32a1-4ece-b2bd-c9d69b7b0150","to":"b58e2526-6c6e-4fd0-bc2c-09a3f4975f53","amount_paise":1000,"idempotency_key":"transfer-request-001"}'
```

Response:

```json
{
	"id": "b571437a-d8d7-4f22-9013-ee9c4fd6b511",
	"from_wallet": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"to_wallet": "b58e2526-6c6e-4fd0-bc2c-09a3f4975f53",
	"amount": 1000,
	"status": "completed"
}
```

Possible insufficient-funds response (`409`):

```json
{
	"error": "insufficient funds",
	"transfer_id": "b571437a-d8d7-4f22-9013-ee9c4fd6b511",
	"status": "declined",
	"reason": "insufficient_funds"
}
```

### Get Transfer

`GET /transfers/:id`

```bash
curl http://localhost:3000/transfers/b571437a-d8d7-4f22-9013-ee9c4fd6b511 \
	-H "Authorization: Bearer user-123"
```

Response:

```json
{
	"id": "b571437a-d8d7-4f22-9013-ee9c4fd6b511",
	"idempotency_key": "transfer-request-001",
	"request_hash": "hash-of-request-body",
	"from_wallet": "17b61922-32a1-4ece-b2bd-c9d69b7b0150",
	"to_wallet": "b58e2526-6c6e-4fd0-bc2c-09a3f4975f53",
	"amount": 1000,
	"status": "completed",
	"created_at": "2026-09-13T12:00:05.000Z"
}
```

### Metrics

`GET /metrics`

Requires authentication and returns Prometheus text format.

```bash
curl http://localhost:3000/metrics \
	-H "Authorization: Bearer metrics-reader"
```

The output includes HTTP metrics and domain counters such as:

- `http_requests_total`
- `http_request_duration_seconds`
- `http_errors_total`
- `wallets_created_total`
- `wallet_lookups_total`
- `transfers_created_total`
- `transfers_declined_insufficient_funds_total`
- `idempotent_replays_total`

## Error Responses

Validation and application errors use this shape:

```json
{
	"error": "amount_paise must be a positive integer"
}
```

Common status codes:

- `400`: invalid or missing request fields
- `401`: missing bearer token
- `404`: wallet or transfer not found
- `409`: insufficient funds, idempotency conflict, or transfer still in progress
- `500`: unexpected server or database error

Detailed exception information is logged server-side and is not returned to clients.

## Concurrency Scripts

The scripts exercise wallet creation races, idempotent transfer retries, and balance conservation under contention. They use the wallet credit API for funding.

Run them from the repository root:

```bash
bash scripts/run_all.sh
```

Individual scripts:

```bash
bash scripts/1_concurrent_get_or_create.sh
bash scripts/2_idempotent_retry_storm.sh
bash scripts/3_conservation_under_contention.sh
```

Script 3 uses Bash arrays, so run it with `bash`, not `sh`.
