# DEV-NOTES: DEV-01 Order activity history
**Developer:** Claude · 2026-11-12

## What changed (`practice-app-v2/` only)
- `server.js`:
  - an in-memory event log (`state.events`), rebuilt from the seed on reset (`created` / `approved` / `rejected` / `execution` from the seed's own fields);
  - `recordEvent()` called from create (POST, CSV import, DEV-02 duplicate), PATCH and PUT (only when a field changed, with `from`/`to` per field), DELETE (`cancelled`), approve and reject (with the reason), and each execution step (`system`);
  - new `GET /api/orders/:id/events` (any signed-in user, 404 like the details page).
- `public/order-details.html`: the "Activity" section (`data-testid="activity"`, `activity-list`, `activity-empty`).
- `public/static/app.js`: `renderActivity()` (one `activity-item` per event, `data-action`, `<time datetime>`), refreshed after Approve/Reject and on every execution poll.
- `public/static/styles.css`: list styling.
- `tests/activity.test.js`: 6 new node:test tests.

## What I ran (real output)
`npm --prefix practice-app-v2 test` (with DEV-02 in the same tree):
```
✔ access: 401 without a token, 404 for an unknown order, any signed-in role can read
✔ seed orders carry the history their fields tell: created, decided, filled
✔ create, edit (PATCH and PUT), approve and the fills, oldest first, with who and what
✔ reject records the reason (or null), and a refused change records nothing
✔ CSV import marks its orders, a cancelled order answers 404 like its details page, and reset clears new events
✔ existing responses keep their shape (no new fields on orders)
ℹ tests 73
ℹ pass 73
ℹ fail 0
```
Before the change: 61 tests, 61 pass. No existing test was changed.

UI smoke check in Chromium against `PORT=3390 FILL_DELAY_MS=1500 node server.js` (a spare port, because another Practice-App-v2 copy was using :3300 at the time):
- `ORD-1001` as trader1: `05 Jan 2026, 09:30:00 trader1 Created | Buy 100 ACME @ 42.50`, `approver1 Approved`, `system Execution | Filled` (local time, New York).
- A new order, edited (`Quantity: 100 → 77; Urgent: No → Yes`), then approved in the UI by approver1: the list grew live to `Execution | Working`, `Working → Partially Filled`, `Partially Filled → Filled` without a reload.
- No console errors.

Not run on :3300: that port was held by another copy of Practice-App-v2 running on this machine. The start code is unchanged (`Number(process.env.PORT) || 3300`), and `PORT=3390 node server.js` printed `Trade Desk Lite running on http://localhost:3390`. Stop the other copy and use the Orchestration page's ▶ Start to run this one on :3300.

## Known limits
- In memory, like the orders: a server restart or `POST /api/test/reset` resets the history to the seed.
- A cancelled order's events can't be read (the order is gone, so 404). See FEATURE-SPEC Q1.
- An edit that sends the same values records no event (on purpose), although `updatedAt` still changes, as before.
- Seed history is derived: seed orders have no edit history, and an approved seed order has a single `execution` step (`null → Filled`) at its fill time.

## Not done here
- No git commit or branch: Omer didn't ask for one. The changes are in the working tree of `main`, together with DEV-02. Branch name from the ticket: `dev/01-order-history`.

## Answers to the Test Planner (2026-11-20)
**Developer:** Claude
- Q1–Q3 are answered in FEATURE-SPEC.md ("Developer answers to TEST-PLAN Q1–Q3"). Q1 needs Omer's decision: Option A (accept the 404) or Option B (a test-only `GET /api/test/events` hook, recommended).
- Q3: new app test `tests/activity.test.js` › *events with the same timestamp keep the order they happened in* (frozen Date). `npm --prefix practice-app-v2 test`: tests 74, pass 74, fail 0. No app code changed.
- `tests/helpers.js` now reads passwords from `data/seed.json` (`passwordOf`) instead of a literal (DEV-02 review B1); DEV-01's tests use `login(username)` and need no change.
- Q1 Option B (Omer, 2026-11-20): added `GET /api/test/events?orderId=` to `practice-app-v2/server.js` (test-only, no auth), documented in the app README together with the DEV-01 and DEV-02 routes. Two new app tests; `npm --prefix practice-app-v2 test` → tests 76, pass 76, fail 0. Contract in FEATURE-SPEC.md, Q1.
