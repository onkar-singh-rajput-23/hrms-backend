# Deploying the HRMS backend to Cloudflare Workers (free plan)

The backend runs on **Cloudflare Workers** (Hono) with **Cloudflare D1** (SQLite) as
storage — see `src/worker/`. The old Express server (`src/server.ts`, `src/app.ts`) and
the local JSON file DB are kept for local Node development; Cloudflare uses the Worker.

## One-time setup (you must do these — they need your Cloudflare login)

```bash
cd HRMS/backend
npm install

# 1. Log in to your Cloudflare account
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id into wrangler.toml
#    (replace REPLACE_AFTER_D1_CREATE)
npx wrangler d1 create hrms

# 3. Create the tables in the remote D1
npm run db:init

# 4. Set the secrets (JWT_SECRET is required; SEED_SECRET guards the seed endpoint)
npx wrangler secret put JWT_SECRET      # paste a long random string
npx wrangler secret put SEED_SECRET     # paste any private value

# 5. Deploy
npm run cf:deploy
# -> prints your URL, e.g. https://hrms-backend.<subdomain>.workers.dev
```

## Seed the data (once, after first deploy)

```bash
curl -X POST https://<your-worker-url>/api/admin/seed -H "x-seed-secret: <your SEED_SECRET>"
```

This creates the Hurry's roster: 9 employees, the June 2026 payroll run, and 12 logins
(shared password `Password123!`): `admin@hurrys.local` (admin), `hr@hurrys.local` (admin),
`manager@hurrys.local` (manager), and one per employee (e.g. `monu@hurrys.local`).

## Point the frontend at the Worker

In `HRMS/frontend/.env.local` (and your frontend host's env):

```
NEXT_PUBLIC_API_URL=https://<your-worker-url>/api
```

Also set `CORS_ORIGIN` in `wrangler.toml` `[vars]` to your deployed frontend origin
(instead of `*`) and redeploy.

## Git-integration builds (Cloudflare dashboard → connected repo)

If you deploy by connecting this GitHub repo in the Cloudflare dashboard, the build
runs `npm run build` then `npx wrangler deploy`. That deploy will **only succeed once
`wrangler.toml` has a real `database_id`** (step 2) and the secrets are set in the
project settings — until then it fails with a D1/binding error.

## Local development against the Worker runtime

```bash
npm run db:init:local     # create tables in the local D1
npm run cf:dev            # wrangler dev on http://localhost:8787
# seed locally (SEED_SECRET comes from .dev.vars):
curl -X POST http://localhost:8787/api/admin/seed -H "x-seed-secret: localseed"
```

## Free-tier limits
- Workers: ~100,000 requests/day.
- D1: generous free tier (rows read/written per day, storage) — fine for this app.
