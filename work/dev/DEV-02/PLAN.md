# DEV-02 plan: Duplicate order

**Developer:** Claude · **Approval:** Omer asked for the implementation directly in chat (2026-11-12), so this plan is the record of the approach, not a gate.

## Approach
- `POST /api/orders/:id/duplicate`, registered next to approve/reject, behind `requireRole('trader')` (so the global auth check gives 401 and the role check 403 before the 404 lookup).
- Build a create body from the source: `symbol`, `side`, `quantity`, `limitPrice`, `timeInForce`, `goodTillDate`, `urgent`, `notes`, with `clientOrderId: null`. Run it through the same `validateOrder` as `POST /api/orders` (400 with `details`, e.g. a GTD source whose date is now in the past), then the same `createOrder` (new `ORD-n`, Pending Approval, `ticketFields` defaults). Any request body is ignored. The source isn't touched.
- With DEV-01 in place, the new order's `created` event records `source: "duplicate"` and `duplicatedFrom`.

## UI
- `#order-actions` on `/orders/:id`: a "Duplicate order" button (`data-testid="duplicate-order"`) for traders on any order; it's rendered only after the order has loaded, and disabled while the request runs.
- Success: remember the source id for the next page (sessionStorage), then go to `/orders/<newId>?duplicated=1`; that page shows `Order <newId> created as a copy of <sourceId>.` in `#flash` (which gets `data-testid="flash"`). If the source id isn't in sessionStorage (e.g. the URL opened in another tab), it's read from the order's `created` event.
- Failure: the existing toast with the API error (and the validation messages); the page stays.

## Files
`practice-app-v2/server.js`, `public/order-details.html` (`data-testid="flash"`), `public/static/app.js`, `tests/duplicate.test.js`.

## Out of scope (as the ticket says)
No action on the `/orders` table, no confirm dialog, no copied `clientOrderId`, no editing before save, no change to Cancel, Approve or Reject.
