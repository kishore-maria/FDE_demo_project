# Developer guide

From a fresh clone to a running app in about 10 minutes.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer (`.nvmrc` = 20) | npm 10 comes with it |
| PostgreSQL | 16+ | Docker (`docker compose up -d postgres`) **or** a local install |
| Git | any | |
| Docker Desktop / Podman | optional | Only for the full-stack container run |
| Insomnia | optional | Import `docs/insomnia/bookworm.json` |

## 1. Install

```bash
git clone https://github.com/kishore-maria/FDE_demo_project.git
cd FDE_demo_project
npm ci
```

## 2. Database

**Option A — Docker** (creates `bookworm` and `bookworm_test`):

```bash
docker compose up -d postgres
```

**Option B — local PostgreSQL** (run once as a superuser):

```bash
psql -U postgres -f docker/postgres/setup-local.sql
```

## 3. Environment files

```bash
cp packages/api/.env.example      packages/api/.env
cp packages/api/.env.test.example packages/api/.env.test
cp packages/web/.env.example      packages/web/.env
```

Set `JWT_SECRET` in `packages/api/.env` to a long random string, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. `.env` files are git-ignored — never commit them.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://bookworm:bookworm@localhost:5432/bookworm` | Prisma connection |
| `JWT_SECRET` | — | HS256 signing key (**required**) |
| `JWT_EXPIRES_IN` / `JWT_GUEST_EXPIRES_IN` | `7d` / `24h` | Token lifetimes |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `PAYMENT_ALWAYS_SUCCESS` | `true` | `false` = mock gateway declines ~10% at random |
| `BCRYPT_ROUNDS` | `12` (`4` in tests) | |
| `TRUST_PROXY` | `0` | `1` behind nginx so rate limiting sees client IPs |
| `RATE_LIMIT_LOOKUP_MAX` | `10` | Order lookups per minute per IP |
| `SWEEPER_INTERVAL_MS` | `60000` | Reservation sweeper period |
| `SEED_ON_START` | `false` | Docker entrypoint seeds when `true` |
| `VITE_API_URL` (web) | `http://localhost:3001/api` | `/api` in Docker |

## 4. Migrate, seed, run

```bash
npm run db:migrate     # prisma migrate dev
npm run db:seed        # idempotent demo data
npm run dev            # api :3001 + web :5173
```

- App: http://localhost:5173 · API: http://localhost:3001/api · Swagger: http://localhost:3001/api/docs
- Demo accounts: `customer@test.com` / `Test@1234`, `admin@bookworm.com` / `Admin@1234`, `fresh@test.com` / `Test@1234`
- Coupons: `BOOK10` (₹100 off ≥ ₹300), `SAVE20` (20% ≥ ₹500, max ₹200), `WELCOME50` (₹50), `EXPIRED10` (expired)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (nodemon) and web (Vite) together |
| `npm test` | shared + api + web test suites |
| `npm run test:coverage` | api + web with v8 coverage (fails under 70%) — HTML report in `packages/*/coverage/` |
| `npm run build` | Production build of the web app (`packages/web/dist`) |
| `npm run spec:validate` | Validates `openapi.yaml` |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | Prisma helpers |

## Tests

- **API** (`packages/api/tests`): Vitest + Supertest against `bookworm_test`. `globalSetup` drops and recreates the schema, runs migrations and seeds before every run; files run serially; seed/schema assertions run first. Use `tests/factories.js` (`createShopper`, `checkoutCart`, `payOrder` …) for tests that change data — never mutate the seeded customer.
- **Responses are validated against `openapi.yaml`** in tests: a handler returning an undocumented shape fails with `RESPONSE_VALIDATION_ERROR`.
- **Web** (`packages/web/src/**/*.test.jsx`): Testing Library + MSW. Unhandled requests fail the test.

## Workflow

1. Change `packages/api/openapi/openapi.yaml` first, then routes/services, then tests.
2. Branches: `feature/*` → `develop` (merge `--no-ff`). `main` holds released plans only.
3. One commit per micro-task: `MT-xx: <title>`; tick the task in `PLAN.md`.

## Docker

```bash
docker compose up --build          # or: podman compose up --build
```

- http://localhost:5173 — nginx serves the SPA (deep links work) and proxies `/api` to the API container.
- The API container runs `prisma migrate deploy`, seeds (idempotent) and starts as the non-root `node` user.
- Data lives in the `pgdata` volume and survives restarts; `docker compose down -v` wipes it.
- If port 5432 is already used by a local PostgreSQL: `POSTGRES_PORT=5433 docker compose up --build`.
- Set a real `JWT_SECRET` in the environment for anything beyond a local demo.

