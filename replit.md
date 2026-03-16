# BukkaPay Backend

Cloned from: https://github.com/profyk/BukkaPay-Backend

## Project Structure

- `src/` - TypeScript backend source code (Express.js API)
- `db/` - Database schema and migration files
- `shared/` - Shared types and schema definitions
- `bukkapay_supabase.sql` - Supabase SQL schema

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript (tsx for dev)
- **Framework**: Express.js v5
- **Database**: PostgreSQL via Drizzle ORM + Supabase
- **Payments**: Stripe integration
- **Auth**: Supabase Auth + WebAuthn

## Running the App

The backend runs on port 5000.

```bash
npm run dev   # Development (tsx watch)
npm run build # Compile TypeScript
npm start     # Run compiled output
```

## Environment Variables Needed

- `DATABASE_URL` - PostgreSQL connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `STRIPE_SECRET_KEY` - Stripe secret key (optional)
