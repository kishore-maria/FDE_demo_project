# API reference

- **Base URL:** `http://localhost:3001/api` (dev) · `http://localhost:5173/api` (Docker, via nginx)
- **Interactive docs:** Swagger UI at [`/api/docs`](http://localhost:3001/api/docs); raw spec at `/api/docs/openapi.json`; source `packages/api/openapi/openapi.yaml` (the contract — change it first).
- **Insomnia:** import [`docs/insomnia/bookworm.json`](insomnia/bookworm.json). Requests chain automatically (`token`, `admin_token`, `guest_token`, `order_id`, `session_id`, `shipment_id`).

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <jwt>` from register / login / guest-session. Customer tokens last 7 d, guest tokens 24 h |
| Money | Integer paise + formatted INR: `{ "pricePaise": 14900, "priceInr": "₹149" }` |
| Lists | `{ items, page, pageSize, total, totalPages }` — `page` ≥ 1, `pageSize` 1–48 (default 12) |
| Errors | `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": … } }` |
| Ids | UUIDs; malformed path ids → `400 VALIDATION_ERROR` (never 500) |
| Unknown fields | Rejected (`additionalProperties: false`) → 400 |

## Endpoints

Auth column: **public** · **any** (any valid token, guest included) · **registered** (CUSTOMER/ADMIN) · **owner** · **admin**.

### Auth & profile

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password, firstName, lastName }` → `{ token, user }` |
| POST | `/auth/login` | public | `{ email, password }` |
| POST | `/auth/guest-session` | public | `{ email }`; 409 `ACCOUNT_EXISTS` for registered emails |
| GET/PUT | `/auth/profile` | any | name / phone |
| PUT | `/auth/set-password` | guest / order token | Converts a guest with a paid order (current session, or the order verified via Track Order) into a customer; orders and gift points carry over |
| GET/POST | `/users/me/addresses` | registered | First address becomes default |
| PUT/DELETE | `/users/me/addresses/{id}` | registered | |
| PUT | `/users/me/addresses/{id}/default` | registered | |

### Catalogue

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/categories` | public | Tree (top level + children) |
| GET | `/publishers`, `/publishers/{id}` | public | |
| GET | `/books` | public | `category`, `publisher`, `author` (slugs), `format`, `language`, `minPrice`/`maxPrice` (paise), `search`, `sort` = `relevance·price_asc·price_desc·rating·newest`, paging |
| GET | `/books/recommended` | public (optional auth) | `source: personalised` for customers with history, else `editors_pick` |
| GET | `/books/bestsellers`, `/books/new-launches` | public | Top 12 |
| GET | `/books/{id}` | public (optional auth) | Detail + reviews, related reads, up-sell, cross-sell, `isWishlisted`, `isFollowingAuthor` |
| POST | `/books/{id}/reviews` | registered | `{ rating 1–5, comment ≤ 100 }`, one per user (upsert) |
| GET | `/authors`, `/authors/{id}` | public (optional auth) | `isFollowing` when signed in |
| GET | `/authors/following`, `/authors/following/new-releases`, `/authors/suggestions` | registered | My Writers |
| POST/DELETE | `/authors/{id}/follow` | registered | 409 `ALREADY_FOLLOWING` / 404 `NOT_FOLLOWING` |
| GET | `/stores/{slug}` | public | Store + policies |

### Cart, wishlist, coupons

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/DELETE | `/cart` | any | |
| POST | `/cart/items` | any | `{ bookId, quantity }` adds to existing quantity |
| PUT/DELETE | `/cart/items/{bookId}` | any | quantity 0 removes |
| POST | `/cart/merge` | any | Browser cart → server cart; returns `skipped` lines |
| POST | `/cart/buy-again/{orderId}` | registered | Re-adds a past order's books; returns `skipped` |
| GET/POST | `/wishlist`, DELETE `/wishlist/{bookId}` | registered | |
| POST | `/coupons/validate` | any | `{ code, subtotalPaise }` → `valid`, `discountPaise`, `reason`, `message` |

### Orders, payments, shipments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/orders/checkout` | any | `{ addressId \| address, saveAddress?, couponCode?, giftPointsToRedeem?, paymentMethod }` → PENDING order, stock reserved 30 min |
| GET | `/orders` | registered | My orders (hides never-paid cancelled/expired) |
| GET | `/orders/{id}` | owner ¹ | Includes `flags: { canCancel, canReturn, canModifyAddress }` |
| POST | `/orders/{id}/cancel` | owner ¹ | ≤ 48 h, before shipping; refunds and takes back the points the order earned |
| POST | `/orders/{id}/return` | owner ¹ | ≤ 7 days after delivery; creates a RETURN shipment |
| PATCH | `/orders/{id}/address` | owner ¹ | Before shipping |
| POST | `/orders/lookup` | public, rate-limited | `{ email, orderNumber }` → TrackedOrder (no address/payment) |
| POST | `/orders/lookup/verify` | public, rate-limited | `{ email, orderNumber, phoneLast4 }` → `{ token, expiresAt, order, giftPoints }` — 30-min token for one guest order; `409 ACCOUNT_ORDER` for registered accounts |
| POST | `/payments/initiate` | owner | `{ orderId, method }` → `sessionId`, payable amount |
| POST | `/payments/confirm` | owner | `{ sessionId, card? \| upiId?, forceFailure? }` → `{ success, reason, order }` |
| GET | `/payments/wallet` | registered | Gift points + wallet balance |
| GET | `/shipments/order/{orderId}` | owner ¹ | |
| POST | `/shipments/calculate-rate` | public | `{ subtotalPaise, allDigital?, pin? }` → charge + PIN-based estimate (`serviceable`, `zone`, date range, dispatch cutoff) |

