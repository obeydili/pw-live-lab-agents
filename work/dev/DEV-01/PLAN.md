# DEV-01 plan: Order activity history

**Developer:** Claude · **Approval:** Omer asked for the implementation directly in chat (2026-11-12), so this plan is the record of the approach, not a gate.

## Approach
An in-memory event log per order, next to the orders in `state` (so `POST /api/test/reset` clears it like the orders). Every place that changes an order appends one event. A new read-only endpoint returns an order's events, and the details page renders them in an "Activity" section.

## Event shape
`{ orderId, at, actor, action, details }`, oldest first.

| action | when | actor | details |
|---|---|---|---|
| `created` | `POST /api/orders`, CSV import, duplicate (DEV-02) | the trader | `{ symbol, side, quantity, limitPrice, source }` (`source`: `"api"`, `"import"`, `"duplicate"`; a duplicate adds `duplicatedFrom`) |
| `edited` | `PATCH` / `PUT /api/orders/:id` that changes at least one field | the trader | `{ method, changes: { <field>: { from, to } } }` |
| `approved` | `POST /api/orders/:id/approve` | the approver | `{}` |
| `rejected` | `POST /api/orders/:id/reject` | the approver | `{ reason }` (`null` without one) |
| `execution` | Working → Partially Filled → Filled | `"system"` | `{ from, to }` |
| `cancelled` | `DELETE /api/orders/:id` | the trader | `{}` |

Seed orders get the history their fields already imply (created, then approved/rejected, then the fill for approved ones), so no seed order shows an empty Activity section.

## Files
- `practice-app-v2/server.js`: the log, `recordEvent`, calls in create / import / PATCH / PUT / DELETE / approve / reject / execution, `GET /api/orders/:id/events`.
- `practice-app-v2/public/order-details.html`: the Activity section.
- `practice-app-v2/public/static/app.js`: render the list, refresh it after actions and during execution polling.
- `practice-app-v2/public/static/styles.css`: list styling.
- `practice-app-v2/tests/activity.test.js`: node:test coverage.

## API change
New: `GET /api/orders/:id/events` (any signed-in user, same as the details page): `200` array, `401`, `404 { "error": "Order <id> not found." }`. No existing response changes shape.

## Risks / open questions
- **Q1 (cancelled):** `DELETE` removes the order, so `GET /api/orders/:id/events` answers 404 afterwards (same rule as the details page). The `cancelled` event is recorded but can't be read through this endpoint. A global audit log is out of scope; tell me if you want deleted orders' events readable.
