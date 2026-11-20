# FEATURE-SPEC: DEV-01 Order activity history
**Author:** Developer (Claude)

## Acceptance criteria
- AC1: Given a signed-in trader or approver and an existing order, when they `GET /api/orders/:id/events`, then the response is `200` with an array of events for that order only, **oldest first** (non-decreasing `at`; events at the same instant keep the order they happened in).
- AC2: Given a trader creates an order (`POST /api/orders`), imports it (`POST /api/orders/import`) or duplicates one (DEV-02), then its first event is `created` by that trader, with `details` `{ symbol, side, quantity, limitPrice, source }` where `source` is `"api"`, `"import"` or `"duplicate"` (a duplicate also has `duplicatedFrom: "<sourceId>"`).
- AC3: Given the owner edits a Pending Approval order with `PATCH` or `PUT` and at least one editable field changes, then one `edited` event is added by that trader with `details` `{ method: "PATCH" | "PUT", changes: { <field>: { from, to } } }` listing **only the fields whose value changed** (editable fields: `side`, `quantity`, `limitPrice`, `clientOrderId`, `timeInForce`, `goodTillDate`, `urgent`, `notes`; a missing value is `null`). An edit that changes nothing adds no event. A refused edit (400/403/404/409) adds no event.
- AC4: Given an approver approves an order, then an `approved` event by the approver (`details` `{}`), immediately followed by `execution` events by `"system"`: `{ from: null, to: "Working" }`, then `{ from: "Working", to: "Partially Filled" }` after half of `fillDelayMs`, then `{ from: "Partially Filled", to: "Filled" }` after `fillDelayMs`.
- AC5: Given an approver rejects an order, then a `rejected` event by the approver with `details` `{ reason }`: the trimmed reason, or `null` when none was sent. A refused decision (400/404/409) adds no event.
- AC6: Given no auth, then `401 { "error": "Authentication required." }`. Given an unknown or deleted (cancelled) order id, then `404 { "error": "Order <id> not found." }` (the same rule as `GET /api/orders/:id`).
- AC7: Seed orders already have history derived from their fields: `created` (actor `createdBy`, at `createdAt`, `source: "seed"`), then `approved`/`rejected` (actor `decidedBy`, at `decidedAt`; rejected has `{ reason: rejectionReason }`), then for approved ones `execution` `{ from: null, to: "Filled" }` by `"system"` at `filledAt`. `POST /api/test/reset` restores exactly this (events added since are gone).
- AC8: Given any signed-in user on `/orders/:id`, when the page loads, then an "Activity" section lists the order's events oldest first; each item shows the time, the actor, the action label and a detail line (see UI). It updates after Approve / Reject on the page and on every execution step while the order is Working or Partially Filled.
- AC9: Existing endpoints and responses are unchanged: orders have no new fields; every existing test still passes.

## API
| Method | Path | Auth/roles | Request body | Success (code + JSON) | Errors (code + message) |
|---|---|---|---|---|---|
| `GET` | `/api/orders/:id/events` | Any signed-in user (Bearer or session cookie) | — | `200` `[{ "orderId": "ORD-1001", "at": "<ISO 8601>", "actor": "trader1" \| "approver1" \| "system", "action": "created" \| "edited" \| "approved" \| "rejected" \| "execution" \| "cancelled", "details": { … } }]` | `401` `{ "error": "Authentication required." }`; `404` `{ "error": "Order <id> not found." }` |

`details` per action:

| action | details |
|---|---|
| `created` | `{ "symbol", "side", "quantity", "limitPrice", "source": "seed" \| "api" \| "import" \| "duplicate", "duplicatedFrom"? }` |
| `edited` | `{ "method": "PATCH" \| "PUT", "changes": { "<field>": { "from": <old or null>, "to": <new or null> } } }` |
| `approved` | `{}` |
| `rejected` | `{ "reason": "<trimmed text>" \| null }` |
| `execution` | `{ "from": null \| "Working" \| "Partially Filled", "to": "Working" \| "Partially Filled" \| "Filled" }` |
| `cancelled` | `{}` (recorded, but not readable through this endpoint: see Q1) |

Example (`ORD-1001`, seed):
```json
[
  { "orderId": "ORD-1001", "at": "2026-01-05T14:30:00.000Z", "actor": "trader1", "action": "created", "details": { "symbol": "ACME", "side": "Buy", "quantity": 100, "limitPrice": 42.5, "source": "seed" } },
  { "orderId": "ORD-1001", "at": "2026-01-05T14:45:00.000Z", "actor": "approver1", "action": "approved", "details": {} },
  { "orderId": "ORD-1001", "at": "2026-01-05T14:45:00.000Z", "actor": "system", "action": "execution", "details": { "from": null, "to": "Filled" } }
]
```

