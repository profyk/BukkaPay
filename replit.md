# BukkaPay Backend

Cloned from: https://github.com/profyk/BukkaPay-Backend

## Project Structure

```
backend/                   ← all backend code lives here
  src/                     ← TypeScript source
    index.ts               ← Express server entry point (port 5000)
    routes.ts              ← API route definitions
    auth.ts                ← Auth helpers (signup, login, WebAuthn)
    storage.ts             ← Database access layer
    stripe-client.ts       ← Stripe SDK setup
    stripe-service.ts      ← Stripe business logic
    stripe-webhooks.ts     ← Stripe webhook handling
    supabase.ts            ← Supabase client
    drizzle.config.ts      ← Drizzle ORM config
    shared/                ← Shared schema (mirrored)
    db/                    ← DB connection (mirrored)
  shared/
    schema.ts              ← Drizzle/Zod schema definitions
  db/
    index.ts               ← PostgreSQL + Drizzle client
  railway.json             ← Railway deployment config
  .env.example             ← Required environment variables
  .gitignore
  package.json
  tsconfig.json
  bukkapay_supabase.sql    ← Supabase schema SQL
  README.md
```

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Framework**: Express.js v5
- **Database**: PostgreSQL via Drizzle ORM + Supabase
- **Payments**: Stripe
- **Auth**: Supabase Auth + WebAuthn

## Running Locally

```bash
cd backend
npm run dev       # Development with hot reload (tsx watch)
npm run build     # Compile TypeScript → dist/
npm start         # Run compiled output
```

## Railway Deployment

- Set **Root Directory** to `backend` in Railway project settings
- Railway will run `npm install && npm run build` then `npm start`
- Required environment variables (set in Railway dashboard):
  - `DATABASE_URL`
  - `EXTERNAL_DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `STRIPE_SECRET_KEY` (optional)
  - `PORT` (Railway sets this automatically)
