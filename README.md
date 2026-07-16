# BukkaPay

Monorepo for BukkaPay — a mobile-first wallet/payments platform. One product, three parts, one repo (merged from separate `BukkaPay-Backend` / `BukkaPay-Admin` / `BukkaPay-Expo` repos on 2026-07-16, full commit history preserved via `git subtree` — see each folder's own history with `git log <merge-commit>^2` if you need to trace something back to its original repo).

```
backend/    FastAPI + Postgres + Redis API (mobile app + admin panel both talk to this)
admin/      React + Vite admin panel (pnpm workspace)
frontend/   Expo/React Native mobile app — also builds the public web app from the same source
```

## backend/

FastAPI + Uvicorn, SQLAlchemy 2.0 async + asyncpg, Alembic, Pydantic v2, ARQ + Redis for background jobs, plain PostgreSQL.

- Dev: `cd backend && uvicorn server:app --reload`
- Worker: `cd backend && arq worker.WorkerSettings`
- Tests: `cd backend && pytest` (needs a real Postgres + Redis — `docker-compose up` from `backend/`)
- Migrations: `cd backend && alembic upgrade head`
- Deploy: Railway, two services (`BukkaPay-Backend` API + `worker`), both with **Root Directory set to `backend`**, building from `backend/Dockerfile`. Auto-deploys on push to `main` — no reconfiguration needed after the monorepo move, since this path didn't change.

## admin/

React + Vite + TypeScript, Tailwind, Radix UI, Recharts, Wouter, React Query, pnpm workspace.

- Dev: `cd admin/artifacts/bukkapay-admin && pnpm dev`
- Deploy: Vercel. **Needs reconfiguring after the monorepo move** — relink the Vercel project to this repo and set its Root Directory to `admin` (it previously pointed at the standalone `BukkaPay-Admin` repo's own root).

## frontend/

Expo (SDK 54), React Native, expo-router, React Query, TypeScript. Ships to iOS/Android via EAS *and* exports to a public web app from this same source — there is no separate web-only copy of this code (a manually-synced `frontend/frontend/` duplicate existed briefly in the old repo and caused a real production bug; it's gone for good).

- Dev: `cd frontend && npm run start` (or `npm run android` / `npm run ios` / `npm run web`)
- Mobile builds: `cd frontend && eas build` (manual, not auto-triggered by pushes)
- Web deploy: `.github/workflows/deploy-frontend-web.yml` — builds `frontend/` with `expo export --platform web` and deploys via `vercel deploy --prebuilt` on every push to `main` that touches `frontend/**`. **Needs `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` added as secrets on this repo** (they lived on the old standalone `BukkaPay-Expo` repo and don't carry over automatically).

## Cross-cutting changes

Since the mobile app and admin panel both depend on the backend's API contract, changes to `backend/`'s schema or routes should be checked against both `admin/` and `frontend/` before merging.
