# PLAN: QA-01 Make the hybrid orders spec parallel-safe and tidy the repo basics
**Author:** SDET (Claude) · **Branch (from ticket):** `qa/01-parallel-safe` · **Status:** waiting for Omer's OK

## Evidence (before any change)
`npx playwright test tests/orders/hybrid-create.spec.ts --repeat-each=15` (30 tests, parallel, app on `:3300`): **23 passed, 7 failed.** Two different causes:

| Count | Error | Root cause |
|---|---|---|
| 5 | `Failed to create order: 409 Conflict` (`api-client.ts:77`) | Both tests use `clientOrderId: \`${Date.now()}\``. Two workers in the same millisecond send the same id, and the app refuses a duplicate `clientOrderId`. Shared value, not a timing problem to wait out. |
| 2 | `page.goto: net::ERR_ABORTED at /orders` | `LoginPage.login()` returns right after the click. The sign-in navigation to `/orders` is still running when the spec calls `goto('/orders')`, so the second navigation aborts the first. |

(No `retries` or waits will be added. Each cause gets a real fix.)

## Changes, one per ticket task

### 1. Login race
- `pages/login.page.ts`: `login()` ends with `await this.page.waitForURL('/orders')` (the page object waits for where it lands, TEST-STANDARDS §3). Locators stay as they are; I'll also use the `username`/`password` labels as they are today.
- `pages/orders.page.ts`: replace `navigate(url)` (a `goto`) with `reload()` (`await this.page.reload()`), because after login the page is already on `/orders` and the spec only needs a fresh list that includes the order it just created through the API.
- `tests/orders/hybrid-create.spec.ts`: call `ordersPage.reload()` / `orders.reload()` instead of `navigate('/orders')`. Keep `await expect(traderPage).toHaveURL('/orders')` in test 1.
- `fixtures/index.ts`: no change needed (`traderPage`, `trader2Page`, `approverPage` already call `login()`, and now come back on `/orders`). I will check the three fixtures still work.
- Side effect to note: `login()` now only suits a **valid** login (a bad password stays on `/login` and would time out on `waitForURL`). The negative-login test (T11) will need its own method (for example `submit()` that only clicks). Not added now, because nothing uses it yet.

### 2. `hybrid-create.spec.ts` parallel-safe
- Unique data from `data/orders.ts` (`buildOrder({ quantity: 300, limitPrice: 20 })`, which sets a `DEV02-<uuid8>` `clientOrderId`). Because that prefix says DEV-02, I'll make the default prefix neutral (`'ORD'`-style, e.g. `uniqueClientOrderId()` → `TEST-<uuid8>`); DEV-02 tests assert on the id they created, not on the prefix, and I'll re-run them to prove it.
- Remove the commented-out `//await apiClient.reset();` lines (no global reset, §6; commented code is not allowed, §2).
- Remove the unused imports: `APIResponse`, `readJson`, `Order`. Also take `expect` from `fixtures/index` (specs import `test` and `expect` from there only, §1).
- The two tests stay as two tests (trader1, trader2). I will not rename them or change tags unless you say so. Standards §5 want `should … when …` names and a `test.describe`, and `@trader2` is not on the §5 tag list; I'll **list these in SDET-NOTES.md as suggestions**, not do them (outside the ticket).
- Each test still asserts that its own row (found by its order id) shows `Pending Approval`.

### 3. `ApiClient.me()` message
- `helpers/api-client.ts:66`: `Failed to get order` → `Failed to get current user`. I'll check the other messages in the same file at the same time and only touch ones that are plainly wrong, and list them.

### 4. `.gitignore`
Add, keeping what is already there:
```
.env.*
!.env.example
.auth/
.DS_Store
```
- The existing `/.env` stays. `.auth/` (unanchored) also covers the existing `/playwright/.auth/`, which stays.
- **Decision for you:** `.DS_Store` and `practice-app-v2/.DS_Store` are **already tracked** by git (`git ls-files` lists them, and `git status` shows `M .DS_Store`). Ignore rules do not apply to tracked files. To really stop them showing up I would need `git rm --cached .DS_Store practice-app-v2/.DS_Store`. I will **not** do that without your OK, and `practice-app-v2/` is not mine to touch. Default: add the ignore rules only, and note this in SDET-NOTES.md.

## Not changing
`practice-app-v2/`, `agents/`, `.env*`. No app change is needed. Nothing here depends on the Developer.

## Acceptance checks and how I will prove them
| Check | Command | Pass means |
|---|---|---|
| typecheck clean | `npm run typecheck` | 0 errors |
| serial green | `npm run test-alone` | all pass (54 DEV-02 tests + 2 hybrid) |
| parallel green | `npm test` | all pass |
| the flake is gone | `npx playwright test tests/orders/hybrid-create.spec.ts --repeat-each=15` before/after, then `--repeat-each=50` after | 0 failed (before: 7 of 30) |
| the whole suite under load | `npm test -- --repeat-each=3` | 0 failed |
| login race really fixed (not hidden) | temporarily remove the `waitForURL` from `login()` and re-run the hybrid spec with `--repeat-each=15` | `ERR_ABORTED` comes back; then restore it |
| unique-id fix really fixed | temporarily restore `Date.now()` ids and re-run | `409` comes back; then restore it |
| no leftovers | `rg -n "waitForTimeout\|Date.now\|reset\(" tests/orders pages` and the unused-symbol check on the files I touch | no hits |
| `.gitignore` | `git check-ignore -v .env.local .auth/x .DS_Store` and `git check-ignore -v .env.example` | first three ignored, `.env.example` not |
| DEV-02 not broken | `npx playwright test tests/duplicate` | still 52 passed |

## Risks / questions
- Q1 (above): untrack the two `.DS_Store` files, yes or no? Default is no.
- Q2: OK to change the default `clientOrderId` prefix in `data/orders.ts` from `DEV02` to a neutral one? Default is yes, because a QA-01 test should not carry another ticket's name.
