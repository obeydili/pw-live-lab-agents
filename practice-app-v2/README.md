# Practice-App-v2 (Trade Desk Lite, Live Lab edition)

A small, fake order-ticket app: the **system under test** for the Playwright Live Lab challenges in PW-Live-Lab. It is Trade Desk Lite grown for live-coding practice; the in-app brand stays "Trade Desk Lite", so existing locators keep working.

All data is fake and kept in memory. Restarting the server resets everything.

## Run it

```bash
cd practice-app-v2
npm install
npm start           # http://localhost:3300  (the Live Lab's default)
npm run start:dev   # http://localhost:3100  (dev)
npm run start:qa    # http://localhost:3200  (qa)
npm test            # the app's own node:test suite
```

`PORT` decides the port (`npm start` defaults to 3300). `GET /api/health` answers `{ "ok": true, "app": "practice-app-v2" }` when it is up.

## Users

| Username | Password | Role |
|---|---|---|
| `trader1` | `Password123!` | trader: places orders |
| `trader2` | `Password123!` | trader: a second trader, for ownership checks |
| `approver1` | `Password123!` | approver: approves or rejects orders |

## Pages

| Path | Who | What |
|---|---|---|
| `/login` | anyone | Sign-in form (Username, Password, "Sign in") |
| `/orders` | signed in | "Export CSV" link (`download`, follows the current filters and sort). Order list (10 newest per page by default) with a status badge and a "View" link per row. Filter form (`role="search"`, "Filter orders"): "Status", "Symbol", "Search orders" (debounced 300 ms) and "Clear filters". Sortable "Order ID", "Symbol", "Quantity", "Limit price" headers (button + `aria-sort`; ascending → descending → default). Pagination (`nav` "Pagination"): "Previous page", "Next page", "Rows per page" (10/25/50), `data-testid="page-info"` ("Page 1 of 3") and `data-testid="results-count"` ("Showing 1–10 of 25 orders"). State is kept in the URL. Shortcuts (`data-testid="shortcuts-help"`), never while typing in a field: `/` focuses "Search orders", `Escape` in it clears the search, `Alt+N` opens a new order (traders). States: `#orders-empty`, `#orders-no-match`, `#orders-error` (`role=alert`, "Could not load orders." + "Retry") |
| `/orders/new` | trader | Order ticket: Symbol, Side (Buy/Sell), Quantity, Limit price, "Time in force" (Day / Good till cancelled / Good till date), "Good till date" (a date input shown only for GTD, `min` today), "Mark as urgent" (checkbox) and "Notes (optional)" (textarea, `data-testid="notes-counter"` shows "12 / 200"). A "?" button named "About limit price" next to the Limit price label shows a `role="tooltip"` on hover or focus (hidden on leave, blur and Escape); it is named by hidden text, so `getByLabel('Limit price')` still finds only the input. **Submit order** stays disabled until the ticket is valid (GTD needs a date). |
| `/orders/:id` | signed in | Order details and status, "Time in force", "Good till date", "Urgent" (Yes/No), "Notes" and "Rejection reason", plus native dialogs on a pending order: its trader owner gets "Cancel order" (`confirm`; OK deletes it and opens `/orders?cancelled=ORD-x`, where `#flash` says "Order ORD-x cancelled."), an approver gets "Approve" (no dialog) and "Reject with reason…" (`prompt` "Reason for rejection:"; a blank answer shows the `alert` "A rejection reason is required."). Also "Execution" (`data-testid="execution-status"`) and "Filled at". While the order is Working or Partially Filled, the page asks the API every second until it is Filled |
| `/orders/import` | trader | "Import orders": "Orders CSV file" (file input), `data-testid="selected-file"` ("No file chosen" or the name), "Upload" (with no file: the `alert` "Choose a CSV file first." and no request), then `data-testid="import-summary"` ("2 created, 2 failed"), an "Import results" table (Line, Result) and a toast. Sample files are in `fixtures/` |
| `/quotes/:symbol` | signed in | "ACME quote" heading (document title "ACME quote · Trade Desk Lite") with `data-field="last"`, `"bid"`, `"ask"`; an unknown symbol shows `#quote-error` (`role=alert`). The details page's "Open quote" link opens it in a new tab (`target="_blank"`) |
| `/widgets/quote?symbol=ACME` | signed in | No header: "Market quote", `data-testid="last-price"`, `"bid-price"`, `"ask-price"` and "Use last price", which posts `{ type: "use-price", price }` to the parent page. Without `symbol`: "Choose a symbol to see a quote." The order ticket shows it in `<iframe title="Market quote">`, follows the chosen Symbol, and "Use last price" fills Limit price |
| `/watchlist` | signed in | "Watchlist" (nav link on every page): `<ul aria-label="Available symbols">` and `<ul aria-label="My watchlist">` with `<li draggable="true" data-testid="symbol-ACME">`. HTML5 drag and drop moves symbols between the lists and reorders the watchlist (try `dragTo`); "Add ACME to watchlist" / "Remove ACME from watchlist" buttons do the same. Each change is saved and shows "Watchlist saved." |
| `/approvals` | approver | Pending orders with Approve / Reject buttons per row; `#approvals-error` (`role=alert`, "Could not load approvals." + "Retry") when loading fails |

