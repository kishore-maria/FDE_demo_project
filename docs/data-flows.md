# Data flows

Sequence diagrams for the flows with the most moving parts. All money values are paise; totals always come from `computeOrderTotals` in `bookworm-shared`.

## 1. Guest checkout, tracking and account conversion

```mermaid
sequenceDiagram
  actor G as Guest
  participant W as Web (CheckoutPage)
  participant A as API
  participant DB as PostgreSQL

  G->>W: add books (anonymous cart in localStorage)
  G->>W: enter e-mail · "Continue as Guest"
  W->>A: POST /auth/guest-session {email}
  alt e-mail belongs to a customer/admin
    A-->>W: 409 ACCOUNT_EXISTS → "please log in"
  else new or guest e-mail
    A->>DB: upsert GUEST user
    A-->>W: 24 h JWT {role: GUEST, gsid}
  end
  W->>A: POST /cart/merge {items}
  A-->>W: server cart (+ skipped lines)
  W->>A: POST /orders/checkout {address, paymentMethod}
  A-->>W: PENDING order (guestSessionId = gsid)
  W->>A: POST /payments/initiate → POST /payments/confirm
  A-->>W: success + CONFIRMED order
  W-->>G: success overlay: order number + "Track your order →"
  opt Create a password
    G->>W: password + confirm
    W->>A: PUT /auth/set-password
    A->>DB: role GUEST → CUSTOMER (same user id)
    A-->>W: 7 d customer JWT → orders now in My Orders
  end
  G->>W: /track-order?orderNumber=…&email=…
  W->>A: POST /orders/lookup (no Authorization header, rate-limited)
  A-->>W: TrackedOrder (status, items, shipments — no address/payment)
```

Guest rules: a guest token can only see orders and payments whose `guestSessionId` equals its `gsid`; guests cannot list orders, use the wallet, redeem points, review or follow.

## 2. Checkout, payment and the stock reservation

```mermaid
sequenceDiagram
  actor U as Shopper
  participant W as Web
  participant A as API
  participant DB as PostgreSQL
  participant S as Reservation sweeper

  U->>W: Pay Now
  W->>A: POST /orders/checkout
  A->>DB: BEGIN
  A->>DB: cancel my earlier PENDING orders (restock)
  A->>DB: per item: UPDATE books SET stock = stock − qty WHERE stock ≥ qty
  alt any update hit 0 rows
    A-->>W: 409 INSUFFICIENT_STOCK (rollback)
  end
  A->>DB: check coupon + points (not consumed yet) · computeOrderTotals
  A->>DB: INSERT order PENDING, reservedUntil = now + 30 min · COMMIT
  A-->>W: order (cart is NOT cleared yet)
  W->>A: POST /payments/initiate {orderId, method}
  A-->>W: sessionId + payable amount
  W->>A: POST /payments/confirm {sessionId, card | upiId}
  alt declined (or forceFailure)
    A->>DB: payment FAILED, order paymentStatus FAILED (still PENDING)
    A-->>W: 200 {success: false} → "Try again" with a new session
  else approved
    A->>DB: BEGIN (all guarded by status/reservation checks)
    A->>DB: order CONFIRMED + PAID · coupon usedCount++
    A->>DB: debit redeemed points, credit earned points · wallet debit
    A->>DB: remove ordered books from cart · salesCount++
    A->>DB: FORWARD shipment PROCESSING (eBook-only → DELIVERED)
    A->>DB: auto-follow the books' authors · COMMIT
    A-->>W: 200 {success: true, order}
  end
  loop every SWEEPER_INTERVAL_MS
    S->>DB: PENDING orders with reservedUntil < now → EXPIRED, restock
  end
```

If a business rule fails inside the payment transaction (reservation lapsed, coupon limit reached, not enough points or wallet balance) the payment is recorded as FAILED with that reason instead of half-applying changes. Card numbers and CVV are used only for the mock decision; only `cardLast4` is stored.

## 3. Cancel, return and refund