¹ Registered owners; guests from the session that placed the order; or a guest holding the order-scoped token from `POST /orders/lookup/verify` (that order only). Order-scoped tokens also work for `PUT /auth/set-password` and are refused everywhere else with `403 ORDER_SCOPE_ONLY`.

### Admin (role ADMIN)

`GET/POST /admin/books`, `PUT/DELETE /admin/books/{id}` · same CRUD for `categories`, `publishers`, `authors`, `coupons`, `stores`, `stores/{id}/policies` · `GET /admin/orders?status=` · `POST /admin/shipments/{id}/advance`.

## Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Schema or rule violation (`details` lists fields) |
| 400 | `INVALID_JSON` | Unparseable body |
| 400 | `INVALID_REFERENCE` | Admin payload points at a missing author/publisher/category/book |
| 400 | `PASSWORDS_DO_NOT_MATCH`, `ALREADY_REGISTERED` | set-password |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | Missing/invalid token, bad login |
| 403 | `FORBIDDEN` | Wrong role / not the owner / guest on a registered-only route |
| 403 | `NO_GUEST_ORDER` | set-password without a paid order (in this guest session, or the verified order) |
| 403 | `ORDER_SCOPE_ONLY` | Order-scoped guest token used outside its order routes |
| 404 | `NOT_FOUND`, `NOT_IN_CART`, `NOT_IN_WISHLIST`, `NOT_FOLLOWING` | |
| 409 | `ACCOUNT_EXISTS`, `EMAIL_IN_USE` | Guest session / register with a registered email |
| 409 | `GUEST_ACCOUNT` | Register with an e-mail used for guest orders — claim it via Track Order → Manage |
| 409 | `ACCOUNT_ORDER` | Order verification for an order that belongs to a registered account |
| 409 | `INSUFFICIENT_STOCK` | Cart or checkout above available stock |
| 409 | `ORDER_NOT_PENDING`, `RESERVATION_EXPIRED`, `PAYMENT_ALREADY_PROCESSED` | Payment state |
| 409 | `CANNOT_CANCEL`, `CANNOT_RETURN`, `CANNOT_MODIFY_ADDRESS` | Order windows / status |
| 409 | `SHIPMENT_DELIVERED`, `ORDER_NOT_SHIPPABLE` | Shipment simulator |
| 409 | `ALREADY_FOLLOWING`, `BOOK_HAS_ORDERS`, `CATEGORY_IN_USE`, `CATEGORY_HAS_CHILDREN`, `PUBLISHER_IN_USE`, `AUTHOR_IN_USE`, `CONFLICT` | |
| 422 | `CART_EMPTY`, `INSUFFICIENT_POINTS`, `POINTS_NOT_ALLOWED` | Checkout |
| 422 | `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_EXPIRED`, `COUPON_USAGE_LIMIT_REACHED`, `COUPON_MIN_ORDER_NOT_MET` | Checkout with an invalid coupon |
| 422 | `PIN_NOT_SERVICEABLE` | Checkout or address change to a PIN we don't deliver to (printed books only) |
| 429 | `RATE_LIMITED` | Too many order lookups |
| 500 | `INTERNAL_ERROR` | Unexpected (details are logged server-side only) |

A declined payment is **not** an HTTP error: `POST /payments/confirm` returns `200 { success: false, reason }` and the order stays PENDING so the user can retry until the reservation expires.

## Example: checkout as a customer

```bash
API=http://localhost:3001/api
TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"Test@1234"}' | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"

BOOK=$(curl -s "$API/books?search=joy" | jq -r '.items[0].id')
curl -s $API/cart/items -H "$AUTH" -H 'Content-Type: application/json' -d "{\"bookId\":\"$BOOK\",\"quantity\":3}"

ADDRESS=$(curl -s $API/users/me/addresses -H "$AUTH" | jq -r '.items[0].id')
ORDER=$(curl -s $API/orders/checkout -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"addressId\":\"$ADDRESS\",\"couponCode\":\"BOOK10\",\"paymentMethod\":\"UPI\"}" | jq -r .order.id)

SESSION=$(curl -s $API/payments/initiate -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER\",\"method\":\"UPI\"}" | jq -r .sessionId)
curl -s $API/payments/confirm -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION\",\"upiId\":\"john@okaxis\"}" | jq '{success, status: .order.status, total: .order.totals.totalInr}'
```