While data loads, `/orders`, `/approvals` and `/orders/:id` show a spinner (`role="progressbar"`, `data-testid="loading-spinner"`, named "Loading orders", "Loading approvals" and "Loading order"). Every page except login has `#toast-region` (`aria-live="polite"`); toasts are `role="alert"`, `data-testid="toast"`, class `toast-success` or `toast-error`, hold the message and a "×" button named "Dismiss notification", and remove themselves after 4 s. Approve and Reject on `/approvals` show a toast with the same text as `#flash` (use `toContainText`, since the toast also holds "×").

Signed-out visitors are redirected to `/login?next=...`. The wrong role gets a "Not allowed" page (403).

Useful hooks for locators: form fields have labels, buttons have names, and status badges have `data-testid="order-status"`. Two things are awkward on purpose: every orders row has a "View" link, and every approvals row has the same "Approve" and "Reject" buttons. Scope your locator to the right row.

## Sessions

- **UI:** signing in sets an HTTP-only `tdl_session` cookie, which Playwright's `storageState` captures.
- **API:** `POST /api/auth/login` returns `{ token }`. Send it as `Authorization: Bearer <token>`.

Both are kept in memory, so restarting the app logs everyone out. Re-run your auth script after a restart.

## API

| Method & path | Auth | Result |
|---|---|---|
| `GET /api/health` | none | `200 { ok: true, app: "practice-app-v2" }` |
| `POST /api/auth/login` | none | `{ username, password }` → `200 { token, user }`, or `401` |
| `POST /api/auth/logout` | cookie or Bearer | `204`; ends the cookie session and/or the Bearer token sent |
| `GET /api/me` | yes | Current user |
| `GET /api/symbols` | yes | `["ACME", "BLUE", ...]` |
| `GET /api/quotes/:symbol` | yes | `200 { symbol, last, bid, ask, asOf }` (fixed fake prices from the seed, `asOf` now), `404 { error: "Symbol XYZ not found." }` |
| `GET /api/watchlist` | yes | `200 { symbols: [...] }` for the signed-in user (empty at first; reset clears it) |
| `PUT /api/watchlist` | yes | `{ symbols: [...] }` replaces the whole list → `200 { symbols }`; `400 details.symbols` "Symbols must be an array of unique, valid symbols." |
| `GET /api/orders` | yes | All orders in insertion order. Optional, combinable: `status`, `symbol`, `side`, `createdBy`, `q` (search in id, symbol, clientOrderId), `sort` (`id`, `symbol`, `side`, `quantity`, `limitPrice`, `status`, `createdAt`; `-` for descending), `page` + `pageSize` (1-100, default 10). Paging keeps a plain array body and adds `X-Total-Count`, `X-Page`, `X-Page-Size`, `X-Total-Pages`. Bad values → `400 { error: "Validation failed.", details }` |
| `POST /api/orders` | trader | `{ symbol, side, quantity, limitPrice, clientOrderId? }` → `201` order; `400 { error, details }` on validation; `409` on a duplicate `clientOrderId`; `403` for an approver |
| `GET /api/orders/export.csv` | yes | The same filters and sort as `GET /api/orders` (no paging) as a download: `text/csv; charset=utf-8`, `attachment; filename="orders-YYYY-MM-DD.csv"` (UTC). Columns `id,clientOrderId,symbol,side,quantity,limitPrice,status,createdBy,createdAt`; RFC 4180 quoting; null is an empty field. Bad parameters → `400` JSON |
| `POST /api/orders/import` | trader | Body: CSV with `Content-Type: text/csv` (up to 100 kB, 100 rows), header `symbol,side,quantity,limitPrice` with optional `,clientOrderId`. → `200 { created: [order…], errors: [{ line, details }], createdLines: [line…] }` (valid rows are created even when others fail; `line` is the 1-based file line). `400` bad header or no data rows, `413` over 100 rows, `415` another content type, `403` for an approver |
| `GET /api/orders/:id` | yes | Order, or `404` |
| `PATCH /api/orders/:id` | trader (owner) | Partial update of `side`, `quantity`, `limitPrice`, `clientOrderId` → `200` order with `updatedAt`. `400` for `symbol` ("Symbol cannot be changed."), unknown keys ("Unknown field."), bad values or `{}` ("Nothing to update."); `409` for another order's `clientOrderId` |
| `PUT /api/orders/:id` | trader (owner) | Full replacement: `symbol` (unchanged), `side`, `quantity`, `limitPrice`, optional `clientOrderId` (left out → `null`) → `200` order with `updatedAt`; `400` with `details` |
| `DELETE /api/orders/:id` | trader (owner) | `204`, no body; the order is gone (`404` after) |
| `POST /api/orders/:id/approve` | approver | `200` order; `403` for a trader; `409` if no longer pending |
| `POST /api/orders/:id/reject` | approver | Same as approve; optional body `{ reason }` (1-200 characters once trimmed, else `400 details.reason`) is stored as `rejectionReason` (default `null`) |
| `POST /api/test/reset` | none | Restores the seed orders and the test config (sessions are kept) → `200 { ok, orders }` |
| `GET /api/test/config` | none | `{ latencyMs, fillDelayMs }` |
| `POST /api/test/config` | none | Any subset of `{ latencyMs: 0-10000, fillDelayMs: 0-60000 }` → `200` the whole config; `400 { error, details }` for bad or unknown keys. `latencyMs` delays every authenticated API response (never `/api/auth/*`, `/api/test/*` or `/api/health`); defaults come from `LATENCY_MS` (0) and `FILL_DELAY_MS` (4000) |