```mermaid
sequenceDiagram
  actor C as Customer
  actor AD as Admin
  participant A as API
  participant DB as PostgreSQL

  C->>A: POST /orders/{id}/cancel
  alt ≤ 48 h, CONFIRMED/PENDING, shipment still PROCESSING
    A->>DB: refundOrder(): restock · refund redeemed points ·<br/>reverse earned points (never below 0) · coupon usedCount−− ·<br/>payment REFUNDED (wallet credited for WALLET payments)
    A-->>C: CANCELLED, paymentStatus REFUNDED
  else
    A-->>C: 409 CANNOT_CANCEL
  end

  C->>A: POST /orders/{id}/return
  alt DELIVERED ≤ 7 days ago and has a physical book
    A->>DB: RETURN_REQUESTED + RETURN shipment (PROCESSING)
  else
    A-->>C: 409 CANNOT_RETURN
  end
  loop "Advance shipment" in Admin → Orders
    AD->>A: POST /admin/shipments/{id}/advance
    A->>DB: next status + event
  end
  Note over A,DB: RETURN shipment reaches DELIVERED →<br/>completeReturn(): refundOrder() + status RETURNED
```

The server computes `flags { canCancel, canReturn, canModifyAddress }` for every order; the web app only shows the buttons the flags allow, and the API re-checks on every request.

## 4. Delivery estimates (PIN zones)

Delivery dates depend on the destination PIN; no courier API is involved. The rules live in `bookworm-shared` (`estimateDelivery`), so the web preview and the server's committed date always agree.

| Destination (warehouse 560001, Bengaluru) | Rule | Business days |
|---|---|---|
| Same city | first 3 digits `560` | 1 |
| Same state | Karnataka circle `56`–`59` | 2 |
| Same region | first digit `5` | 3 |
| Metro | Delhi 110, Mumbai 400, Kolkata 700, Chennai 600, Hyderabad 500, Pune 411, Ahmedabad 380 | 3 |
| Rest of India | anything else | 4–5 (shown as a range) |
| Remote | North-East 78/79, J&K/Ladakh 18/19, Andaman 744, Lakshadweep 68255 | 6–8 (range) |
| Not serviceable | starts with 0 or 9 (APO), not 6 digits | refused |

- **Calendar:** IST, Monday–Friday, skipping national holidays (26 Jan, 15 Aug, 2 Oct, 25 Dec; add festival dates in `delivery.js`).
- **Cutoff:** orders paid before **2 PM IST** on a business day dispatch the same day; later ones dispatch the next business day. The UI shows "Order within 2 h 15 m to ship today".

```mermaid
sequenceDiagram
  actor S as Shopper
  participant W as Web
  participant A as API
  S->>W: navbar "Deliver to" or book page "Check" (PIN 560001)
  W->>W: estimateDelivery(pin) → "Delivery by Tue, 6 Oct" on cards & book page
  Note over W: Registered users default to their default address PIN
  S->>W: checkout address PIN (live preview, Pay Now blocked if not serviceable)
  W->>A: POST /orders/checkout
  A->>A: 422 PIN_NOT_SERVICEABLE unless the PIN is serviceable (printed books)
  W->>A: POST /payments/confirm
  A->>A: shipment.estimatedDelivery = latest date for the PIN at payment time
  S->>W: change address before shipping
  W->>A: PATCH /orders/{id}/address → date re-estimated for the new PIN
```

Without a PIN, catalogue responses say "Usually delivered in 1–8 business days" — no firm date is promised until the PIN is known.

## 5. Recommendations

```mermaid
flowchart TD
  start([GET /books/recommended]) --> who{Signed-in customer<br/>with purchases?}
  who -- no: anonymous / guest / no history --> picks[Editor's picks<br/>source: editors_pick]
  who -- yes --> cand[Candidates: in-stock books<br/>the user has not bought]
  cand --> score["score = 3 × category affinity<br/>+ 2 × author affinity<br/>+ 1 × ratingAvg / 5"]
  score --> top[Top 10 by score<br/>source: personalised]
  top --> empty{any candidates?}
  empty -- no --> picks
  empty -- yes --> done([items])
  picks --> done
```

- **Category affinity** — the share of the user's purchased quantity that falls in the candidate's categories (0–1).
- **Author affinity** — 1 if the user follows the author or bought from them before.
- Bestsellers (`salesCount` desc) and New Launches (`publishedAt` desc) are separate, non-personalised shelves.
- **Discover Writers** (`/authors/suggestions`) — authors with books in categories the user bought from and does not follow yet; empty for users without purchases.
