# DEV-03: Order stats endpoint
**Written by:** Omer · **Branch:** `dev/03-order-stats`

## User story
As a trader or approver, I want a single API that returns counts and totals for all orders so that later UI or tests can show a desk snapshot without paging through `GET /api/orders`.

## Scope
- In: add `GET /api/orders/stats` in `practice-app-v2/server.js`. It summarises every order currently in the in-memory store (the same set `GET /api/orders` returns with no filters).
- Out: any UI (no dashboard, no counters on `/orders`), query filters, date ranges, grouping by symbol or trader, and any change to `GET /api/orders` or `GET /api/orders/export.csv`.

## Acceptance criteria
- AC1: Given an authenticated trader or approver, when they `GET /api/orders/stats` with no query string, then the response is `200` and a JSON object with exactly these keys: `total` (number of orders), `byStatus` (counts for `"Pending Approval"`, `"Approved"` and `"Rejected"`, each key always present, `0` when none), `bySide` (counts for `"Buy"` and `"Sell"`, each key always present, `0` when none), `totalQuantity` (sum of `quantity`) and `totalNotional` (sum of `quantity * limitPrice`, rounded to two decimal places with `Math.round(sum * 100) / 100`). After `POST /api/test/reset`, the body is:
  ```json
  {
    "total": 25,
    "byStatus": { "Pending Approval": 9, "Approved": 9, "Rejected": 7 },
    "bySide": { "Buy": 14, "Sell": 11 },
    "totalQuantity": 90456,
    "totalNotional": 1950074.1
  }
  ```
- AC2: Given the seed, when a trader creates one valid order (`POST /api/orders`), then a following `GET /api/orders/stats` has `total` 26 and `byStatus["Pending Approval"]` 10, and `totalQuantity` / `totalNotional` increase by that ticket's quantity and quantity × limit price. When they then `DELETE` a pending order they own, `total` and the matching status/side/quantity/notional counts decrease accordingly. Deleted orders must not be counted (cancel already removes the row; there is no Cancelled status).
- AC3: Given no auth, when `GET /api/orders/stats` is called, then `401 { "error": "Authentication required." }`. Approvers get `200` with the same numbers as traders (the list is not scoped to the caller, same as `GET /api/orders`).
- AC4: Given `GET /api/orders/stats`, when the request is made, then it is not handled as `GET /api/orders/:id` (must not return `404 { "error": "Order stats not found." }`). Existing `GET /api/orders` and `GET /api/orders/export.csv` stay unchanged.

## API
| Method | Path | Auth/roles | Request body | Success (code + JSON) | Errors (code + message) |
|---|---|---|---|---|---|
| `GET` | `/api/orders/stats` | Any authenticated user (Bearer or session cookie, same as `GET /api/orders`) | None. Ignore query parameters if they are sent; do not 400. | `200` with the object in AC1 | `401` `{ "error": "Authentication required." }` |

Register this literal route **before** `GET /api/orders/:id`, the same way `GET /api/orders/export.csv` is already registered (see the comment in `practice-app-v2/server.js` around that route: Express would otherwise treat `"stats"` as an id).

## DOM spec
None. This ticket is API-only. Do not add counters, a dashboard or new `data-testid`s.

## Notes / constraints
- Only touch `practice-app-v2/`. Keep existing endpoints and responses working.
- Compute from `state.orders` at request time. Do not cache a stale snapshot across creates, deletes, approvals, rejects or `POST /api/test/reset`.
- Do not invent extra fields (`urgentCount`, by-symbol, averages). The contract above is the whole payload.
- Add a focused test in `practice-app-v2/tests/` in the existing `node:test` style (`tests/existing.test.js`, `tests/helpers.js`). Cover the seed snapshot, a create/delete change, 401, and that an approver can call it. Do not put credentials in the ticket folder.

## Done when
- PLAN.md is approved, FEATURE-SPEC.md and DEV-NOTES.md are written, and the app runs on :3300.