## UI
| Page/route | Element | Role + accessible name | data-testid | Behaviour |
|---|---|---|---|---|
| `/orders/:id` | Activity section | `region` named "Activity" (`<section aria-labelledby="activity-heading">`, heading `h2` "Activity") | `activity` | Hidden until the events load, then visible for every signed-in user. Below `#order-actions`. |
| `/orders/:id` | Event list | `list` (`<ol>`) | `activity-list` | One `listitem` per event, oldest first. |
| `/orders/:id` | One event | `listitem` | `activity-item` (plus `data-action="<action>"`) | Text: time (`<time datetime="<ISO>">`, shown in the **browser's local time zone**, `en-GB` format, like `05 Jan 2026, 09:30:00` for `2026-01-05T14:30:00.000Z` in New York; assert on the `datetime` attribute for an exact, time-zone-free value), actor, label (`Created`, `Edited`, `Approved`, `Rejected`, `Execution`, `Cancelled`), then a detail line: created `Buy 100 ACME @ 42.50` (+ ` · copy of ORD-1001` or ` · CSV import`); edited `Quantity: 100 → 77; Urgent: No → Yes` (prices with 2 decimals, `—` for empty); rejected `Reason: <text>` or `No reason given`; execution `Working → Partially Filled` (or just `Working` / `Filled` when there's no previous step). Approved has no detail line. |
| `/orders/:id` | Empty state | text "No activity yet." | `activity-empty` | Shown only if the list is empty (it can't be for an existing order today). |

## State / data rules
- The log is in memory like the orders: restarting the server or `POST /api/test/reset` resets it to the seed history.
- Events are append-only; nothing edits or deletes them. The list is never re-sorted (time order = the order things happened).
- Only Pending Approval orders can be edited, so `edited` events only appear before `approved`/`rejected`.
- `at` is the server's time. Since BUG-1 (2026-11-20) it is **exactly** the timestamp the order records for the same change: `created` = `createdAt`, `edited` = `updatedAt`, `approved`/`rejected` = `decidedAt`, execution `Filled` = `filledAt`. `cancelled`, `Working` and `Partially Filled` have no matching field and use their own clock read. Seed events use the seed's own timestamps.

## Breaking changes
- None. No order field was added or changed; no existing route changed its response.

## Test data / setup
- Reset first: `POST /api/test/reset` (no auth).
- Log in through the API: `POST /api/auth/login` `{ "username": "trader1" | "trader2" | "approver1", "password": <from env, TRADER1_PASSWORD etc.> }` → `{ token }`, then `Authorization: Bearer <token>`.
- A fresh order: `POST /api/orders` `{ "symbol": "ACME", "side": "Buy", "quantity": 10, "limitPrice": 12.5 }` (any valid symbol from `GET /api/symbols`), so a test doesn't depend on shared seed orders in parallel runs.
- Fast fills for execution events: `POST /api/test/config` `{ "fillDelayMs": 200 }` (whole number, 0–60000). This changes the whole server, so keep such tests serial, or read the events with `expect.poll` against the default 4 s.
- Seed examples: `ORD-1001` (approved and filled), `ORD-1003` (pending, created by trader1); a rejected one: `GET /api/orders?status=Rejected`.

## Questions for Omer
- **Q1:** `DELETE /api/orders/:id` removes the order, so its events (including `cancelled`) can't be read afterwards (404, same as the details page). A global audit log is out of scope. OK as is?

## Developer answers to TEST-PLAN Q1–Q3 (2026-11-20)
**Author:** Developer (Claude). All values below are read from `practice-app-v2/server.js` and `public/static/app.js` as they are now; nothing is new behavior unless marked *proposed*.

### Q1: Cancellation observability (Omer chose Option B on 2026-11-20; built)
Today, `DELETE /api/orders/:id` records `{ action: "cancelled", actor: <owner>, details: {} }` in the in-memory log and removes the order. After that, `GET /api/orders/:id/events` answers `404 { "error": "Order <id> not found." }`, so no public call can read the `cancelled` event, and neither can an app-level test (the log is private to `createApp`).
- **Option A (no app change):** accept the 404. TC30 then checks only what is observable: 204 on DELETE, then 404 on both `GET /api/orders/:id` and `GET /api/orders/:id/events`. The *recording* of `cancelled` is documented here but not verified.
- **Option B (*proposed*, small app change, recommended):** a test-only route next to the existing `/api/test/*` hooks (no auth, like reset and config): `GET /api/test/events?orderId=ORD-x` → `200` with that order's raw events, **including after cancellation** (an unknown id gives `[]`). The Developer would add it with an app test; TC30 can then assert the exact `cancelled` event. The public `/api/orders/:id/events` contract does not change.

**Built (Option B):** `GET /api/test/events?orderId=ORD-x`, no auth, registered with the other `/api/test/*` hooks.
| Request | Status | Body |
|---|---|---|
| `?orderId=<an order's id>`, before or after DELETE | 200 | That order's raw events, oldest first, same shape as `/api/orders/:id/events`; after a cancel, the last one is `{ orderId, at, actor: <owner>, action: "cancelled", details: {} }` |
| `?orderId=<unknown id>` | 200 | `[]` |
| no `orderId` (or empty) | 400 | `{ "error": "Validation failed.", "details": { "orderId": "orderId is required." } }` |

It is per order, so it is parallel-safe for an order the test created. `POST /api/test/reset` clears it back to the seed history. App tests: `tests/activity.test.js` (two new cases); `npm --prefix practice-app-v2 test` → tests 76, pass 76, fail 0.

### Q2: Exact contracts
Checks run in this order: **401 auth → 403 role → 404 unknown order → 409 not pending → 400 body validation.** The first failing check answers.

| Case | Status | Body |
|---|---|---|
| Missing, malformed or unknown Bearer token (any `/api` route except auth, test and health, including `/events`) | 401 | `{ "error": "Authentication required." }` |
| `quantity: 0` (POST, PATCH or PUT) | 400 | `{ "error": "Validation failed.", "details": { "quantity": "Quantity must be a whole number from 1 to 1000000." } }` |
| Approve or reject as a trader (any id, even unknown) | 403 | `{ "error": "Only a approver can do this." }` (existing wording, "a approver") |
| Approve or reject an unknown id (as approver) | 404 | `{ "error": "Order ORD-9999 not found." }` |
| Approve or reject an order that is not pending | 409 | `{ "error": "Order ORD-x is already Approved." }` (or `Rejected.`) |
| Reject with `reason` whitespace-only, longer than 200 characters once trimmed (201+), or not a string | 400 | `{ "error": "Validation failed.", "details": { "reason": "Reason must be 1 to 200 characters." } }` |
| Reject with `reason` absent or `null` | 200 | Rejected; the event has `{ "reason": null }` |

Precedence examples: a trader rejecting an unknown id gets 403; an approver rejecting an unknown id with a bad reason gets 404; an approver rejecting an already-approved order with a bad reason gets 409. No refused request adds an event.

**UI detail line for `edited`:** `<Label>: <from> → <to>`, several changes joined with `; ` in this field order: side, quantity, limitPrice, clientOrderId, timeInForce, goodTillDate, urgent, notes.

| Field | Label | Value format |
|---|---|---|
| side | `Side` | as is (`Buy`) |
| quantity | `Quantity` | en-US grouping (`1,000`) |
| limitPrice | `Limit price` | two decimals, no grouping (`12.50`, `1234.50`) |
| clientOrderId | `Client order id` | as is |
| timeInForce | `Time in force` | as is (`GTD`) |
| goodTillDate | `Good till date` | as is (`2026-12-01`) |
| urgent | `Urgent` | `Yes` / `No` |
| notes | `Notes` | the note text as is |

Any empty value (`null` or `""`) shows as `—`. Examples: `Notes: — → Hedge Q1`, `Limit price: 12.50 → 13.00`, `Quantity: 100 → 77; Urgent: No → Yes`.

### Q3: Equal timestamps (done)
New app-level test in `practice-app-v2/tests/activity.test.js`, *events with the same timestamp keep the order they happened in*. It freezes `Date` with node:test's `mock.timers` (timers stay real) on its own app instance with `fillDelayMs: 0`. It then creates, edits and approves an order and waits for the fills. All six events have the identical `at`, and they come back as created, edited, approved, execution Working, Partially Filled, Filled.
- Real output: `ℹ tests 74`, `ℹ pass 74`, `ℹ fail 0` (`npm --prefix practice-app-v2 test`), and 5 repeated runs of the file, all passing.
- Mutation check (reverted): sorting the events by `at`, then by action name, made this test fail.

TC15 can map to this app-level test, the same way DEV-02 AC4 maps to its app-level case, unless Omer wants a Playwright-level tie as well (that would need a clock hook in the app).
