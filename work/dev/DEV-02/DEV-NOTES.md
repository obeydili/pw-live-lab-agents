# DEV-NOTES: DEV-02 Duplicate order
**Developer:** Claude · 2026-11-12

## What changed (`practice-app-v2/` only)
- `server.js`: `POST /api/orders/:id/duplicate` next to approve/reject, behind `requireRole('trader')`. It builds a create body from the source (`clientOrderId: null`), runs the same `validateOrder` as `POST /api/orders`, then the same `createOrder` (new `ORD-n`, Pending Approval, `ticketFields` defaults). The request body is ignored; the source isn't touched. The new order's DEV-01 `created` event carries `source: "duplicate"` and `duplicatedFrom`.
- `public/order-details.html`: `data-testid="flash"` on the existing `#flash`.
- `public/static/app.js`: the "Duplicate order" button (`data-testid="duplicate-order"`) in `#order-actions` for traders on any order; disabled while the request runs; on success it saves the source id in `sessionStorage` and goes to `/orders/<newId>?duplicated=1`, which shows `Order <newId> created as a copy of <sourceId>.` (falling back to the `created` event when sessionStorage doesn't have it); on failure, the existing toast with the error and validation messages.
- `tests/duplicate.test.js`: 6 new node:test tests (AC1 ×2, AC2, AC3, AC4, the unique-clientOrderId and event case).

## What I ran (real output)
`npm --prefix practice-app-v2 test` (with DEV-01 in the same tree):
```
✔ AC1: 201 with a new Pending Approval order for the current trader, copied fields, nothing else carried over
✔ AC1: seed orders in every status (defaults for the ticket fields), and the request body is ignored
✔ AC2: the source is unchanged, and a second duplicate gets another new id
✔ AC3: 401 without auth, 403 for an approver, 404 for an unknown id; nothing is created
✔ AC4: copied fields that no longer pass POST validation give 400 with details, and nothing is created
✔ a unique clientOrderId on the source never conflicts, and the copy records where it came from (DEV-01)
ℹ tests 73
ℹ pass 73
ℹ fail 0
```

UI smoke check in Chromium against `PORT=3390 node server.js`:
- trader1 on `/orders/ORD-1001` (Approved): "Duplicate order" visible → `/orders/ORD-1026?duplicated=1`, flash `Order ORD-1026 created as a copy of ORD-1001.`
- The same URL opened in a fresh browser context (no sessionStorage): same flash, read from the event. A plain visit to `/orders/ORD-1026`: no flash.
- approver1 on `/orders/ORD-1026`: no "Duplicate order" button (Approve and Reject as before).
- No console errors.
- Not exercised in the UI: the failure toast. The API side of it (400 with details) is covered by the AC4 test, and the toast uses the same code path as Cancel's.

## Known limits
- AC4's realistic trigger (a GTD order whose date has passed) can't be created through the API, so the app test uses a custom seed. See FEATURE-SPEC Q1 for a possible test hook.

## Not done here
- No git commit or branch: Omer didn't ask for one. The changes are in the working tree of `main`, together with DEV-01. Branch name from the ticket: `dev/02-duplicate-order`.

## Review fixes (2026-11-20): B1 and B2 from REVIEW.md
**Developer:** Claude

- **B1 (hardcoded password):** `practice-app-v2/tests/duplicate.test.js` no longer contains a password. AC4 now starts its custom-seed app through the shared `startApp(options)` helper and signs in with `seeded.login('trader1')`. `tests/helpers.js` no longer exports a `PASSWORD` literal: `login(username)` looks up the password with `passwordOf(username)`, which reads the app's own `data/seed.json` (the user store the app serves). No test file in DEV-01 or DEV-02 names a credential.
- **B2 (TC11 source integrity):** AC4 reads the source order (`GET /api/orders/ORD-5000`) and its events before the rejected duplicate, then asserts the 400 body, NO-CREATE (only `ORD-5000` in the list), and UNCHANGED (the full source and its full event list are `deepEqual` to the values from before). The seed order now also has `urgent: true` and a note, so these fields are part of what is compared.
- No app code changed. The duplicate route is as before.

### What I ran (real output)
`npm --prefix practice-app-v2 test`:
```
✔ AC4: copied fields that no longer pass POST validation give 400 with details; nothing is created and the source is unchanged
ℹ tests 73
ℹ pass 73
ℹ fail 0
```
Mutation check for B2 (temporary, reverted): `source.notes = null;` added to the duplicate route just before its 400 return → `node --test tests/duplicate.test.js`: `✖ AC4 …`, `pass 5`, `fail 1`. `server.js` was restored from a copy (no trace left), then: `pass 6`, `fail 0`.

Not run by me: the Playwright suite (no framework file changed).

### Note for Omer (not a DEV-02 blocker)
Older practice-app-v2 tests from before DEV-01/DEV-02 (`config`, `existing`, `quotes`, `orders-update`, `pages`) still write the demo password inline when they test the login form itself. They now could use `passwordOf()` too. I left them unchanged because they're outside this ticket; say the word and I'll switch them over.
