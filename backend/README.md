# BukkaPay Backend

FastAPI REST API backend for the BukkaPay wallet application, backed by PostgreSQL and Redis.

## Tech Stack

- **FastAPI** + **Uvicorn** - Web framework / ASGI server
- **SQLAlchemy 2.0** (async) + **asyncpg** - Database toolkit
- **Alembic** - Schema migrations
- **Pydantic v2** - Request/response validation
- **PostgreSQL** - Database
- **Redis** - Session cache, rate limiting, ARQ job queue
- **ARQ** - Background workers (runs as a separate service from the API)
- **Stitch** - South African instant-EFT payments

## Getting Started

### Prerequisites

- Python >= 3.12
- PostgreSQL database
- Redis

### Installation

```bash
# Install dependencies (editable install, incl. dev extras)
pip install uv
uv pip install --system -e ".[dev]"

# Set up environment variables
cp .env.example .env
# Edit .env with your database, Redis, and API credentials
```

### Development

```bash
# Apply migrations
alembic upgrade head

# Start the API with hot reload
uvicorn server:app --reload

# Start the background worker (separate process)
arq worker.WorkerSettings

# Or bring up Postgres + Redis + api + worker together
docker-compose up
```

### Tests

```bash
pytest
```

Tests run against a real Postgres instance (`DATABASE_URL`) and fakeredis in place of Redis — no external services required beyond Postgres.

### Production

```bash
uvicorn server:app --host 0.0.0.0 --port $PORT --workers ${WEB_CONCURRENCY:-4}
```

## Project Structure

```
backend/
├── server.py            # FastAPI entrypoint (uvicorn server:app)
├── worker.py            # ARQ background-worker entrypoint
├── app/
│   ├── core/            # config, security, sessions, middleware, rate limiting, errors
│   ├── db/               # async SQLAlchemy engine/session
│   ├── models/            # SQLAlchemy ORM models, one module per domain
│   ├── schemas/            # Pydantic request/response models (owns the JSON contract)
│   ├── services/            # business logic, one module per domain
│   ├── api/                  # route handlers (api/admin/ for the admin console)
│   ├── workers/                # ARQ task definitions + cron schedule
│   └── integrations/            # Stitch, PDF invoice generation
├── alembic/               # schema migrations
├── tests/                  # pytest suite
├── Dockerfile
├── docker-compose.yml       # postgres + redis + api + worker, for local dev
├── railway.json              # Railway API service config
└── railway.worker.json        # Railway worker service config
```

## API Endpoints

All endpoints require Bearer token authentication in the `Authorization` header unless noted otherwise. Every route path, method, and JSON shape matches the mobile app and admin panel's existing expectations — see `app/api/router.py` for the full list of mounted routers (auth, wallet, merchants, rental, gift cards, contributions, bill splits, claim payments, payment links, loyalty, notifications, WebAuthn, Stitch, plus the `/api/admin` console).

## Database Schema

Schema is defined via SQLAlchemy models in `app/models/`, one module per domain, evolved in place by the hand-written Alembic revisions in `alembic/versions/`.

## Environment Variables

See `.env.example` for the full list, including `DATABASE_URL`, `REDIS_URL`, `STITCH_CLIENT_ID`/`STITCH_CLIENT_SECRET`, `ADMIN_API_KEY`, `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`, `ALLOWED_ORIGINS`, and `ADMIN_ALLOWED_ORIGINS`.

## Deployment

Two Railway services from this one repo, sharing the same build:

- **API**: `railway.json` — `uvicorn server:app --host 0.0.0.0 --port $PORT --workers ${WEB_CONCURRENCY:-4}`
- **Worker**: `railway.worker.json` — `arq worker.WorkerSettings`

## License

MIT
