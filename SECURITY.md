# BukkaPay security and architecture baseline

This repository is a production-grade monorepo that combines a FastAPI backend, an Expo mobile app, and a Vite admin console. The operational model below reflects a senior-engineering approach to security, reliability, and deployment quality.

## Security principles

1. Fail closed: if required production settings are missing, the API should not start.
2. Least privilege: each service gets only the minimum environment variables and network access it needs.
3. Explicit trust boundaries: allowlists must be configured for CORS and admin origins in production.
4. Defense in depth: network, app, and infrastructure controls are layered so that a breach in one layer does not compromise the stack.
5. Build-time verification: CI must run tests, lint, and security scans before code reaches a protected branch.

## Required environment controls

Set these explicitly in deployment environments:

- `SECRET_KEY`: long random value used for secure app-level signing and sessions.
- `DATABASE_URL`: production Postgres DSN only; never commit in plaintext to git.
- `REDIS_URL`: production Redis connection string with access restricted to the app network.
- `ADMIN_API_KEY`: dedicated admin secret that is not reused by end-user auth flows.
- `ALLOWED_ORIGINS`: comma-separated production origins, e.g. `https://app.example.com,https://admin.example.com`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STITCH_CLIENT_SECRET`: only in protected secrets stores.

## Architecture recommendations

### Data layering

- Keep domain models and business logic in the backend service layer rather than in UI code.
- Treat the admin and app frontends as clients of the API contract; avoid duplicating payment or account logic on the client.
- Persist all transactional state in Postgres and use Redis only for cache, rate limiting, and queue state.
- Encode all externally exposed identifiers as opaque values where possible to reduce enumeration risk.

### Latency and performance

- Add Redis-backed caching only around read-heavy, low-risk endpoints and invalidate on write.
- Use database indexes on search, filtering, and join-heavy payment routes.
- Keep image and document payloads compressed and scanned before persistence.
- Separate long-running tasks into the ARQ worker process instead of blocking request threads.

### Platform boundaries

- Expose only the API schema that the app/admin clients truly need.
- Validate every external webhook signature before processing; Stripe and Stitch webhooks must be verified before state changes.
- Use HTTPS-only deployments and set HSTS headers to protect transport integrity.
- Restrict admin routes to trusted networks or admin key gate checks.

## Deployment guardrails

- Protect the `main` branch with required status checks.
- Require PR reviews for any change touching finance, auth, payments, or infra configuration.
- Run production deploys only from the default branch after CI and security scans pass.
- Rotate secrets in a managed secret store and do not hardcode them into the repository or workflow logs.

## Review checklist before release

- `backend` dependencies are scanned for known CVEs.
- Secrets are validated and rotated for any leaked values.
- Production `ALLOWED_ORIGINS` and `ADMIN_ALLOWED_ORIGINS` are set explicitly.
- Worker and API services have independent health endpoints and logs.
- Payment and auth flows are tested in a staging environment before moving to production.
