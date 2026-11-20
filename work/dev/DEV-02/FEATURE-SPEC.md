# FEATURE-SPEC: DEV-02 Duplicate order
**Author:** Developer (Claude)

## Acceptance criteria
- AC1: Given an authenticated trader and an existing order in any status (Pending Approval, Approved or Rejected, created by any trader), when they `POST /api/orders/:id/duplicate`, then `201` with a new order (same shape as `POST /api/orders`): a new `id` from the same `ORD-n` counter, `status` `"Pending Approval"`, `createdBy` the current trader, `createdAt` now, `clientOrderId` `null`, and `decidedBy`, `decidedAt`, `updatedAt`, `executionStatus`, `filledAt`, `rejectionReason` all `null`. `symbol`, `side`, `quantity`, `limitPrice` are copied; `timeInForce`, `goodTillDate`, `urgent` and `notes` are copied through the same defaults as create (`timeInForce` `"Day"`, `urgent` `false`, `goodTillDate` only for GTD, an empty note is `null`). Any request body is ignored. The new order is in `GET /api/orders` and `GET /api/orders/<newId>`.
- AC2: The source order is unchanged afterwards (every field). Duplicating the same source again creates another new id (no conflict, even when the source has a `clientOrderId`).
- AC3: No auth → `401 { "error": "Authentication required." }`; an approver → `403 { "error": "Only a trader can do this." }`; a trader and an unknown id → `404 { "error": "Order <id> not found." }`. In all three cases no order is created. (Checks run in that order: auth, role, then the id.)
- AC4: When the copied fields fail the same validation as `POST /api/orders`, then `400 { "error": "Validation failed.", "details": { <field>: <message> } }` and no order is created. The realistic case: a GTD source whose `goodTillDate` is now in the past → `details.goodTillDate` = `"Good till date is required for GTD and cannot be in the past."`.
- AC5: On `/orders/:id`, a trader sees a "Duplicate order" button for any existing order; an approver doesn't. Clicking it calls the endpoint; on success the browser goes to `/orders/<newId>?duplicated=1` and `#flash` shows `Order <newId> created as a copy of <sourceId>.`. On failure the existing toast (`data-testid="toast"`, `role="alert"`) shows the API error (plus the validation messages, if any), the button is enabled again and the page stays on the source order.
- AC6 (with DEV-01): the new order's first Activity event is `created` with `details.source` `"duplicate"` and `details.duplicatedFrom` `"<sourceId>"`.

## API
| Method | Path | Auth/roles | Request body | Success (code + JSON) | Errors (code + message) |
|---|---|---|---|---|---|
| `POST` | `/api/orders/:id/duplicate` | Authenticated **trader** (Bearer or session cookie) | None (ignored if sent) | `201` the new order: `{ "id": "ORD-1026", "clientOrderId": null, "symbol", "side", "quantity", "limitPrice", "status": "Pending Approval", "createdBy": "<trader>", "createdAt": "<now>", "decidedBy": null, "decidedAt": null, "updatedAt": null, "executionStatus": null, "filledAt": null, "rejectionReason": null, "timeInForce", "goodTillDate", "urgent", "notes" }` | `401` `{ "error": "Authentication required." }`; `403` `{ "error": "Only a trader can do this." }`; `404` `{ "error": "Order <id> not found." }`; `400` `{ "error": "Validation failed.", "details": { … } }` |

## UI
| Page/route | Element | Role + accessible name | data-testid | Behaviour |
|---|---|---|---|---|
| `/orders/:id` | Duplicate action in `#order-actions` | `button` "Duplicate order" | `duplicate-order` | Traders only, any status. Rendered only after the order has loaded (never during the `loading-spinner`). Disabled while its request runs. For the owner of a pending order it sits after "Cancel order". |
| `/orders/:id` | Flash | `status` (`#flash`) | `flash` (new test id on the existing element) | With `?duplicated=1`: `Order <newId> created as a copy of <sourceId>.` Hidden otherwise. `?created=1` still shows `Order <id> submitted for approval.` |
| `/orders/:id` | Toast | `alert` | `toast` (existing) | A failed duplicate, e.g. `Validation failed. Good till date is required for GTD and cannot be in the past.` |

## State / data rules
- The copy is a normal new order: it can be edited, cancelled, approved or rejected like any other.
- The source id for the flash travels in `sessionStorage` (`tdl_duplicated_from_<newId>`, removed when read); if it isn't there (another tab, cleared storage), the page reads it from the new order's `created` event. The URL is exactly `/orders/<newId>?duplicated=1`.

## Breaking changes
- None. `#flash` only gained `data-testid="flash"`; Cancel, Approve and Reject are unchanged.

## Test data / setup
- `POST /api/test/reset`, then log in through the API (`trader1`, `trader2`, `approver1`; passwords from env).
- Any status: seed `ORD-1001` (Approved), `ORD-1003` (Pending), and a Rejected one from `GET /api/orders?status=Rejected`; or create your own with `POST /api/orders` (parallel-safe: assert on the ids you created, not on counts of the shared list).
- Another trader's order: create it as `trader2`, duplicate as `trader1`.
- AC4 (past GTD) can't be made through the API (create refuses a past date), and there's no test hook to change an order's date. The app's own test builds it with a custom seed (`createApp({ seed })`, `practice-app-v2/tests/duplicate.test.js`). For Playwright, see Q1.

## Questions for Omer
- **Q1:** AC4 needs an order whose GTD date has passed. Do you want a test-only hook for that (e.g. `POST /api/test/orders` to insert a seed-like order), or is the app-level test enough for AC4?
