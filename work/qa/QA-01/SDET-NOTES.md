# SDET-NOTES: QA-01 Make the hybrid orders spec parallel-safe and tidy the repo basics
**Author:** SDET (Claude) · **Branch:** `qa/01-parallel-safe` (created from `main`; nothing committed)

## Result
The hybrid spec went from **7 failed of 30** parallel runs to **0 failed of 130** (30, then 100). typecheck is clean, `test-alone` 54/54, `npm test` 54/54, `npm test --repeat-each=3` 162/162. No app change and nothing needed from the Developer.

## Ticket task → what changed
| Ticket task | Change | File |
|---|---|---|
| `login()` waits for `/orders` | added `await this.page.waitForURL('/orders')` after the click | `pages/login.page.ts` |
| `reload()` instead of `goto` | `OrdersPage.navigate(url)` (a `goto`) replaced by `reload()`; the spec calls it | `pages/orders.page.ts`, `tests/orders/hybrid-create.spec.ts` |
| Parallel-safe, unique data, no global reset | `buildOrder({ quantity: 300, limitPrice: 20 })` gives a `TEST-<uuid8>` `clientOrderId`; the commented-out `reset()` lines are gone | `tests/orders/hybrid-create.spec.ts` |
| Unused imports | removed `APIResponse`, `readJson`, `Order`; `expect` now comes from `fixtures/index` | `tests/orders/hybrid-create.spec.ts` |
| `me()` message | `Failed to get order` → `Failed to get current user` (the other messages in the file are correct) | `helpers/api-client.ts` |
| `.gitignore` | added `.env.*`, `!.env.example`, `.auth/`, `.DS_Store` | `.gitignore` |
| Omer's decisions on the plan | `.DS_Store` untracked (`git rm`, staged, not committed): `.DS_Store`, `practice-app-v2/.DS_Store`; untracked `tests/.DS_Store` deleted. Default id prefix `DEV02` → `TEST` | git index, `data/orders.ts` |

## Root causes (measured before any change)
`--repeat-each=15` on the hybrid spec: 23 passed, 7 failed.
- 5 × `Failed to create order: 409 Conflict`: both tests used `Date.now()` as `clientOrderId`, so two workers in one millisecond collided.
- 2 × `page.goto: net::ERR_ABORTED at /orders`: `login()` returned before the sign-in navigation finished, and the spec's `goto` cut it off.

## Acceptance checks, real output
| Check | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean, no output |
| serial | `npm run test-alone` | `54 passed (38.4s)` (run twice) |
| parallel | `npm test` | `54 passed (10.3s)` |
| whole suite under load | `npm test -- --repeat-each=3` | `162 passed (22.6s)` |
| the flake is gone | hybrid spec `--repeat-each=15` / `--repeat-each=50` | `30 passed (3.8s)` / `100 passed (10.9s)` (before: 7 failed of 30) |
| DEV-02 still fine | `npx playwright test tests/duplicate` | `52 passed (10.3s)`, so the id-prefix change broke nothing |
| `.gitignore` | `git check-ignore -v` | `.env.local`, `.auth/x`, `.DS_Store`, `tests/.DS_Store` ignored; `.env.example` not ignored |
| hygiene | `rg "waitForTimeout\|Date.now\|\.reset\(\|navigate\(" tests pages helpers fixtures data` | only `tests/support/duplicate-assertions.ts:64,66`, which timestamps a measurement window (DEV-02), not an id |

## Fault injection (each fix is load-bearing)
Done on the working files, restored afterwards (checked with `grep`).
- Removed the `waitForURL` from `login()`: hybrid spec `--repeat-each=15` → **29 failed of 30** (`toHaveURL` / row not found). The wait is what makes the page ready.
- Put `Date.now()` back as `clientOrderId`: **3 failed of 30**, `409 Conflict`. The collision comes back.

## Notes and things I did not do
- `login()` now only suits a valid login. A wrong password stays on `/login` and would time out on `waitForURL`. The negative-login test (T11) will need its own method (for example one that only clicks Sign in). Not added, nothing uses it yet.
- `.DS_Store` deletions are staged in git but **not committed** (no commit was asked for). The branch `qa/01-parallel-safe` was created from `main` with the working tree as it was, so the DEV-02 files are also uncommitted in this tree.
- Suggestions outside the ticket, not done: name the hybrid tests `should … when …` inside a `test.describe` (TEST-STANDARDS §5), and `@trader2` is not on the §5 tag list.
- Environment: Node 25.5 locally (repo says 24), app started on `:3300` by hand.
