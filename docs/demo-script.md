# Demo script (≈ 10 minutes)

Setup: `npm run dev` (or `docker compose up --build`), browser at http://localhost:5173, Swagger at `/api/docs`, Insomnia with `docs/insomnia/bookworm.json` imported. Start signed out with an empty cart.

| # | Step | What to show | Talking point |
|---|---|---|---|
| 1 | **Anonymous home** | Recommended for You (editor's picks), Bestsellers this Month, New Launches | Anonymous visitors get editor's picks; bestsellers come from real `salesCount` |
| 2 | **Browse** | Sidebar → *Self-help*; search "focus"; Format = Paperback; publisher *ABC Publishers*; remove a chip | Every filter lives in the URL — refresh or share the link and the view is the same |
| 3 | **Book detail** | *Joy of Minimalism*: front/back cover, breadcrumb, Related Reads, Frequently bought together (cross-sell), Upgrade your edition (up-sell), reviews | Relations are managed in Admin → Books |
| 4 | **Login as customer** | Add 2 books while signed out → Login `customer@test.com` / `Test@1234` → cart badge keeps the books; home shows *personalised* recommendations | Browser cart merges into the server cart; recommendations score category + author affinity + rating |
| 5 | **Checkout** | Saved address prefilled; coupon `BOOK10`; toggle 200 gift points; Pay Now → Wallet or Credit Card (`4242 4242 4242 4242`, any name, `123`, a future `MM/YYYY`) | Totals = shared `computeOrderTotals` (12% tax, free delivery ≥ ₹500); only the card's last 4 digits are stored. Optionally tick *Simulate failure* first to show the retry |
| 6 | **Success → My Orders** | Success overlay → My Orders: new order with status badge; **Buy Again** on an old order; **Cancel** the new one (confirm) → Cancelled / Refunded | Cancel is allowed for 48 h before shipping; points, coupon use and stock are restored |
| 7 | **Return Order B** | Open the order delivered 3 days ago → **Return Order** → return tracking appears. Login as `admin@bookworm.com` / `Admin@1234` → Admin → Orders → **Advance shipment** on the return 4× → customer's order shows *Returned* + refund | The shipment simulator drives both forward and return shipments |
| 8 | **Guest checkout** | Logout → add a book → checkout → *Continue as Guest* with a new e-mail → pay by UPI `guest@okaxis` → overlay shows the order number → **Create account** with a password | Guest tokens are scoped to their session (`gsid`); conversion keeps the same user, so the order appears in My Orders |
| 9 | **Track Order** | Logout → Track Order → e-mail + order number (or the overlay's link) → status, items, ETA, timeline; try a wrong e-mail → generic "not found". For a guest order (step 8, choose **Skip for now**): **Manage this order** → last 4 phone digits → change address / cancel, see the gift points waiting → **Create account** | Public, rate-limited lookup that never reveals address or payment details; guest management uses a 30-minute token scoped to that one order |
| 10 | **My Writers & tooling** | My Writers: Your Writers (Daniel Reed + one auto-followed), New from Your Writers, Discover Writers → Follow; Swagger UI `/api/docs`; run the Insomnia collection top to bottom; `docker compose up --build` | Authors are auto-followed on purchase; the API is spec-first and every response is validated in tests |

## Reset between runs

```bash
npm run db:reset   # drops, migrates and seeds again
```

In Docker: `docker compose down -v && docker compose up --build`.
