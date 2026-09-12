# Wallet Service Write-up

## Data Model

The service uses PostgreSQL with two core tables:

- `wallets`: UUID primary key, unique `user_id`, integer `balance` stored in paise, and `created_at`.
- `transfers`: UUID primary key, unique `idempotency_key`, request hash, source and destination wallet references, integer `amount`, status, and timestamps.

Wallet balances and transfer amounts are stored as integer paise rather than floating-point currency values. Foreign keys ensure transfers reference existing wallets, and database constraints prevent non-positive transfer amounts.

## Simplest-Correct Mechanism

A transfer runs inside one PostgreSQL transaction:

1. Validate the request and compute a deterministic request hash.
2. Insert the transfer using the unique `idempotency_key` and `ON CONFLICT DO NOTHING`.
3. Lock both wallet rows in a single query ordered by wallet ID.
4. Debit the source wallet only when its balance is sufficient.
5. Credit the destination wallet.
6. Mark the transfer `completed` and commit.

If funds are insufficient, the transfer is marked `declined` and committed so the outcome is durable. Deadlock error `40P01` causes the complete transaction to retry with a fresh connection, up to three attempts.

This mechanism is small, database-backed, and directly protects the invariant that money is neither created nor lost during a transfer.

## Alternatives Rejected

- **Application-only locking:** rejected because process-local locks do not protect against multiple service instances.
- **Redis/distributed locks:** rejected because they add infrastructure, expiry, and failure-mode complexity when PostgreSQL row locks already protect the data.
- **Event sourcing or a ledger-first architecture:** valuable for audit-heavy systems, but heavier than required for this service.
- **Two-phase commit:** rejected because both wallet updates are in the same PostgreSQL database and one local transaction is sufficient.
- **Blind upsert on idempotency conflict:** rejected because it could overwrite the original request. The existing row is read and its request hash is compared instead.

## Where Idempotency Lives

Idempotency is enforced at the database boundary:

- `transfers.idempotency_key` has a unique constraint.
- The request body fields are hashed and stored as `request_hash`.
- A repeated key with the same hash returns the original transfer result.
- A repeated key with a different hash returns `409 Conflict`.
- An existing `in_progress` transfer returns `409 Conflict` rather than being processed twice.

This protects correctness even when clients retry requests or multiple identical requests arrive concurrently.

## Consistency vs Availability

The service chooses consistency for money movement. Transfers use database transactions and row locks, so concurrent operations may wait, retry, or fail with a controlled error rather than returning an uncertain result. During a database outage, the service fails rather than accepting a transfer it cannot commit.

This is appropriate for wallet balances. Higher availability could be achieved with asynchronous queues or eventually consistent replicas, but that would make balance reads and transfer outcomes harder to reason about and would require reconciliation.

## AI Directed vs Decided

AI was used as an implementation assistant for code navigation, diagnostics, refactoring, documentation, and validation suggestions. The design decisions remained directed and reviewed by the developer: integer paise, PostgreSQL transactions, deterministic row locking, database-backed idempotency, retry limits, API shape, and the consistency tradeoff were chosen against the service requirements. AI did not independently decide financial invariants or production policy.

## Free-Tier Cost Note

The intended deployment uses free-tier resources only. Expected infrastructure cost for the exercise is **₹0**, subject to the provider's free-tier limits, account eligibility, and any applicable taxes or billing changes. The service has no paid external dependency requirement beyond the free-tier database and application runtime.
