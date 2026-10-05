# BookWorm — Final Merged Development Plan (v2, Node.js)

> Single source of truth. Supersedes `bookworm-ecommerce-plan.md` and `bookworm-microtasks.md`.
> Target file: `c:\Projects\FDE - e-commerce application for demo\Plans\bookworm-final-plan.md` (copy also to repo root as `PLAN.md`).
> Execute micro-tasks MT-01 → MT-37 in order. One micro-task per agent session. Do not start the next MT until the current checklist passes.

---

## 1. Overview

**Goal:** "Book Worm" — a dark-themed e-bookstore where guests and registered users browse, select and buy books, matching the provided UI designs, use-case journeys (steps 1–12) and architecture (Member, Store, Catalog, Order, Payment, Shipping).

**Stack:** Node.js 20 LTS · Express 5 · Prisma 6 · PostgreSQL 16 · React 18 + Vite 6 · Tailwind CSS 3 · React Router 6 · Zustand 5 · Axios 1 · JWT (bcryptjs) · Vitest 3 (all packages) · Supertest · Testing Library + MSW 2 · OpenAPI 3.0 + express-openapi-validator 5 + swagger-ui-express 5 · Docker Compose.

**In scope:** guest + registered flows, 2-level categories + publishers (brands), search/filter/sort, product detail with reviews/related/up-sell/cross-sell, cart (anonymous + server, merged), combined cart+checkout, coupons, gift points, wallet, mock payments (Credit, Debit, UPI, Wallet), orders (history, Buy Again, cancel ≤48h with refund, return with return shipment, modify address), shipment tracking + simulator, recommendation engine, My Writers (follow), guest order tracking + account conversion, admin (stores, policies, catalog, coupons, orders), OpenAPI spec-first, Insomnia collection, Docker, docs.

**Out of scope:** real payment gateway, email/OTP, ML recommendations, mobile app, OpenShift manifests, entitlement-based browsing.

---

## 2. Confirmed Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Backend | Node.js + Express (no Java/Spring). README maps the slide's Spring Boot workflow to Node equivalents |
| 2 | Architecture | Modular monorepo, npm workspaces: `packages/api`, `packages/web`, `packages/shared` |
| 3 | Module system | ESM everywhere (`"type": "module"`) |
| 4 | Test runner | Vitest for shared, api, web |
| 5 | API contract | Spec-first: `openapi.yaml` written after schema+seed (MT-05), enforced by express-openapi-validator (requests always; responses in test env) |
| 6 | Currency | INR, stored as integer paise; API returns `xxxPaise` + `xxxInr` |
| 7 | Guest access | Public browsing; anonymous cart in browser, merged into server cart on login/register/guest-session |
| 8 | Guest security | Guest session rejected for registered emails; guest token scoped by `gsid`; human-readable `orderNumber` for tracking |
| 9 | Checkout | Creates PENDING order with stock reservation (30 min); payment success finalizes coupon, points, wallet, cart, shipment |
| 10 | Taxonomy | 2-level categories, many-to-many book↔category, Publisher entity = "brand" |
| 11 | Layout | Matches design: Home = Catalogue page; Cart + Checkout = one page |
| 12 | Versions | Pinned majors (see Stack) |
| 13 | Tests | Separate `bookworm_test` DB, serial execution, reset+seed before run, unique users per test |
| 14 | Git | `main` + feature branches per phase, PR per phase (manager as reviewer) |
| 15 | Scope adds | Admin/Store, up-sell/cross-sell, refunds, shipment simulator, return shipment, Insomnia collection |

---

## 3. Repository Structure