## Deploy to Render + Neon (free)

A public review environment on free tiers: **one Render web service** built from the root [`Dockerfile`](../Dockerfile) (the API also serves the built web app, so there is a single URL) and a **Neon** PostgreSQL database. Configuration lives in [`render.yaml`](../render.yaml).

**1. Create the database (Neon)**
1. Sign up at https://neon.com (GitHub login works) → **New project** → name `bookworm`, Postgres 16+, region **Asia Pacific (Singapore)** (closest to the Render service).
2. **Connect** → turn **Connection pooling off** → copy the connection string. It looks like `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
3. Append `&connect_timeout=15` (Neon sleeps when idle and needs a moment to wake). Keep this string private.

**2. Create the service (Render)**
1. Sign up at https://render.com with GitHub and allow access to the `FDE_demo_project` repository.
2. **New → Blueprint** → pick the repository → branch **`develop`** → Render reads `render.yaml`.
3. When asked for `DATABASE_URL`, paste the Neon string from step 1. `JWT_SECRET` is generated automatically.
4. **Apply**. The first build takes ~5–10 minutes. On first start the container runs migrations and seeds the demo data into the empty database.
5. Open `https://bookworm-<suffix>.onrender.com` (shown on the service page). Swagger is at `/api/docs`.

**3. Share with the reviewer**
- App URL and demo accounts (`customer@test.com` / `Test@1234`, `admin@bookworm.com` / `Admin@1234`).
- The free service sleeps after ~15 minutes without traffic; the first request then takes up to a minute. Open the link shortly before a review.

**Behaviour and maintenance**
- Every push to `develop` redeploys automatically.
- `SEED_ON_START=if-empty` seeds only an empty database, so wake-ups keep reviewers' orders. To reset the demo data, run `npm run db:reset` locally with `DATABASE_URL` pointing at Neon, or delete and recreate the Neon database, then redeploy.
- Change demo passwords before sharing the link widely; never put real customer data in this environment.
- Clean up after the review: delete the Render service and the Neon project.

| Symptom on Render | Fix |
|---|---|
| Deploy fails with `P1001` / timeout | Check `DATABASE_URL` (direct string, `sslmode=require`, `connect_timeout=15`) and that the Neon project is active |
| `prepared statement … already exists` or migrations hang | You used the **pooled** (`-pooler`) string — use the direct one |
| Page loads but images are missing | The browser blocks third-party images (picsum.photos / pravatar.cc); allow them or use another network |
| First request is very slow | Normal for the free plan after idle time |

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `P1001: Can't reach database server` | PostgreSQL not running / wrong port | `docker compose up -d postgres` or start the local service; check `DATABASE_URL` |
| `P3014 … shadow database` during `db:migrate` | Role lacks `CREATEDB` | Use `setup-local.sql` (grants `CREATEDB`) |
| API tests fail in `globalSetup` | `bookworm_test` missing or `.env.test` absent | Create the DB (init/setup SQL) and copy `.env.test.example` |
| `JWT_SECRET is not configured` | Missing env var | Set it in `packages/api/.env` |
| Browser shows CORS errors | Web origin not in `CORS_ORIGIN` | Add it (comma-separated) and restart the API |
| `401 TOKEN_EXPIRED` after a day | Guest tokens last 24 h | Sign in again (the web app does this automatically) |
| `409 RESERVATION_EXPIRED` on payment | More than 30 min between checkout and payment | Go back to checkout; stock is reserved again |
| `429 RATE_LIMITED` on Track Order | > `RATE_LIMIT_LOOKUP_MAX` lookups/min | Wait a minute; raise the limit locally |
| `Port 5173 is in use` | Another Vite or the Docker web container | Stop it (`docker compose down`) — Vite uses `strictPort` |
| `bind: address already in use :5432` (Docker) | Local PostgreSQL on 5432 | `POSTGRES_PORT=5433 docker compose up` |
| `exec ./docker-entrypoint.sh: no such file` | Windows CRLF line endings | `.gitattributes` forces LF; the Dockerfile also strips `\r` |
| `SyntaxError: Named export … not found` in Node 20 | Named import from a CommonJS package | Import the default export and destructure (see `src/lib/jwt.js`) |
| Web test: `[MSW] intercepted a request without a matching request handler` | The component calls an endpoint the test didn't mock | Add `server.use(http.get(…))` or a default in `src/test/server.js` |
| Web test times out under `--coverage` | Instrumentation slows long form tests | `testTimeout` is 20 s in `vite.config.js`; keep tests focused |
| Prices off by 100× | Mixing rupees and paise | Store/send paise; format with `formatINR` |
