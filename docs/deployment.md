# Deployment

One monorepo, five deployables:

| App | Path | Host | Pipeline |
|---|---|---|---|
| API + worker | `backend/` | Railway (`bukkapay-api`, `bukkapay-worker`) | `deploy-backend.yml` on push to `main` |
| Website | `apps/website/` | Vercel → **www.bukkapay.com** | `deploy-web.yml` (PR previews, `main` = production) |
| Merchant app | `apps/merchant/` | Vercel → merchant.bukkapay.com | `deploy-web.yml` |
| Admin | `apps/admin/` | Vercel Git integration (`apps/admin/vercel.json`) | Vercel builds on push |
| Customer web | `apps/customer/` | Vercel → app.bukkapay.com | `deploy-frontend-web.yml` |

`ci-security.yml` runs on every PR and every push to `main`. It covers backend lint, types and tests against Postgres and Redis; lockfile-exact typecheck and build for all four apps; a Trivy dependency scan; and secret detection.

## Database migrations

The Railway API service runs `alembic upgrade head` as its **pre-deploy command** (`backend/railway.json`). The new version only starts if the migration succeeds; otherwise the previous version keeps serving. The worker doesn't run migrations.

Before merging a branch that adds migrations, rehearse them on a copy of production first (see `docs/pan-african-plan.md`). In particular, `0016`–`0020` have not been applied to production yet.

## Moving www.bukkapay.com to the monorepo website

www.bukkapay.com currently serves a separate Create React App build, not this repository. To switch:

1. In Vercel, create a project for `apps/website` (framework: Next.js, root directory: `apps/website`). Alternatively, reuse the existing www project and change its root directory and Git source to this repository.
2. Set the project's environment variables, using `apps/website/.env.example` as the template:
   - `NEXT_PUBLIC_API_URL=https://api.bukkapay.com`
   - `NEXT_PUBLIC_SITE_URL=https://www.bukkapay.com`
   - `NEXT_PUBLIC_MERCHANT_URL`, `NEXT_PUBLIC_APP_URL`
   - `WEBSITE_REVALIDATE_SECRET`: a long random string
3. On the **API** (Railway), set:
   - `WEBSITE_REVALIDATE_URL=https://www.bukkapay.com/api/revalidate`
   - `WEBSITE_REVALIDATE_SECRET`: the same value as in step 2
4. Add these GitHub repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEBSITE`, `VERCEL_PROJECT_ID_MERCHANT`.
5. Move the `www.bukkapay.com` and `bukkapay.com` domains to the new project, with the apex redirecting to www.
6. Old URLs (`/privacy`, `/terms`, `/cookies`, `/business`, `/waitlist`, `/login`, …) redirect to their new pages (`apps/website/next.config.mjs`).

## Website content (no deploy needed)

Admins edit the site in **Admin → Website**:

- launch mode (waitlist or live)
- announcement bar
- App Store and Play Store links
- contact and social links
- SEO title and description
- home hero, features and use cases
- pricing plans (hidden until published)
- FAQ

Every save is validated, versioned (a stale edit is refused rather than overwriting someone else's), recorded in the audit log, and pushed to the site within seconds through `/api/revalidate`. If the API is unreachable, the site falls back to the defaults in `apps/website/lib/site-defaults.json`. Regenerate that file from `backend/app/website/content.py` whenever the defaults change.

Waitlist signups appear under **Admin → Website → Waitlist**, with a CSV export that requires `website.manage`.

Permissions:
- `website.view`: every role that holds the view permissions.
- `website.manage`: super admin, operations admin and admin.