PATCH, PUT and DELETE check in this order: `404` unknown order → `403` "You can only change your own orders." → `409` "Order ORD-x is already Approved." (not pending) → `400` validation. An approver gets the usual `403` "Only a trader can do this.". Every order has `updatedAt` (`null` until changed). Any `/api` request with a body that isn't valid JSON gets `400 { error: "Malformed JSON body." }`; unexpected errors are `500 { error: "Internal server error." }`.

Validation rules:
- `symbol` must come from `/api/symbols`.
- `side` is `Buy` or `Sell`.
- `quantity` is a whole number from 1 to 1,000,000.
- `limitPrice` is greater than 0, with at most 2 decimals.
- `timeInForce` (optional, default `Day`) is `Day`, `GTC` or `GTD`.
- `goodTillDate` (`YYYY-MM-DD`) is required for GTD, a real date, today (UTC) or later; it must be left out or `null` otherwise.
- `urgent` (optional, default `false`) is `true` or `false`.
- `notes` (optional) is up to 200 characters; an empty note is stored as `null`.
- PATCH and PUT use the same rules. Switching an order away from GTD clears its `goodTillDate`.

Order status flow: `Pending Approval` → `Approved` or `Rejected`.

Execution (eventual consistency): approving answers at once with `executionStatus: "Working"`; after half of `FILL_DELAY_MS` (default 4000 ms) it becomes `"Partially Filled"`, and after `FILL_DELAY_MS` `"Filled"` with `filledAt` set. Rejected and pending orders have `null`; approved seed orders are `"Filled"` at their decision time. A good target for `expect.poll` and auto-retrying `toHaveText`.

## Seed data

25 orders, ORD-1001 to ORD-1025 (`data/seed.json`): ORD-1001 to ORD-1003 as in Trade Desk Lite, plus 22 more across all five symbols and both sides, created by `trader1` (14) and `trader2` (8) between 2026-01-08 and 2026-02-20. 9 are Pending Approval, 9 Approved and 7 Rejected (seed included); five carry a `clientOrderId` (`V2-SEED-03`, `-07`, `-11`, `-16`, `-20`). The next new order is ORD-1026. `POST /api/test/reset` restores all of it.

## Changelog

- V2-01: More seed data, a second trader, a health route and a self-test harness (trader2, ORD-1004 to ORD-1025, `GET /api/health`, `npm test` with node:test)
- V2-02: `GET /api/orders` filters, search, sorting and pagination (`symbol`, `side`, `createdBy`, `q`, `sort`, `page`/`pageSize` with `X-Total-*` headers, 400 details; one `queryOrders` helper)
- V2-03: Order update and delete, Bearer logout and JSON error handling (PATCH/PUT/DELETE for the owning trader, `updatedAt`, Bearer tokens end on logout, `400 Malformed JSON body.`)
- V2-04: Orders table UI with filters, search, sortable headers, pagination and states (filter form, debounced search, `aria-sort` headers, pagination nav, URL state, no-match and load-error states on /orders and /approvals)
- V2-05: Async execution status (eventual consistency) (`executionStatus` Working → Partially Filled → Filled and `filledAt` after approve, `FILL_DELAY_MS`, details page polls every second)
- V2-06: Test config endpoint, latency, loading spinners and toasts (`GET/POST /api/test/config` with `latencyMs` and `fillDelayMs`, reset restores it, spinners on orders, approvals and details, 4 s toasts on approve and reject)
- V2-07: Order ticket form with select, date, checkbox, textarea, conditional field and counter (`timeInForce`, `goodTillDate`, `urgent`, `notes` in the API, the ticket and the details page)
- V2-08: CSV export (download) and CSV import (file upload) (`GET /api/orders/export.csv`, `POST /api/orders/import`, the Export CSV link, the `/orders/import` page and `fixtures/`)
- V2-09: Native dialogs: confirm (cancel), prompt (reject with reason) and alert (`rejectionReason` on reject, Cancel order and Reject with reason… on the details page, the Upload alert; /approvals keeps working without dialogs)
- V2-10: Quote popup (new tab) and quote iframe widget (seed quotes, `GET /api/quotes/:symbol`, `/quotes/:symbol`, "Open quote" with `target=_blank`, `/widgets/quote` in the ticket's "Market quote" iframe with "Use last price" via `postMessage`)
- V2-11: Tooltip, keyboard shortcuts and drag-and-drop watchlist (the Limit price tooltip, `/`, `Escape` and `Alt+N` on /orders, `GET/PUT /api/watchlist` and the /watchlist page with HTML5 drag and drop)
