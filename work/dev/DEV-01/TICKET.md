# DEV-01: Order activity history
**Written by:** Omer · **Branch:** `dev/01-order-history`

## User story
As a trader or approver, I want to see an order's activity history on its details page so that I know who changed it, what changed and when.

## Scope
- In: record an event every time an order is created, edited (PATCH/PUT), approved, rejected (with its reason), changes execution status (Working → Partially Filled → Filled) or is cancelled. Add an API endpoint that returns an order's events, oldest first. Add an "Activity" section on `/orders/:id` that lists the events.
- Out: a global audit log page, and filtering or exporting the history.

## Notes / constraints
- Each event has a timestamp, the actor's username (or "system" for execution updates), an action and the relevant details (for example the old and new quantity).
- Use the same access rules as the order details page.
- Keep existing endpoints and responses working.

## Done when
- PLAN.md is approved, FEATURE-SPEC.md and DEV-NOTES.md are written, and the app runs on :3300.
