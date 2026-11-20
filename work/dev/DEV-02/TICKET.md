# DEV-02: Duplicate order
**Written by:** Omer · **Branch:** `dev/02-duplicate-order`

## User story
As a trader, I want to duplicate an existing order from its details page so that I can submit a new ticket with the same symbol, side, quantity, price and ticket fields without typing them again.

## Scope
- In: add `POST /api/orders/:id/duplicate` that creates a new Pending Approval order from an existing one, and a "Duplicate order" button on `/orders/:id` (`public/order-details.html` / `renderOrderActions` in `public/static/app.js`) that traders can use on any existing order.
- Out: a duplicate action on the `/orders` table, a confirm dialog, copying `clientOrderId`, editing fields before save, and any change to Cancel, Approve or Reject.

## Acceptance criteria
- AC1: Given an authenticated trader and an existing order (Pending Approval, Approved or Rejected, including one created by a different trader), when they `POST /api/orders/:id/duplicate`, then the response is `201` with a new order: a new `id` from `nextOrderNumber` (same `ORD-n` scheme as `createOrder` in `practice-app-v2/server.js`), `status` is `"Pending Approval"`, `createdBy` is the current trader, `createdAt` is now, `clientOrderId` is `null`, and `decidedBy`, `decidedAt`, `updatedAt`, `executionStatus`, `filledAt` and `rejectionReason` are `null`. `symbol`, `side`, `quantity` and `limitPrice` are copied. Ticket fields use the same defaults as create (`ticketFields`): `timeInForce` (default `"Day"`), `goodTillDate`, `urgent` (default `false`) and `notes`.
- AC2: Given a successful duplicate, when the source order is fetched again, then it is unchanged (same `id`, `status`, `createdBy`, `clientOrderId` and the rest of its fields). A second duplicate of the same source creates a second new id, not a conflict.
- AC3: Given no auth, when `POST /api/orders/:id/duplicate` is called, then `401 { "error": "Authentication required." }` and no order is created. Given an approver, then `403 { "error": "Only a trader can do this." }` and no order is created. Given a trader and an unknown id, then `404 { "error": "Order <id> not found." }` (same wording as `GET /api/orders/:id`).
- AC4: Given the copied fields would fail the existing `validateOrder` / `FIELD_RULES` used by `POST /api/orders`, when a trader duplicates that order, then `400 { "error": "Validation failed.", "details": { <field>: <message> } }` and no order is created.
- AC5: Given a trader on `/orders/:id` for an existing order, when the details page loads, then a button named "Duplicate order" is visible. Clicking it calls `POST /api/orders/:id/duplicate` and, on success, goes to `/orders/<newId>?duplicated=1`, where `#flash` shows `Order <newId> created as a copy of <sourceId>.` On failure, the existing toast (`data-testid="toast"`) shows the API error and the page stays on the source order. Given an approver, the button is not shown.

## API
| Method | Path | Auth/roles | Request body | Success (code + JSON) | Errors (code + message) |
|---|---|---|---|---|---|
| `POST` | `/api/orders/:id/duplicate` | Authenticated **trader** (Bearer or session cookie, same as `POST /api/orders`) | None (ignore a body if one is sent) | `201` with the new order object, same shape as `POST /api/orders` | `401` `{ "error": "Authentication required." }`; `403` `{ "error": "Only a trader can do this." }`; `404` `{ "error": "Order <id> not found." }`; `400` `{ "error": "Validation failed.", "details": { ... } }` |

Register the route next to the other `POST /api/orders/:id/...` actions in `practice-app-v2/server.js`. Do not break `GET/PATCH/PUT/DELETE /api/orders/:id` or approve/reject.

## DOM spec
| Page/route | Element | Role + accessible name | data-testid | Behaviour |
|---|---|---|---|---|
| `/orders/:id` | Duplicate action, rendered into `#order-actions` | `button` named "Duplicate order" | `duplicate-order` | Visible only to traders, on any existing order (not only Pending Approval). Disabled or not shown while the details request is still loading (`data-testid="loading-spinner"`). |
| `/orders/:id` | Existing flash | `status` (`#flash`) | `flash` (add this test id to the existing `#flash` paragraph) | After `?duplicated=1`, visible with `Order <newId> created as a copy of <sourceId>.` Hidden otherwise. Do not change the existing `?created=1` flash. |
| any page with toasts | Existing toast | already implemented in `public/static/app.js` | `toast` | Use it for a failed duplicate; do not invent a second toast system. |

## Notes / constraints
- Only touch `practice-app-v2/`. Keep existing endpoints and responses working.
- This is not cancel: `DELETE /api/orders/:id` already removes a pending order. Do not add a Cancelled status and do not change Cancel order.
- `clientOrderId` must stay `null` on the copy so a source with a unique client id does not 409.
- Every new interactive element needs a stable `data-testid` and an accessible name.
- Add a focused test in `practice-app-v2/tests/` in the existing `node:test` style (`tests/existing.test.js`, `tests/helpers.js`). Do not put credentials in the ticket folder.

## Done when
- PLAN.md is approved, FEATURE-SPEC.md and DEV-NOTES.md are written, and the app runs on :3300.