bookworm/ (repo root = workspace folder `final/`)
- package.json — workspaces + root scripts
- PLAN.md — this file
- .github/copilot-instructions.md — coding conventions for every agent session
- docker-compose.yml — postgres (MT-01), full stack (MT-36)
- docker/postgres/init.sql — creates `bookworm` and `bookworm_test` DBs
- .gitignore, .dockerignore, .editorconfig, .nvmrc (20)
- packages/shared/src/ — currency.js, constants.js, pricing.js, dates.js, ids.js, index.js; tests/
- packages/api/
  - prisma/schema.prisma, prisma/migrations/, prisma/seed/ (index.js, catalog.js, users.js, data/*.js)
  - openapi/openapi.yaml
  - src/app.js (createApp), src/lib/prisma.js, src/lib/errors.js, src/lib/jwt.js
  - src/middlewares/ authenticate.js, authorize.js, rateLimit.js, errorHandler.js
  - src/modules/ auth, users, catalog, authors, cart, wishlist, coupons, orders, payments, shipments, stores, admin (each: *.routes.js, *.controller.js, *.service.js)
  - src/jobs/reservationSweeper.js
  - server.js, vitest.config.js, tests/ (setup, globalSetup, factories, *.test.js)
  - Dockerfile, docker-entrypoint.sh
- packages/web/
  - src/api/client.js, src/stores/ (useAuthStore, useCartStore), src/router/AppRouter.jsx
  - src/components/ (BookCard, Navbar, GenreSidebar, FilterBar, StarRating, PaymentModal, PaymentSuccessOverlay, AuthorCard, StatusBadge, LoadingSpinner, SkeletonCard, EmptyState, ConfirmDialog, Breadcrumb, AddressForm, OrderSummaryPanel, ShipmentTimeline)
  - src/pages/ (HomePage, BookDetailPage, CheckoutPage, OrdersPage, OrderDetailPage, WishlistPage, MyWritersPage, TrackOrderPage, LoginPage, RegisterPage, NotFoundPage, admin/*)
  - src/assets/ (book illustration background)
  - Dockerfile, nginx.conf, vite.config.js, tailwind.config.js
- docs/ architecture.md, data-model.md, api-reference.md, frontend-components.md, data-flows.md, developer-guide.md, demo-script.md, insomnia/bookworm.json

---

## 4. Shared Package (`bookworm-shared`)

- **currency.js:** `formatINR(paise)` via `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` — 0 decimals when whole rupees, else 2 (`₹149`, `₹60.96`, `₹1,23,456`); `formatINRFixed(paise)` always 2 decimals (`₹508.00`, totals panel); `toPaise(inr)` (Math.round), `toINR(paise)`.
- **constants.js:** TAX_RATE 0.12 (design-driven assumption; printed books are GST-exempt in India — documented), FREE_DELIVERY_THRESHOLD_PAISE 50000, DELIVERY_CHARGE_PAISE 4900, GIFT_POINT_VALUE_PAISE 100 (1 point = ₹1), GIFT_POINT_EARN_RATE 0.05, CANCEL_WINDOW_HOURS 48, RETURN_WINDOW_DAYS 7, ORDER_RESERVATION_MINUTES 30, REVIEW_MAX_CHARS 100, DELIVERY_BUSINESS_DAYS 3, ORDER_STATUSES, PAYMENT_METHODS, BOOK_FORMATS.
- **pricing.js:** `computeOrderTotals({ items:[{pricePaise, quantity, format}], coupon, giftPointsToRedeem })` — used by backend checkout AND frontend preview:
  - subtotal = Σ pricePaise × quantity
  - tax = round(subtotal × TAX_RATE) — on pre-discount subtotal (matches design: 508 + tax − 100)
  - delivery = 0 if subtotal ≥ threshold or all items EBOOK, else 4900
  - couponDiscount: FLAT = discountValue; PERCENT = round(subtotal × pct/100) capped by maxDiscountPaise; 0 if subtotal < minOrderValuePaise
  - giftDiscount = min(giftPointsToRedeem × 100, subtotal + tax + delivery − couponDiscount)
  - total = subtotal + tax + delivery − couponDiscount − giftDiscount
  - pointsEarned = floor(total × 0.05 / 100)
  - Design mock numbers (₹62 tax, ₹580 payable) are inconsistent — always display computed values.
- **dates.js:** `addBusinessDays(date, n)` (skips Sat/Sun), `formatDeliveryDate(date)` → `Delivery by Mon, 21 Jul`; eBook → `Instant download`.
- **ids.js:** `generateOrderNumber()` → `BW-` + 8 Crockford base32 chars; `generateTrackingNumber()` → `TRK-` + 10 chars (via `crypto.getRandomValues`, works in Node + browser).

---

## 5. Data Model (21 tables, Prisma; money = Int paise)

| Table | Key columns |
|---|---|
| users | id uuid, email unique (lowercased), passwordHash?, firstName, lastName, phone?, role GUEST/CUSTOMER/ADMIN, giftPoints 0, walletBalancePaise 0, createdAt |
| addresses | id, userId, firstName, lastName, email, phone, line1, line2?, city, pin, state, country "India", isDefault |
| stores | id, name, slug unique, description, isActive |
| store_policies | id, storeId, type RETURN/CANCELLATION/SHIPPING/PAYMENT, title, content |
| categories | id, name, slug unique, parentId?, displayOrder, showInSidebar |
| book_categories | bookId, categoryId, isPrimary — PK(bookId, categoryId) |
| publishers | id, name, slug unique, description?, logoUrl? |
| authors | id, name, slug unique, bio, photoUrl |
| author_follows | id, userId, authorId, source MANUAL/AUTO_PURCHASE, followedAt — unique(userId, authorId) |
| books | id, slug unique, title, authorId, publisherId, storeId?, shortDescription, description, isbn?, pricePaise, format PAPERBACK/HARDCOVER/EBOOK, language, coverImageUrl, backCoverImageUrl?, stockQuantity 100, ratingAvg Float 0, ratingCount 0, salesCount 0, isEditorsPick false, publishedAt, createdAt |
| book_relations | bookId, relatedBookId, type UPSELL/CROSS_SELL — PK(all three) |
| reviews | id, bookId, userId, rating 1–5, comment (≤100), createdAt — unique(bookId, userId) |
| wishlists | id, userId, bookId, createdAt — unique(userId, bookId) |
| cart_items | id, userId, bookId, quantity, addedAt — unique(userId, bookId) |
| coupons | id, code unique, discountType FLAT/PERCENT, discountValue (paise if FLAT, % if PERCENT), maxDiscountPaise?, minOrderValuePaise 0, validUntil, usageLimit?, usedCount 0, isActive |
| orders | id uuid, orderNumber unique, userId NOT NULL, guestSessionId?, contactEmail NOT NULL, shippingAddress Json (snapshot), couponId?, subtotalPaise, taxPaise, couponDiscountPaise, giftDiscountPaise, deliveryChargePaise, totalPaise, giftPointsRedeemed, giftPointsEarned, status PENDING/CONFIRMED/SHIPPED/DELIVERED/CANCELLED/EXPIRED/RETURN_REQUESTED/RETURNED, paymentStatus UNPAID/PAID/FAILED/REFUNDED, paymentMethod?, reservedUntil?, createdAt, confirmedAt?, cancelledAt? |
| order_items | id, orderId, bookId, titleSnapshot, quantity, priceAtPurchasePaise, deliveryDate? |
| payments | id, orderId, sessionId unique, method CREDIT_CARD/DEBIT_CARD/UPI/WALLET, amountPaise, status INITIATED/SUCCEEDED/FAILED/REFUNDED, cardLast4?, upiHandleMasked?, failureReason?, createdAt, refundedAt? — never store PAN/CVV |
| shipments | id, orderId, type FORWARD/RETURN, trackingNumber unique, carrier "BookWorm Express", status PROCESSING/SHIPPED/OUT_FOR_DELIVERY/DELIVERED, estimatedDelivery, actualDelivery?, shippingRatePaise |
| shipment_events | id, shipmentId, status, note, occurredAt |
| gift_point_transactions | id, userId, points, type CREDIT/DEBIT, reason, orderId?, createdAt |

Rules: `orders.userId` is never null (guest-session always creates a real user row). Ids are `String @id @default(uuid()) @db.Uuid`.

---

## 6. API Conventions

- Base path `/api`. Errors: `{ error: { code, message, details? } }`. Lists: `{ items, page, pageSize, total, totalPages }`. Money: `xxxPaise` + `xxxInr`.
- `src/app.js` exports `createApp(options)` (options: lookupLimit, enableResponseValidation). `server.js` loads dotenv, starts sweeper, listens. Tests import `createApp` only.
- Express 5 (async errors handled natively). One Prisma client in `src/lib/prisma.js`.
- **Route order:** static paths before `/:id` (`/books/recommended|bestsellers|new-launches`, `/authors/following|following/new-releases|suggestions`). Path ids validated as uuid by the OpenAPI validator (→ 400, never 500).
- `$queryRaw`: cast aggregates `::int` / `::float` (no BigInt in JSON).
- `app.set('trust proxy', process.env.TRUST_PROXY)`; `BCRYPT_ROUNDS` env (12 dev, 4 test); `crypto.randomUUID()` (no uuid package).
- Public `POST /orders/lookup` on its own router, mounted before auth middleware; rate limit `RATE_LIMIT_LOOKUP_MAX` (10/min dev).
- Middlewares: `authenticate({ optional })`, `requireRole(...roles)`, `requireRegistered` (CUSTOMER|ADMIN), guest scope check (`req.user.gsid`).
- morgan disabled when NODE_ENV=test. Request bodies never logged.

### Env vars (packages/api/.env, .env.example, .env.test)
DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN=7d, JWT_GUEST_EXPIRES_IN=24h, PORT=3001, NODE_ENV, CORS_ORIGIN=http://localhost:5173, PAYMENT_ALWAYS_SUCCESS=true, BCRYPT_ROUNDS=12, TRUST_PROXY=0, RATE_LIMIT_LOOKUP_MAX=10, SWEEPER_INTERVAL_MS=60000, SEED_ON_START=false.
Web: VITE_API_URL=http://localhost:3001/api (Docker: /api).

---

## 7. Endpoint Inventory

| Module | Endpoints | Auth |
|---|---|---|
| Health/Docs | GET /health, GET /docs | public |
| Auth | POST /auth/register, POST /auth/login, POST /auth/guest-session | public |
| Auth | GET /auth/profile, PUT /auth/profile | any token |
| Auth | PUT /auth/set-password | GUEST with order in same gsid |
| Users | GET/POST /users/me/addresses, PUT/DELETE /users/me/addresses/:id, PUT /users/me/addresses/:id/default | registered |
| Catalog | GET /categories (tree), GET /publishers, GET /publishers/:id, GET /books, GET /books/recommended, GET /books/bestsellers, GET /books/new-launches, GET /books/:id | public (optional auth) |
| Catalog | POST /books/:id/reviews | registered |
| Authors | GET /authors, GET /authors/:id | public (optional auth → isFollowing) |
| Authors | GET /authors/following, GET /authors/following/new-releases, GET /authors/suggestions, POST/DELETE /authors/:id/follow | registered |
| Cart | GET /cart, POST /cart/items, PUT /cart/items/:bookId, DELETE /cart/items/:bookId, DELETE /cart, POST /cart/merge | any token |
| Cart | POST /cart/buy-again/:orderId | registered |
| Wishlist | GET /wishlist, POST /wishlist, DELETE /wishlist/:bookId | registered |
| Coupons | POST /coupons/validate | any token |
| Orders | POST /orders/checkout | any token |
| Orders | GET /orders, POST /orders/:id/cancel, POST /orders/:id/return, PATCH /orders/:id/address | registered |
| Orders | GET /orders/:id | owner (guest only if same gsid) |
| Orders | POST /orders/lookup | public, rate-limited |
| Payments | POST /payments/initiate, POST /payments/confirm | owner (guest same gsid) |
| Payments | GET /payments/wallet | registered |
| Shipments | GET /shipments/order/:orderId | owner |
| Shipments | POST /shipments/calculate-rate | public |
| Store | GET /stores/:slug (with policies) | public |
| Admin | CRUD /admin/books, /admin/categories, /admin/publishers, /admin/authors, /admin/coupons, /admin/stores, /admin/stores/:id/policies; GET /admin/orders; POST /admin/shipments/:id/advance | ADMIN |

`GET /books` query: category (slug), publisher (slug), author (slug), format, language, minPrice, maxPrice (paise), search (ILIKE title/author/publisher), sort relevance|price_asc|price_desc|rating|newest, page (1), pageSize (12, max 48).

---

## 8. Business Rules

- **Guest session:** `POST /auth/guest-session {email}` → if a CUSTOMER/ADMIN exists with that email → 409 `ACCOUNT_EXISTS` (UI prompts login). Else upsert GUEST user, issue 24h JWT `{id, email, role:'GUEST', gsid}` (gsid = new random id each call).
- **Guest scope:** GUEST cannot list orders/addresses/wishlist/wallet, review or follow. GUEST can access orders/payments only where `order.guestSessionId === token.gsid`.
- **Account conversion:** `PUT /auth/set-password` allowed only for GUEST with ≥1 order in the current gsid; sets passwordHash, role CUSTOMER; returns new 7d JWT. Same userId → all past orders visible. Residual risk (no OTP) documented in docs.
- **Order lookup:** `{email, orderNumber}` → match `contactEmail` (case-insensitive) + `orderNumber`; generic 404 otherwise.
- **Cart merge:** `POST /cart/merge {items:[{bookId, quantity}]}` sums quantities, caps at stock, returns cart + skipped items.
- **Checkout:** releases user's previous PENDING orders → accepts `addressId` or inline `address` (+ `saveAddress` for registered) → transaction: conditional stock decrement per item (`updateMany where stockQuantity >= qty`, 409 `INSUFFICIENT_STOCK` on failure) → validate coupon & points (not consumed) → `computeOrderTotals` → create PENDING order (orderNumber, contactEmail, address snapshot, guestSessionId, reservedUntil = now + 30 min) + items. Cart NOT cleared.
- **Payment initiate:** order PENDING, not expired, owner → payment INITIATED with sessionId; returns payable.
- **Payment confirm:** success = `PAYMENT_ALWAYS_SUCCESS !== 'false' ? !forceFailure : Math.random() > 0.1`. Card data → store only last4. On success (one transaction): re-check reservation, coupon limit, points balance, wallet balance (WALLET; insufficient → FAILED); order CONFIRMED/PAID/confirmedAt; coupon usedCount++; debit redeemed points + credit earned points (transactions); wallet debit; remove ordered books from cart; salesCount++; FORWARD shipment (PROCESSING, estimated = +3 business days, eBook-only orders → DELIVERED immediately) + event; auto-follow authors (AUTO_PURCHASE, skip duplicates). On failure: payment FAILED, order stays PENDING (retry allowed until reservedUntil).
- **Reservation sweeper:** every SWEEPER_INTERVAL_MS (not started in tests; exported function) → PENDING with reservedUntil < now → EXPIRED, restore stock.
- **Cancel:** owner, status PENDING or CONFIRMED, forward shipment still PROCESSING, within 48h → CANCELLED, restore stock, refund redeemed points, reverse earned points, coupon usedCount−−, payment REFUNDED (wallet credited if WALLET), cancelledAt.
- **Return:** DELIVERED within 7 days → RETURN_REQUESTED + RETURN shipment. When admin advances RETURN shipment to DELIVERED → RETURNED, restore stock, refund as above.
- **Modify order:** PATCH address only while CONFIRMED and forward shipment PROCESSING.
- **Shipment simulator:** `POST /admin/shipments/:id/advance` → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED; writes event; syncs order status (SHIPPED/DELIVERED, or RETURNED for RETURN type).
- **Order flags** (server-computed on GET /orders/:id and list): canCancel, canReturn, canModifyAddress.
- **Shipping rate:** free if subtotal ≥ ₹500 or eBook-only, else ₹49; ETA 3 business days.
- **Recommendations:** candidates = in-stock books not purchased by user. score = 3 × categoryAffinity (share of user's purchased quantity in the book's categories, 0–1) + 2 × authorAffinity (author followed or previously bought) + 1 × ratingAvg/5. Top 10 → `source: 'personalised'`. Anonymous, GUEST, or no history → `isEditorsPick` books → `source: 'editors_pick'` (differs from Bestsellers).
- **Bestsellers:** salesCount desc, top 12. **New Launches:** publishedAt desc, top 12. **Relevance sort:** with search → title matches first, then salesCount; without → isEditorsPick desc, salesCount desc.
- **Related reads:** same primary category, exclude self, top 5 by rating. **Up-sell / cross-sell:** from book_relations.
- **Reviews:** registered only, rating 1–5, comment ≤100 chars, upsert per user/book, recompute ratingAvg + ratingCount.
- **Follow:** MANUAL via API (registered). Duplicate follow → 409; unfollow non-followed → 404. Suggestions = authors in categories user purchased from, not yet followed.

---

## 9. Seed Data (idempotent; fixed UUIDs/slugs; `seed(prisma)` exported + CLI)

- **Categories:** top-level Fiction, Non-Fiction (showInSidebar false). 19 sidebar genres in UI order: Romance, Mystery, Science Fiction, Fantasy, Historical, Biography, Self-help, Memoir, Travel, Cooking, Children's, Young Adult, Comics & Graphic Novels, Poetry, Drama, Science, Philosophy, Religion, Language Learning — each with a parent. Hidden sub-genres: Thriller, Horror, Love (parent Fiction). "All" is UI-only.
- **Publishers:** ABC Publishers, Lotus Press, Northwind Books, Inkwell House.
- **Authors (12):** Arjun Patel, Raj Patel, James Wright, James Adams, Jessica Martin, Laura Mitchell, Daniel Reed, Clara Nelson, Emily Parker + 3 more. Photos `https://i.pravatar.cc/150?u=<slug>`; Daniel Reed bio from design.
- **Books (36):** 9 design books exactly:
  - The Art of Focus — Arjun Patel — ₹399 — Paperback — Non-Fiction/Self-help — editor's pick
  - The Art of Learning — Raj Patel — ₹259 — Paperback — Non-Fiction/Self-help — editor's pick
  - The Path to Success — James Wright — ₹359 — Paperback — Non-Fiction/Self-help — editor's pick
  - The Midnight Hour — James Adams — ₹299 — Paperback — Fiction/Thriller/Horror/Mystery — bestseller
  - Beneath the Stars — Jessica Martin — ₹499 — Hardcover — Fiction/Love/Drama — bestseller
  - The Final Frontier — Laura Mitchell — ₹359 — Paperback — Fiction/Thriller/Science Fiction — bestseller
  - Joy of Minimalism — Daniel Reed — ₹149 — Paperback — Non-Fiction/Self-help — ABC Publishers — 145 sold — new launch
  - The Vanishing House — Clara Nelson — ₹99 — eBook — Fiction/Horror/Mystery — new launch
  - The Lost Kitten — Emily Parker — ₹339 — Hardcover — Fiction/Children's — new launch
  - plus Daniel Reed's "Less, But Better" and "The Focus Reset", plus 25 more across all genres; ≥4 non-English (Hindi, Tamil); front + back covers `https://picsum.photos/seed/<slug>-front/400/600` and `-back`; staggered publishedAt; salesCount tuned so the 3 bestsellers rank top; book_relations pairs (e.g. Joy of Minimalism → cross-sell The Focus Reset; Paperback → up-sell Hardcover edition).
- **Users:** admin@bookworm.com / Admin@1234 (ADMIN); customer@test.com / Test@1234 (CUSTOMER, 200 points, wallet ₹1000, default address); fresh@test.com / Test@1234 (no history).
- **Customer history:** Order A DELIVERED 30 days ago = Less, But Better + The Focus Reset; Order B DELIVERED 3 days ago = 2 Mystery/Thriller non-design books (returnable in demo). Consistent payments, shipments + events, gift point transactions.
- **Coupons:** BOOK10 (FLAT ₹100, min ₹300), SAVE20 (20%, min ₹500, max ₹200), WELCOME50 (FLAT ₹50), EXPIRED10 (expired).
- **Store:** "BookWorm Main Store" + 4 policies (Return 7 days, Cancellation 48h, Shipping free over ₹500, Payment methods).
- **Follows:** customer → Daniel Reed + Order B author (AUTO_PURCHASE).

---

## 10. UI Specification (from designs)

- **Theme tokens:** bg `#161616`/`#1c1c1c`, surface `#262626`, sidebar `#1f1f1f`, border `#393939`, accent blue `#0f62fe`, accent hover `#0050e6`, link `#78a9ff`, text white / gray-300, success green `#24a148`, danger `#da1e28`. (Adjust to screenshot if needed; keep as Tailwind `bw-*` tokens.)
- **Navbar:** grid icon + "Book Worm" | My Orders · My Wishlist · My Writers | cart icon with badge · profile icon (menu: Login/Register or name, Admin, Logout). "Track Order" shown when not registered. Registered-only links redirect to `/login?redirect=` for others.
- **Home/Catalogue (`/`):** left GenreSidebar (All + 19 genres + "Publishers" list); top FilterBar (Search, Language, Format, Price Range, Sort by). No filter → sections "Recommended for You", "Bestsellers this Month", "New Launches" (3-column grid of BookCards). Any filter/genre/publisher → paginated results grid + active filter chips. All state in URL query.
- **BookCard (design):** cover left; title; "by <Author>" link; short description; format; category links; price; "Delivery by Mon, 21 Jul" (or "Instant download"); hover/focus overlay "Add to Cart" on cover; compact variant for Related Reads.
- **Book detail (`/books/:id`):** breadcrumb Home / Parent / Primary category; front + back covers; title, author link, short description, "Published by" publisher link, format, category links, price, delivery; Add to Cart + Add to Wishlist; Language · Rating stars · "N copies sold"; About the writer (photo, bio, Follow); Reviews (list + form with 0/100 counter, stars, Submit); right "Related Reads"; below "Frequently bought together" (cross-sell) and "Upgrade your edition" (up-sell).
- **Cart + Checkout (`/checkout`, `/cart` redirects):** breadcrumb …/ Checkout; "Shopping Cart" items with −/+ qty and remove; guest email gate (email + "Continue as Guest", "Already have an account? Login") when anonymous; Address panel: "Use Saved Address" (registered), First Name, Last Name, Address, Address Line 2, e-mail, City, Pin (6 digits), Phone (+91, 10 digits), State, Country (India), "Save this address"; Grand Total panel with illustration: Price (N items), Tax, Delivery Charges, Apply Coupon, Discount, Gift points toggle, Total Amount, "Pay Now".
- **Payment modal:** book-illustration background; "Complete Payment" + "Payable Amount: ₹X" (server); tabs Credit Card, Debit card, UPI, Wallet; card: Card Number (XXXX-XXXX-XXXX-XXXX), Name on Card, CVV, Date of Expiry (MM/YYYY); UPI ID; Wallet balance; Pay Now; DEV-only "Simulate failure".
- **Success overlay:** green check, "Your purchase of the following reads is successful", purchased BookCards, "Continue your Shopping". Guest extras: Order Number box + "Track your order →" + "Create a password to save your account" form + "Skip for now".
- **Orders, Order detail, Wishlist, My Writers (Your Writers / New from Your Writers / Discover Writers), Track Order, Login, Register, 404, Admin.**
- Every data page: SkeletonCard/LoadingSpinner while loading, EmptyState when empty, ConfirmDialog for destructive actions, toasts for results.

---

## 11. Git & Workflow

- Repo root = `final/`. Branches: `main` (protected), `feature/api-implementation` (MT-01–MT-22), `feature/web-implementation` (MT-23–MT-35, branched from main after PR #1 merge), `feature/deployment-docs` (MT-36–MT-37).
- One commit per micro-task: `MT-xx: <title>`. Push after each MT.
- PR per branch → main on personal GitHub, manager as reviewer. PR body: summary, MT checklist, test results, Swagger link, Insomnia collection path, screenshots (web PR).
- Mark `Status: [x] done` in this file after each MT.

---

## 12. Micro-Tasks

Format: Goal · Depends · Steps · ✅ Verify · 🧪 Tests. Run `npm test` (relevant package) before commit.

### PHASE A — Foundation (branch feature/api-implementation)

#### MT-01 — Monorepo scaffold, shared package, dev database
Status: [x] · Depends: —
Steps:
1. `git init`, create `main`, then `feature/api-implementation`. Add .gitignore (node_modules, .env, .env.test, dist, coverage, .DS_Store), .editorconfig, .nvmrc (20), .dockerignore.
2. Root package.json: private, `"type": "module"`, workspaces `packages/*`, devDeps `concurrently`. Scripts: `dev` (api+web concurrently), `dev:api`, `dev:web`, `build`, `test` (all workspaces), `db:migrate`, `db:seed`, `db:reset`, `db:studio`, `spec:validate`.
3. `packages/shared`: package.json `{ name: "bookworm-shared", type: "module", exports: "./src/index.js" }`; implement currency, constants, pricing, dates, ids (Section 4); Vitest config.
4. `packages/api`: package.json (type module, dep `bookworm-shared: "*"`); install express@5 cors helmet morgan dotenv bcryptjs jsonwebtoken express-rate-limit express-openapi-validator@5 swagger-ui-express@5 yaml @prisma/client@6; dev: prisma@6 vitest@3 supertest nodemon @apidevtools/swagger-parser. Create .env, .env.example, .env.test (DATABASE_URL → bookworm_test, BCRYPT_ROUNDS=4, RATE_LIMIT_LOOKUP_MAX=1000).
5. `packages/web`: `npm create vite@latest packages/web -- --template react`, then pin react@18 react-dom@18; install react-router-dom@6 axios zustand@5 react-hot-toast prop-types @headlessui/react; dev: tailwindcss@3 postcss autoprefixer vitest@3 jsdom @testing-library/react@16 @testing-library/jest-dom @testing-library/user-event msw@2. Dep `bookworm-shared: "*"`. Create .env/.env.example with VITE_API_URL.
6. docker-compose.yml with `postgres` service only (postgres:16-alpine, port 5432, volume, healthcheck) + `docker/postgres/init.sql` creating `bookworm` and `bookworm_test`.
7. `.github/copilot-instructions.md`: conventions from Sections 4, 6, 8 (ESM, paise, error shape, route order, BigInt casts, no PAN storage, tests per MT, Vitest).
8. `npm install` at root; `docker compose up -d postgres`.
✅ Verify: `npm test -w packages/shared` green · `node -e "import('bookworm-shared').then(m=>console.log(m.formatINR(14900)))"` prints ₹149 from packages/api · Vite dev server starts · both DBs exist · .env files ignored, .env.example committed.
🧪 Tests (shared): formatINR(14900)=₹149, (39900)=₹399, (0)=₹0, (6096)=₹60.96, (12345600)=₹1,23,456; formatINRFixed(50800)=₹508.00; toPaise(99.5)=9950; computeOrderTotals: design cart 14900+35900 with BOOK10 → subtotal 50800, tax 6096, delivery 0, discount 10000, total 46896; delivery 4900 under ₹500; eBook-only delivery 0; PERCENT cap; min order not met → 0; gift discount capped at payable; pointsEarned; addBusinessDays Fri+3 = Wed; generateOrderNumber matches /^BW-[0-9A-HJKMNP-TV-Z]{8}$/.

#### MT-02 — Prisma schema, migration, Prisma client
Status: [x] · Depends: MT-01
Steps: write all 21 models + enums (Section 5) with relations, indexes (books.title, books.publishedAt, book_categories.categoryId, orders.userId, orders.orderNumber); `npx prisma migrate dev --name init`; `src/lib/prisma.js` singleton; `db:migrate:test` script (`dotenv -e .env.test -- prisma migrate deploy` or equivalent).
✅ Verify: migrate status 1 applied on both DBs · Prisma Studio shows 21 tables · orders.userId NOT NULL · books.stockQuantity default 100.
🧪 Tests: `tests/schema.test.js` — connects; every model `count()` returns number.

#### MT-03 — Seed: catalog
Status: [x] · Depends: MT-02
Steps: `prisma/seed/` with data files; upsert categories (with parents), publishers, authors, 36 books (book_categories with one isPrimary), book_relations, store + policies, all with fixed ids/slugs. Export `seedCatalog(prisma)`. `"prisma": { "seed": "node prisma/seed/index.js" }`.
✅ Verify: 19 categories with showInSidebar true · 36 books · 12 authors · 4 publishers · every book has exactly one primary category · Joy of Minimalism = 14900 paise, publisher ABC Publishers · cover URLs load.
🧪 Tests: `tests/seed.catalog.test.js` — counts above; design books exact prices/formats/authors; ≥4 non-English books; no "All" category row.

#### MT-04 — Seed: users, orders, coupons, follows
Status: [x] · Depends: MT-03
Steps: upsert 3 users (bcrypt), customer address, Orders A and B with items, payments, shipments + events, gift transactions, coupons, follows. Export `seed(prisma)` that runs catalog + users. Wire `tests/globalSetup.js`: `prisma migrate reset --force --skip-seed` on bookworm_test then `seed(prisma)`. `tests/setup.js` loads `.env.test`. `tests/factories.js`: `createUser({role})` with unique email, `loginAs(email)`, `authHeader(token)`.
✅ Verify: `npm run db:seed` twice without error and identical counts · customer has 200 points, wallet 100000, 2 DELIVERED orders, 2 follows.
🧪 Tests: `tests/seed.users.test.js` — counts; idempotency by calling `seed(prisma)` again and comparing counts of users/orders/coupons.

#### MT-05 — OpenAPI 3.0 spec v1 (spec-first)
Status: [x] · Depends: MT-04
Steps: `openapi/openapi.yaml` with info, servers, BearerAuth, tags (Auth, Users, Catalog, Authors, Cart, Wishlist, Coupons, Orders, Payments, Shipments, Store, Admin, System); every path in Section 7 with params (uuid formats), request bodies, responses (incl. error schema), `security: []` on public paths; components/schemas (User, Address, Category, Publisher, Author, Book, BookDetail, Review, CartItem, Cart, Coupon, OrderTotals, Order, OrderItem, Payment, Shipment, ShipmentEvent, Paginated, Error); examples from seed data. Script `spec:validate` with swagger-parser.
✅ Verify: `npm run spec:validate` 0 errors · every Section 7 endpoint present · lookup/register/login/guest-session/catalog marked public.
🧪 Tests: `tests/spec.test.js` — parser validates; asserts presence of key paths.

#### MT-06 — Express app shell + test harness
Status: [x] · Depends: MT-05
Steps: `createApp(options)`: trust proxy, helmet, cors(CORS_ORIGIN), express.json, morgan (not in test), Swagger UI at `/api/docs` (spec path via `import.meta.dirname`), express-openapi-validator (apiSpec, validateRequests true, validateResponses = options.enableResponseValidation ?? NODE_ENV==='test', ignore /api/docs), `GET /api/health` → {status, version, timestamp}, 404 handler, error handler mapping validator errors → 400 `VALIDATION_ERROR`, AppError → status/code. `server.js`: dotenv, createApp, start sweeper placeholder, listen. vitest.config.js: environment node, globalSetup, setupFiles, `fileParallelism: false`.
✅ Verify: `npm run dev:api` starts · /api/health 200 · /api/docs loads · unknown route 404 JSON · CORS header for localhost:5173.
🧪 Tests: `tests/health.test.js` — health 200; 404 shape; invalid uuid path param → 400 VALIDATION_ERROR (use an existing documented route once implemented, else health only).

### PHASE B — Identity

#### MT-07 — Auth: register, login, profile, middlewares
Status: [x] · Depends: MT-06
Steps: auth module; register (lowercase email, 409 `EMAIL_IN_USE`, password ≥8 with uppercase + number, role CUSTOMER, JWT 7d); login (401 `INVALID_CREDENTIALS` for unknown/wrong/guest-without-password); JWT payload {id, email, role, firstName, lastName, gsid?}; `authenticate({optional})` (expired → 401 `TOKEN_EXPIRED`, invalid → 401 `UNAUTHORIZED`; optional ignores invalid token); `requireRole`, `requireRegistered`; GET/PUT /auth/profile (giftPoints, walletBalancePaise/Inr).
✅ Verify: checklist per Section 7 auth rows; passwordHash never returned.
🧪 Tests: `auth.register-login.test.js` (201 + token, duplicate 409, weak password 400, login 200, wrong pwd 401, unknown 401); `auth.middleware.test.js` (no token 401, malformed 401, expired 401 TOKEN_EXPIRED via short-lived signed token, profile 200, admin route with CUSTOMER 403 using a test-only route registered via createApp option or the admin health route).

#### MT-08 — Guest session + addresses
Status: [x] · Depends: MT-07
Steps: `POST /auth/guest-session` per Section 8 (409 ACCOUNT_EXISTS for registered emails; new gsid per call); guest-scope helper `assertOrderAccess(user, order)`; addresses CRUD under `/users/me/addresses` (registered only; default switching in transaction; 404 for another user's address id).
✅ Verify: guest JWT role GUEST, exp ≈ 24h, contains gsid · same email twice → same user id, different gsid · customer@test.com → 409 · registered user's role/password untouched after attempted guest-session.
🧪 Tests: `auth.guest.test.js` (above cases, missing email 400); `users.addresses.test.js` (empty list, create, set default clears previous, update, delete, other user's id → 404, GUEST → 403).

### PHASE C — Catalog

#### MT-09 — Categories, publishers, books list
Status: [x] · Depends: MT-08
Steps: GET /categories (tree, sidebar order), GET /publishers, GET /publishers/:id; GET /books with all filters/sort/pagination (Section 7–8), category filter includes children; each book returns author {id,name,slug}, publisher, categories [{name,slug,isPrimary}], pricePaise/priceInr, deliveryText. Register static routes before `/:id`.
✅ Verify: category=self-help returns only self-help books · publisher=abc-publishers works · search=minimalism finds Joy of Minimalism · price range, sort, pagination correct · language=Hindi works.
🧪 Tests: `catalog.books.test.js` — each filter, combined filters, sort orders, pagination math, pageSize cap, priceInr format.

#### MT-10 — Book detail, reviews, related, up-sell/cross-sell
Status: [x] · Depends: MT-09
Steps: GET /books/:id (author bio/photo, publisher, categories, primary breadcrumb [parent, primary], reviews with first names, relatedBooks ≤5, upsell[], crossSell[], deliveryText, salesCount, ratingAvg/Count, isWishlisted/isFollowingAuthor when authenticated); POST /books/:id/reviews (registered, 1–5, ≤100 chars, upsert, recompute rating).
✅ Verify: invalid uuid 400 · unknown uuid 404 · Joy of Minimalism shows cross-sell The Focus Reset · review upsert changes rating.
🧪 Tests: `catalog.detail.test.js` — shape, 404/400, related excludes self, review auth 401, GUEST 403, rating 6 → 400, comment 101 chars → 400, upsert.

#### MT-11 — Recommendations, bestsellers, new launches
Status: [x] · Depends: MT-10
Steps: `recommendation.service.js` with `$queryRaw` (casts), Section 8 scoring; endpoints with optional auth; response `{ source, items }`.
✅ Verify: anonymous → editors_pick (Art of Focus, Art of Learning, Path to Success) · customer → personalised, excludes Less But Better/The Focus Reset, includes self-help design books · bestsellers top 3 = Midnight Hour, Beneath the Stars, Final Frontier · new launches top 3 = Joy of Minimalism, Vanishing House, Lost Kitten.
🧪 Tests: `catalog.recommendations.test.js` — the above; fresh@test.com → editors_pick; JSON has no BigInt errors.

#### MT-12 — Authors + follow system
Status: [x] · Depends: MT-11
Steps: GET /authors (+isFollowing), GET /authors/:id (books, bookCount), following, following/new-releases (12 newest), suggestions, follow/unfollow (MANUAL). Static routes before `/:id`.
✅ Verify: 12 authors · customer sees 2 following · follow 201, duplicate 409, unfollow 200, unfollow again 404 · suggestions exclude followed.
🧪 Tests: `authors.test.js` — above, GUEST follow 403, use fresh factory user for mutation tests.

### PHASE D — Commerce

#### MT-13 — Cart, merge, buy-again
Status: [x] · Depends: MT-12
Steps: cart service returning `{ items:[{book, quantity, lineTotalPaise/Inr}], itemCount, subtotalPaise/Inr }`; add (stock check 409), update (0 removes), remove, clear, merge (Section 8), buy-again (registered, owner, skip out-of-stock, returns skipped list).
✅ Verify: empty cart shape · add twice increments · over-stock 409 · merge sums + caps · buy-again on Order A adds 2 books · user isolation.
🧪 Tests: `cart.test.js` — all above with factory users.

#### MT-14 — Wishlist
Status: [x] · Depends: MT-13
Steps: list (book details), add (idempotent 200), remove (404 if absent); registered only.
✅ Verify / 🧪 Tests: `wishlist.test.js` — add, idempotent add, list, remove, remove-missing 404, GUEST 403, anonymous 401.

#### MT-15 — Coupons validate + pricing integration
Status: [x] · Depends: MT-14
Steps: POST /coupons/validate {code, subtotalPaise} → {valid, discountPaise/Inr, reason?} (invalid, expired, inactive, min-order, usage limit). Checkout service will call shared `computeOrderTotals`.
✅ Verify: BOOK10 on ₹508 → ₹100 · SAVE20 on ₹1500 → capped ₹200 · EXPIRED10 → invalid EXPIRED · BOOK10 on ₹200 → MIN_ORDER_NOT_MET.
🧪 Tests: `coupons.test.js` — each case.

#### MT-16 — Checkout with stock reservation + sweeper
Status: [x] · Depends: MT-15
Steps: POST /orders/checkout per Section 8 (body: addressId | address, saveAddress, couponCode, giftPointsToRedeem, paymentMethod); validate points ≤ balance and GUEST cannot redeem points; `jobs/reservationSweeper.js` with exported `expireReservations(now)` + `startSweeper()` called from server.js.
✅ Verify: order PENDING with orderNumber BW-…, reservedUntil +30 min, totals = shared function · stock decremented · cart unchanged · coupon usedCount unchanged · points unchanged · insufficient stock 409 and nothing changed · second checkout releases first PENDING · expireReservations restores stock and sets EXPIRED.
🧪 Tests: `checkout.test.js` — above; design cart totals (₹508 + BOOK10 → total 46896 paise); guest checkout sets guestSessionId + contactEmail.

#### MT-17 — Payments: initiate, confirm, wallet
Status: [x] · Depends: MT-16
Steps: payments module per Section 8; store only last4 / masked UPI; GET /payments/wallet; auto-follow; shipment creation via shipment service (stub in this MT if MT-18 not done — create minimal createShipment now, extend in MT-18).
✅ Verify: success → CONFIRMED/PAID, cart items removed, coupon usedCount +1, points debited and credited (transactions), salesCount +1, shipment PROCESSING, authors followed · forceFailure → FAILED, order still PENDING, retry succeeds · expired reservation → 409 · WALLET insufficient → FAILED · eBook-only order → shipment DELIVERED · DB contains no full card number.
🧪 Tests: `payments.test.js` — each case; guest with other gsid → 403.

#### MT-18 — Shipments: tracking, rate, events, simulator, returns
Status: [x] · Depends: MT-17
Steps: shipment service (createShipment FORWARD/RETURN, addEvent, advance), GET /shipments/order/:orderId (with events timeline), POST /shipments/calculate-rate, POST /admin/shipments/:id/advance (ADMIN) syncing order status (Section 8).
✅ Verify: tracking TRK-… · advance sequence to DELIVERED sets order DELIVERED · rate free ≥ ₹500, ₹49 below, eBook-only free · ETA skips weekends.
🧪 Tests: `shipments.test.js` — rate cases, advance sequence, non-admin 403, events recorded.

#### MT-19 — Orders: history, detail, cancel/refund, return, modify address
Status: [x] · Depends: MT-18
Steps: GET /orders (paginated, newest first, thumbnails, flags), GET /orders/:id (items, address snapshot, payment method + last4, shipments + events, flags), cancel (Section 8 refunds), return (creates RETURN shipment; RETURNED + refund when advanced to DELIVERED), PATCH address.
✅ Verify: customer sees 2 seeded orders · Order A canCancel false, canReturn false (30 days) · Order B canReturn true · fresh order cancel → stock restored, points reversed, coupon usedCount −1, payment REFUNDED, wallet refunded if WALLET · cancel after SHIPPED → 409 · other user's order → 404.
🧪 Tests: `orders.test.js` — each rule; time-based checks using orders with backdated createdAt via Prisma.

#### MT-20 — Guest order lookup + account conversion
Status: [x] · Depends: MT-19
Steps: public lookup router (rate-limited, generic 404); PUT /auth/set-password per Section 8.
✅ Verify: guest flow end-to-end: guest-session → cart → checkout → pay → lookup(email, orderNumber) 200 → set-password → login → GET /orders includes the guest order · wrong email/orderNumber 404 · set-password without order in gsid → 403 · CUSTOMER calling set-password → 400 · 4th lookup on createApp({lookupLimit:3}) → 429.
🧪 Tests: `guest.flow.test.js` — full flow + negatives.

#### MT-21 — Admin / Store API
Status: [x] · Depends: MT-20
Steps: GET /stores/:slug (public, with policies); ADMIN CRUD for books (with categories, relations), categories, publishers, authors, coupons, stores, policies; GET /admin/orders (filters status, paginated).
✅ Verify: admin creates a book → appears in catalog · customer → 403 · deleting a category with books → 409.
🧪 Tests: `admin.test.js` — CRUD happy paths + 403 + 409.

#### MT-22 — Contract reconciliation, Insomnia, PR #1
Status: [x] · Depends: MT-21
Steps: run full api suite with response validation on; fix spec/code drift; add examples; export Insomnia collection (environment base_url, token vars) to `docs/insomnia/bookworm.json`; push branch; open PR #1 "Implement BookWorm API".
✅ Verify: `npm test -w packages/api` green with response validation · spec:validate green · Insomnia collection imports and runs login → checkout → pay.
🧪 Tests: none new; full suite must pass.

### PHASE E — Web (branch feature/web-implementation, from main after PR #1)

#### MT-23 — Web shell, theme, routing, layout
Status: [x] · Depends: MT-22
Steps: Tailwind 3 config with `bw-*` tokens (Section 10), base CSS; AppRouter: public `/`, `/books/:id`, `/authors/:id`, `/checkout`, `/cart`→`/checkout`, `/login`, `/register`, `/track-order`; registered `/orders`, `/orders/:id`, `/wishlist`, `/writers`; admin `/admin/*`; `*` → NotFound. `RequireRegistered`, `RequireAdmin` guards (redirect `/login?redirect=`). AppLayout with Navbar + Toaster. Placeholder pages. Vitest jsdom + MSW setup.
✅ Verify: anonymous can open `/`, `/books/:id`, `/checkout`, `/track-order` · `/orders` redirects to login · unknown path → 404 · theme visible.
🧪 Tests: `router.test.jsx` — public vs guarded routes.

#### MT-24 — API client + stores
Status: [x] · Depends: MT-23
Steps: `api/client.js` (baseURL, Bearer injection, 401 policy: registered → logout + redirect login; guest → clear token + toast "Session expired, enter email again"; optional-auth public GETs retried without token); `useAuthStore` (persist key `bookworm-auth`; user, token; isAuthenticated, isGuest, isRegistered, isAdmin; login, logout, setGuestSession); `useCartStore` (mode local|server; local persisted items; actions call API in server mode; `syncAfterAuth()` posts merge then switches to server; itemCount, subtotal via shared).
✅ Verify: anonymous add → localStorage; login → merge → server cart contains items, local cleared · reload keeps session · 401 behaviours.
🧪 Tests: `useCartStore.test.js` (local add/update/remove, totals, merge call with MSW), `client.test.js` (header injection, 401 policies).

#### MT-25 — Shared components
Status: [x] · Depends: MT-24
Steps: LoadingSpinner, SkeletonCard, EmptyState, ConfirmDialog (Headless UI Dialog), StatusBadge (all statuses), StarRating (interactive/read-only), BookCard (design layout, hover/focus Add to Cart, compact variant), AuthorCard, Breadcrumb, OrderSummaryPanel, AddressForm (validation pin 6 digits, phone 10 digits), ShipmentTimeline; PropTypes on all; `/dev/components` (DEV only).
✅ Verify: showcase renders all · keyboard focus shows Add to Cart.
🧪 Tests: BookCard (price ₹149, eBook "Instant download", add-to-cart calls store), ConfirmDialog, EmptyState, StarRating, StatusBadge, AddressForm validation.

#### MT-26 — Login, Register, NotFound
Status: [x] · Depends: MT-25
Steps: forms per design theme; on success → store login → `syncAfterAuth()` → redirect param or `/`; field errors; 409 email in use message.
✅ Verify: customer login → home · wrong password toast · register mismatched passwords inline error · cart merge after login.
🧪 Tests: `LoginPage.test.jsx`, `RegisterPage.test.jsx` with MSW.

#### MT-27 — Home / Catalogue page
Status: [x] · Depends: MT-26
Steps: GenreSidebar (All + 19 + Publishers), FilterBar (Search debounced, Language, Format, Price Range buckets ₹0–200/200–400/400–600/600+, Sort), sections vs results grid, active filter chips, pagination, URL sync via `useSearchParams`, skeletons, EmptyState.
✅ Verify: anonymous home shows 3 sections matching design books · logged-in customer "Recommended" shows personalised · selecting Self-help shows grid + URL `?category=self-help` · refresh keeps filters · publisher link filters.
🧪 Tests: `HomePage.test.jsx` — sections render, filter switches to grid, URL params applied.

#### MT-28 — Book detail page
Status: [x] · Depends: MT-27
Steps: Section 10 layout; wishlist toggle (anonymous/guest → login redirect); follow author; review form (registered) with 0/100 counter; related, cross-sell, up-sell; invalid id → NotFound.
✅ Verify: Joy of Minimalism page matches design · Add to Cart updates badge · review appears after submit.
🧪 Tests: `BookDetailPage.test.jsx` — renders data, review counter limit, wishlist toggle.

#### MT-29 — Cart + Checkout page
Status: [x] · Depends: MT-28
Steps: Section 10 layout; guest gate → guest-session (409 → "Account exists, please login") → `syncAfterAuth()`; editable qty/remove with ConfirmDialog; AddressForm + Use Saved Address + Save address; coupon apply via /coupons/validate; gift points toggle (registered with points); preview totals via shared `computeOrderTotals`; Pay Now → POST /orders/checkout → open PaymentModal with server totals; EmptyState when cart empty.
✅ Verify: design cart (Joy of Minimalism + Path to Success) shows Price ₹508.00, Delivery Free, BOOK10 discount ₹100 · guest gate works · registered saved address prefill · insufficient stock message.
🧪 Tests: `CheckoutPage.test.jsx` — guest gate, coupon apply, totals, validation errors.

#### MT-30 — Payment modal + success overlay
Status: [ ] · Depends: MT-29
Steps: PaymentModal (tabs, card formatting/masking, UPI, Wallet balance with insufficient state, DEV simulate failure, spinner, error + retry, reservation-expired message → back to checkout); PaymentSuccessOverlay (design + guest order number, track link, conversion form → set-password → store login → toast; Skip).
✅ Verify: registered pay → success → cart badge 0 · guest pay → order number + track link + conversion works · failure then retry succeeds.
🧪 Tests: `PaymentModal.test.jsx` (tabs, payload has no CVV persisted beyond request, failure + retry), `PaymentSuccessOverlay.test.jsx` (guest vs registered content).

#### MT-31 — Orders list + detail
Status: [ ] · Depends: MT-30
Steps: OrdersPage (orderNumber, date, thumbnails, total, StatusBadge, Buy Again, Cancel per canCancel with ConfirmDialog); OrderDetailPage (items, address, payment, ShipmentTimeline, Return per canReturn, Change address per canModifyAddress).
✅ Verify: seeded orders visible · Buy Again → cart · cancel fresh order · return Order B.
🧪 Tests: `OrdersPage.test.jsx` — flags drive buttons.

#### MT-32 — Wishlist page
Status: [ ] · Depends: MT-31
Steps: grid of BookCards, remove, add to cart, EmptyState.
✅ Verify / 🧪 Tests: `WishlistPage.test.jsx` — list, remove, empty state.

#### MT-33 — My Writers page
Status: [ ] · Depends: MT-32
Steps: Your Writers (AuthorCard, unfollow with ConfirmDialog, optimistic), New from Your Writers (BookCards), Discover Writers (follow, optimistic); independent loading; EmptyState.
✅ Verify: customer sees Daniel Reed + 1 more · follow suggestion moves it to Your Writers.
🧪 Tests: `MyWritersPage.test.jsx`, `AuthorCard.test.jsx`.

#### MT-34 — Track Order page
Status: [ ] · Depends: MT-33
Steps: public form (email + order number BW-…), prefill from `?orderNumber=&email=`, POST /orders/lookup without auth header, result card (status, items, timeline, ETA), not-found message, 429 message, login link.
✅ Verify: guest order found · wrong details message.
🧪 Tests: `TrackOrderPage.test.jsx`.

#### MT-35 — Admin pages + PR #2
Status: [ ] · Depends: MT-34
Steps: `/admin` layout; tables + forms for books (categories multi-select, relations), categories, publishers, authors, coupons, store + policies; orders list with "Advance shipment" button. Push; PR #2 "Implement BookWorm web app" with screenshots.
✅ Verify: admin creates book visible on home grid · advance shipment updates customer order detail · customer cannot open /admin.
🧪 Tests: `AdminBooks.test.jsx` — create form validation; guard redirect.

### PHASE F — Delivery (branch feature/deployment-docs)

#### MT-36 — Docker & deployment readiness
Status: [ ] · Depends: MT-35
Steps: `packages/api/Dockerfile` (build context = repo root; node:20-alpine; npm ci for api+shared workspaces; prisma generate; non-root user; entrypoint: `prisma migrate deploy`, seed when SEED_ON_START=true, `node server.js`); `packages/web/Dockerfile` (build arg VITE_API_URL=/api; nginx:alpine; `nginx.conf` with `try_files $uri /index.html` and `location /api/ { proxy_pass http://api:3001; }`); compose: postgres (healthcheck), api (`depends_on: service_healthy`, environment DATABASE_URL host `postgres`, TRUST_PROXY=1, SEED_ON_START=true, CORS_ORIGIN http://localhost:5173), web (port 5173:80); root `.dockerignore`.
✅ Verify: `docker compose up --build` clean · http://localhost:5173 loads, deep-link refresh works · /api/health via nginx · data persists across restart · seed idempotent on restart.
🧪 Tests: manual checklist; `npm test` still green.

#### MT-37 — Documentation, README, final PR
Status: [ ] · Depends: MT-36
Steps: README (overview, screenshots, quick start, demo accounts, coupons, scripts, Swagger, Insomnia import, **workflow-slide → Node mapping table**, docs link); `docs/` 7 files (architecture with Mermaid diagram, data-model with ER diagram, api-reference, frontend-components, data-flows: guest flow, checkout/payment/reservation, cancel/return/refund, recommendations; developer-guide with common errors; demo-script); JSDoc on service functions; coverage `vitest --coverage` > 70% api + web; PR #3.
✅ Verify: fresh clone → follow developer-guide → running in < 10 min · coverage threshold met · all PRs merged.

**Workflow mapping table (for README):**
| Slide step | Node implementation |
|---|---|
| 1 Analyze wireframe | Sections 5, 10 of this plan |
| 2 Open AI IDE | VS Code + Copilot agent (one MT per session) |
| 3 Generate OpenAPI spec | MT-05 `openapi.yaml` |
| 4 Generate code from spec | MT-06–MT-21, validated by express-openapi-validator |
| 5 Project structure | routes/controllers/services + Prisma models |
| 6 Configure database (application.properties) | PostgreSQL 16 + `.env` |
| 7 Build & run (mvn) | `npm ci` · `npm run dev` · `npm run build` |
| 8 Test APIs (Insomnia) | Vitest + Supertest, Swagger UI, Insomnia collection |
| 9 Git check-in | feature branches + PRs |

**Demo script (10 steps):** 1 Anonymous home (editor's picks, bestsellers, new launches) → 2 Browse Self-help, search, filter, publisher → 3 Book detail (related, cross-sell, up-sell, reviews) → 4 Login customer: personalised recommendations, cart merge → 5 Checkout: BOOK10 + 200 gift points + wallet/credit card pay → 6 Success, My Orders, Buy Again, cancel within 48h (refund) → 7 Return Order B, admin advances return shipment → refund → 8 Logout, guest checkout, order number, create password → 9 Track Order page → 10 My Writers, Swagger UI, Insomnia, `docker compose up`.

---

## 13. Execution Rules

1. Strict order MT-01 → MT-37; respect Depends.
2. One MT per agent session; prompt the agent with the MT section only + "follow PLAN.md conventions".
3. Write the listed tests in the same MT; all tests and the ✅ checklist must pass before commit.
4. If a later MT needs a change in an earlier contract, update `openapi.yaml` first, then code, then tests.
5. Commit `MT-xx: <title>`, push, tick Status in this file.
6. Never commit `.env`; never log or store card numbers/CVV.

## 14. Global Verification

- `npm test` at root green (shared, api, web); api responses validated against `openapi.yaml`.
- `npm run dev` → web :5173, api :3001, docs /api/docs.
- Demo script passes end-to-end.
- `docker compose up --build` → full app at :5173.

## 15. Known Assumptions & Risks

- 12% tax is design-driven (Indian GST on printed books is 0%) — configurable constant.
- Guest identity has no email verification; a person knowing a guest's email could later claim it after placing their own order. Mitigated by gsid scoping; OTP out of scope.
- Design mock totals are inconsistent; computed values are authoritative.
- picsum/pravatar images need internet during demo; optionally download to `packages/web/public/covers` for offline demo.

## 16. How to Start

1. Install prerequisites: Node 20 LTS, Git, Docker Desktop, Insomnia, a GitHub repo (private, manager invited).
2. Save this file as `Plans/bookworm-final-plan.md` and copy into repo root as `PLAN.md` during MT-01.
3. In VS Code open folder `final/`, switch Copilot to Agent mode.
4. Session 1 prompt: "Implement MT-01 from PLAN.md exactly. Write the listed tests, run them, run the ✅ checklist, report results. Do not start MT-02."
5. Review diff, run checks yourself, commit `MT-01: Monorepo scaffold`, push, tick status.
6. Repeat per MT; open PR #1 after MT-22, PR #2 after MT-35, PR #3 after MT-37.
7. Record the video using the demo script.
