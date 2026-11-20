# DEV-04: Inline validation on the order ticket
**Written by:** Omer · **Branch:** `dev/04-inline-validation`

## User story
As a trader, I want inline error messages on the new-order form so that I can see which field is wrong and how to fix it, using the same wording the API already returns.

## Scope
- In: per-field inline errors on `/orders/new` (`public/order-new.html` and `initOrderNew` in `public/static/app.js`). Messages must match the existing `FIELD_RULES` in `practice-app-v2/server.js`. If `POST /api/orders` returns `400` with `details`, map those messages onto the same inline slots.
- Out: any API or `FIELD_RULES` change, an edit form on the details page, enabling Submit for an invalid ticket, toasts for field errors, and a notes error (the textarea already has `maxlength="200"`).

## Acceptance criteria
- AC1: Given a trader on `/orders/new`, when the page first loads, then no field errors are shown (do not paint a wall of red on an empty ticket).
- AC2: Given a trader has interacted with a field (blur, or a change after that field was shown as invalid), when the value is invalid, then that field's error becomes visible with the exact API message below, the control has `aria-invalid="true"`, and `aria-describedby` includes the error element's id (keep `quantity-help` and `price-help` in `aria-describedby` as well). When the value becomes valid, the error is hidden and `aria-invalid` is `"false"` or removed. Several fields may be invalid at once.
- AC3: Given Time in force is not GTD, the good-till-date error stays hidden. Given the trader chooses GTD and leaves the date empty, or picks a date before today (UTC, same rule as `FIELD_RULES.goodTillDate`), the good-till-date error is shown. Switching away from GTD hides the date field (existing behaviour) and clears that error.
- AC4: Submit stays disabled until the ticket is valid (keep the existing `isValid` behaviour). The form-level `#order-error` stays the `role="alert"` for non-field failures. On a `400` from `POST /api/orders` with `details`, render each `details` entry inline on its field and do not only concatenate them into `#order-error`. Do not change `POST /api/orders`.
- AC5: The quote iframe, limit-price tooltip, notes counter, GTD conditional field and the existing `#order-error` still work.

Exact messages (copy these, they already live in `FIELD_RULES`):
- `symbol`: `Choose a valid symbol.`
- `side`: `Side must be Buy or Sell.`
- `quantity`: `Quantity must be a whole number from 1 to 1000000.`
- `limitPrice`: `Limit price must be greater than 0 with at most 2 decimals.`
- `goodTillDate` when GTD and the date is missing or in the past: `Good till date is required for GTD and cannot be in the past.`

An empty symbol, a missing side, a blank/zero/fractional quantity, a blank/zero/3-decimal limit price are all invalid and must use those messages. Time in force is a closed select with a valid default, so no `error-timeInForce` is required.

## API
None. This ticket is UI-only. `POST /api/orders` already answers `400 { "error": "Validation failed.", "details": { <field>: <message> } }` (see `practice-app-v2/server.js`). Do not change that contract.

## DOM spec
| Page/route | Element | Role + accessible name | data-testid | Behaviour |
|---|---|---|---|---|
| `/orders/new` | Symbol error, next to `#symbol` | text, referenced from the select via `aria-describedby` | `error-symbol` | Hidden until AC2; text is the symbol message. |
| `/orders/new` | Side error, next to the Side fieldset | text, referenced from the radios (or the fieldset) via `aria-describedby` | `error-side` | Hidden until AC2; text is the side message. |
| `/orders/new` | Quantity error, next to `#quantity` | text, referenced from the input via `aria-describedby` (together with `quantity-help`) | `error-quantity` | Hidden until AC2; text is the quantity message. |
| `/orders/new` | Limit price error, next to `#limitPrice` | text, referenced from the input via `aria-describedby` (together with `price-help`) | `error-limitPrice` | Hidden until AC2; text is the limit-price message. |
| `/orders/new` | Good till date error, inside `#good-till-date-field` next to `#goodTillDate` | text, referenced from the date input via `aria-describedby` | `error-goodTillDate` | Hidden unless Time in force is GTD and the date is invalid (AC3). |
| `/orders/new` | Existing form-level error `#order-error` | `alert` | `order-error` (add this test id to the existing paragraph) | Still used for non-field failures. Hidden when there is nothing to show. |

Use the existing `.error` class on the field errors. Do not give each field error `role="alert"`; keep that on `#order-error` only.

## Notes / constraints
- Only touch `practice-app-v2/`. Keep existing endpoints and responses working.
- The form already has `novalidate` and a single `#order-error` that joins `details` into one string; replace that joined-details behaviour with the inline mapping in AC4.
- Every new interactive or error element needs a stable `data-testid`.
- A small hook check in `practice-app-v2/tests/pages.test.js` (it already asserts `data-testid`s in the HTML) is welcome. Do not put credentials in the ticket folder.

## Done when
- PLAN.md is approved, FEATURE-SPEC.md and DEV-NOTES.md are written, and the app runs on :3300.
