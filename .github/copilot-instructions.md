# BookWorm — Copilot instructions

Source of truth: `PLAN.md`. Implement one micro-task (MT-xx) per session, in order. Do not start the next MT.

## Stack (pinned majors)
Node 20+ · Express 5 · Prisma 6 · PostgreSQL · React 18 + Vite 6 · Tailwind 3 · React Router 6 · Zustand 5 · Axios 1 · Vitest 3 everywhere · Supertest · Testing Library + MSW 2 · OpenAPI 3.0 + express-openapi-validator 5.

## Conventions
- ESM only (`import`/`export`); every package has `"type": "module"`.
- Money is integer paise (`pricePaise`). API responses include `xxxPaise` and formatted `xxxInr` (use `formatINR` from `bookworm-shared`).
- Totals always come from `computeOrderTotals` in `bookworm-shared` — never re-implement pricing.
- Error shape: `{ error: { code, message, details? } }`. List shape: `{ items, page, pageSize, total, totalPages }`.
- Spec-first: change `packages/api/openapi/openapi.yaml` before changing routes; responses are validated against it in tests.
- Express routes: register static paths before `/:id` routes.
- Prisma: use the single client from `src/lib/prisma.js`. Cast `$queryRaw` aggregates with `::int`/`::float` (no BigInt in JSON).
- `createApp(options)` in `src/app.js` builds the app; `server.js` only loads env, starts jobs and listens. Tests import `createApp`.
- Never store or log card numbers/CVV — store only `cardLast4`.
- Guest users (role GUEST) can only access orders/payments where `order.guestSessionId === req.user.gsid`.

## Tests
- Write the tests listed in the MT; all must pass before the MT is done.
- API tests run against `bookworm_test` (`.env.test`), serially; create unique users with `tests/factories.js` for mutating tests.
