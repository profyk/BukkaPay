# BukkaPay architecture and performance blueprint

## Layered architecture

### 1. Edge and client layer
- Customer app in `apps/customer/`, admin in `apps/admin/`, and merchant tools in `apps/merchant/` are thin clients.
- All client surfaces call the FastAPI backend for transactional behavior and state.
- Client code should never own authoritative payment state or wallet balance logic.

### 2. API layer
- `backend/app/api/` exposes the public contract for the platform.
- Route handlers should stay thin and perform validation, auth, and orchestration only.
- Business logic belongs in `backend/app/services/`.

### 3. Service and domain layer
- Domain services manage payment flow, wallet rules, auth, merchant logic, and integrations.
- Keep side effects explicit: DB writes, external calls, and queue operations should be isolated and testable.

### 4. Data and cache layer
- PostgreSQL remains the source of truth for transactions, balances, users, and merchant records.
- Redis is reserved for rate limiting, background task queue state, ephemeral sessions, and read-through caches for low-risk data.
- Avoid mixing cache state with transactional state; no cache should be treated as the system of record.

### 5. Integration layer
- Payment and banking providers such as Stripe and Stitch belong behind service adapters with explicit validation and idempotency checks.
- Use webhook verification before processing any state-changing event.

## Latency strategy

- Cache only the result of expensive reads that are safe to stale for a bounded interval.
- Add indexes for filtering and join-heavy queries before optimizing code paths.
- Defer heavy work to async workers using ARQ rather than blocking API requests.
- Compress file/document payloads and validate size limits before ingestion.

## Security strategy

- Keep API docs disabled in production.
- Restrict CORS to explicit allowlists in production.
- Enforce rigorous secret management via environment variables and managed secret stores.
- Add rate limiting where user-facing entry points are exposed.
- Verify every webhook signature and reject replayed or stale payloads.

## Release guardrails

- Main requires green CI and security scans before deploy.
- Backend and frontend changes are validated in separate pipelines.
- Production config is checked for required secrets before startup.
- Operational dashboards should track latency, error rates, queue backlogs, and payment anomalies.
