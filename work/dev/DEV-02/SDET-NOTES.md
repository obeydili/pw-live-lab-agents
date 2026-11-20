# SDET-NOTES: DEV-02 Duplicate order
**SDET:** Claude · 2026-11-12 · Inputs: approved TEST-PLAN.md, FEATURE-SPEC.md, DEV-NOTES.md (app source not used to write tests)

## Round 2: fixes for the Reviewer's No-Go (2026-11-19)
Everything below the next heading is the round-1 report; where it conflicts with this section, this section wins.

### Blocking items
| Item | Owner | Status |
|---|---|---|
| **B1** hardcoded password in `practice-app-v2/tests/duplicate.test.js:92` | **Developer** | **Not touched by me** (app lane). Needs the Developer: remove the literal and read the credential from config, or use a credential-free test helper. This is an app *test* change, not an app behaviour change |
| **B2** TC11/AC4 app test only checks the list of ids, so a mutated source goes unnoticed | **Developer** | **Not touched by me.** Needs the Developer: capture the source order before the duplicate request and compare every field afterwards (same file, `:97`–`:98`). No app code change and no new hook needed. This is also the gap I listed in round 1 |
| **B3** approved value/persistence/status assertions | SDET | Fixed |
| **B4** POM navigation wait and accessible roles | SDET | Fixed |
| **B5** shared types not in `types/` | SDET | Fixed |

So: **no fix depends on a change to app behaviour.** B1 and B2 are Developer-owned test files, and TC11 stays "Partial" until the Developer fixes B2.

### What changed (SDET)
- **B3**
  - TC02, TC03, TC04, TC06 now also compare the copy to `GET /api/orders/:id` and the order list (`expectCopyPersisted`). A GTC copy that is stored as Day now fails TC03.
  - TC13, TC16: after the redirect, the copy is read back through the API. TC19's real retry now gets the full TC13 treatment: response captured and checked (201, copy fields), landed id equals the created id, one request, persisted, source unchanged.
  - TC21: the source is checked to hold the requested boundary value (`toMatchObject(overrides)`) before it is duplicated. Boundary overrides are now built inside the test, so the GTD "today" date is computed at run time and not at file load.
  - TC22: the ordinary order's submitted input is kept and its `clientOrderId` is compared with it, not just "not null".
  - `ApiClient` now requires the exact success code before parsing: 201 for create, 200 for get, list, events, patch, put, approve, reject (204 for delete was already exact). A wrong 2xx now fails the test.
- **B4**
  - `OrderDetailsPage.open()` now waits for the details URL after `goto` (via `waitForURL`; it still allows gating the detail response because the gate is on the API call, not the navigation).
  - Flash and toast keep their test-id locators (the plan names those ids) and every assertion on them now also asserts the role: `expectFlash()` checks `status` + exact text, `expectToast()` checks `alert` + text, and TC18 asserts the role on the hidden flash. Applies to TC13, 16, 17 (both loads), 18, 19, 20, 23.
  - TC14 also asserts `toBeVisible` before `toBeEnabled` (the Reviewer's non-blocking suggestion).
- **B5**
  - New `types/api.ts` holds `JsonResponse`, `OrdersQuery` and `RequestOptions`. `helpers/readJson.ts` and `helpers/api-client.ts` import them as types. TC20 reuses `ErrorResponse` from `types/order.ts` instead of a local `{ error: string }`.

### Do the new assertions fail when they should? (checked, scratchpad copy of the app only)
Baseline on the unmodified copy: 52 passed.

| Fault in the copy | Result |
|---|---|
| duplicate response says the right `timeInForce` but the stored copy is `Day` | 13 failed, including TC03 and the TC13/16/17 UI cases (before the fix TC03 stayed green) |
| flash element loses `role="status"` | 6 failed (TC13, 16, 17, 18, 19, 23) |
| toast loses `role="alert"` | 2 failed (TC19, TC20) |

### Round-2 commands (real output)
App on :3300 was **not running** when I started this round (connection refused, so the first serial run showed 40 failures that were not test failures). I started it with `PORT=3300 npm --prefix practice-app-v2 start` and did not change or reset anything in it.
```
$ npm run typecheck
> tsc --noEmit            (exit 0, no output)

$ npm run test-alone
  54 passed (38.5s)

$ npm test   (run 1)
  54 passed (10.3s)
$ npm test   (run 2)
  1 failed
    [chromium] › tests/orders/hybrid-create.spec.ts:7:1 › trader can create order via API and see it in UI @hybrid
  53 passed (10.3s)

$ npx playwright test tests/duplicate --repeat-each=2
  104 passed (16.2s)
```
The run-2 failure is the known `tests/orders/hybrid-create.spec.ts` collision (QA-01). I reproduced it in isolation again: `Error: Failed to create order: 409 Conflict` (both tests use `Date.now()` as `clientOrderId`). Not in my specs, not changed by me. The Reviewer did not list it as blocking and did not reproduce it, but it is still there, so "parallel green" can fail at random until QA-01 is done.

### Still open
- B1 and B2 (Developer, above).
- The `hybrid-create.spec.ts` flake (QA-01).
- The UTC-midnight edge in TC21 is smaller now (override built at test time), but a rollover between building the date and creating the source can still fail instead of skip. Not worth more machinery.

# Round 1 report (2026-11-12)

## Summary
- 52 new Playwright tests in `tests/duplicate/` cover plan rows TC01–TC10, TC12–TC29 (TC01, TC14, TC21, TC28 expand into variants). TC11 (AC4) is the accepted app-level case, not a Playwright test.
- **No app bug found, no BUG file.** The app matched FEATURE-SPEC in every check.
- **One failure outside my files:** the existing `tests/orders/hybrid-create.spec.ts` is flaky in parallel (see "Flaky behaviour"). It is the QA-01 scope. Because of it, `npm test` was green in 3 of 4 full parallel runs, so the Definition of Done item "parallel is green" is **not cleanly met** until QA-01 lands.

## Commands run (real output, app on :3300 with the DEV-02 code)
```
$ npm run typecheck
> tsc --noEmit            (exit 0, no output)

$ npm run test-alone      (--workers=1)
  54 passed (38.1s)

$ npm test                (parallel), final run A
  54 passed (10.3s)
$ npm test                (parallel), final run B
  1 failed
    [chromium] › tests/orders/hybrid-create.spec.ts:25:1 › trader2 can create order via API and see it in UI @trader2
  53 passed (10.3s)
  (two earlier full parallel runs, before the final ones: 54 passed (10.3s) and 54 passed (10.2s))

$ npm --prefix practice-app-v2 test
ℹ tests 73   ℹ pass 73   ℹ fail 0
```
54 = 52 new + the 2 existing hybrid-create tests. The serial run is slower because six tests wait about 5 s for an Approved source to reach Filled.

## Plan case → test map
Every test carries an annotation `plan: TCnn` so the Reviewer can filter. Tests are in `tests/duplicate/`.

| Plan | File | Test(s) |
|---|---|---|
| TC01 | `create.spec.ts` | 6 tests: Pending Approval / Approved / Rejected × own / other trader |
| TC02 | `create.spec.ts` | should apply create defaults when optional ticket inputs were omitted |
| TC03 | `create.spec.ts` | should retain GTC semantics when a source has no date and an empty note |
| TC04 | `create.spec.ts` | should ignore supplied order overrides when duplicating |
| TC05 | `create.spec.ts` | should create distinct orders when the same unique-client-id source is duplicated twice |
| TC06 | `create.spec.ts` | should start an independent creation history when duplicating a decided source |
| TC07 | `refused.spec.ts` | 2 tests: existing id / unknown id, no token |
| TC08 | `refused.spec.ts` | 2 tests: existing id / unknown id, approver |
| TC09 | `refused.spec.ts` | should leave orders unchanged when an invalid token is supplied |
| TC10 | `refused.spec.ts` | 2 tests: never-created id / deleted id |
| TC11 | not a Playwright test | AC4 → `practice-app-v2/tests/duplicate.test.js` ("AC4: copied fields that no longer pass POST validation give 400 with details, and nothing is created"), passes in the 73/73 app run above. See "AC4" below |
| TC12 | `create.spec.ts` | should allocate independent copies when two traders duplicate concurrently |
| TC13 | `duplicate-ui.spec.ts` | should navigate to the new copy when the trader activates Duplicate order with the keyboard |
| TC14 | `duplicate-ui.spec.ts` | 9 tests: trader × 3 statuses × own/other (6), approver × 3 statuses (3) |
| TC15 | `duplicate-ui.spec.ts` | should hide duplication until source details finish loading |
| TC16 | `duplicate-ui.spec.ts` | should prevent a second submission while duplication is in flight |
| TC17 | `duplicate-ui.spec.ts` | should recover source attribution when sessionStorage has no copy source |
| TC18 | `duplicate-ui.spec.ts` | should hide the duplicate flash when the flag is absent |
| TC19 | `duplicate-ui.spec.ts` | should render validation details and allow retry when the endpoint refuses (stubbed 400, UI handling only) |
| TC20 | `duplicate-ui.spec.ts` | should recover on a real not-found response when the source was deleted after loading |
| TC21 | `create.spec.ts` | 5 tests: quantity 1, quantity 1,000,000, price 0.01, 200-char notes, GTD today (UTC) |
| TC22 | `create.spec.ts` | should share the existing id allocator with ordinary creation |
| TC23 | `duplicate-ui.spec.ts` | should preserve the existing creation flash when created=1 is used |
| TC24 | `copy-lifecycle.spec.ts` | 2 tests: PATCH and PUT |
| TC25 | `copy-lifecycle.spec.ts` | should approve a copy independently when an approver acts |
| TC26 | `copy-lifecycle.spec.ts` | should reject a copy independently when an approver acts |
| TC27 | `copy-lifecycle.spec.ts` | should remove only the copy when its owner cancels |
| TC28 | `copy-lifecycle.spec.ts` | 4 tests: other trader, approver, approved copy, rejected copy |
| TC29 | `refused.spec.ts` | should reject malformed JSON before duplicating |

AC → tests: AC1 TC01–04, 12, 21, 22 · AC2 TC01–06, 12 · AC3 TC07–10, 20 · AC4 TC11 (app level) · AC5 TC13–20, 23 · AC6 TC06, 12, 17.

## How the plan's hard parts were done
- **Isolation (TC07–10, 20, 22, 28, 29):** the plan requires "no other writers". Fixture `isolatedDesk` starts a private `practice-app-v2/server.js` on a free port for that one test and kills it in `finally` (`helpers/isolated-app.ts`). The shared :3300 app is never reset or reconfigured. No app code changed. NO-CREATE = the full order list (id set and every field) is identical before and after the refused request.
- **Source data:** every test creates its own source through the API with a unique `clientOrderId` (`data/orders.ts`). Approved sources are polled to `Filled` (5 s budget, the plan's number) before the snapshot. No global reset, no `fillDelayMs` change.
- **TC13/TC16:** the duplicate response body is read inside a route handler (`tests/support/duplicate-network.ts`), because the page navigates away from the response. My first version read it after navigation and failed with "Response body is not available" (found in the first run, fixed). TC16 holds the real request behind a gate and counts requests that reach the server.
- **TC09 observed (for the record, per Omer's exception):** invalid Bearer token answered `401 {"error":"Authentication required."}`. The test does not assert this; it asserts no order was created and nothing changed.

## AC4 (TC11) mapping and a gap for the Developer
Mapped to the existing app-level test, per Omer. I read `duplicate.test.js` (assertions only). It asserts the exact `400 { error, details.goodTillDate }` body and that the list is still only the seed order (so nothing was created). It does **not** assert the source order is unchanged, which TC11 lists as UNCHANGED. Minor, and the source is read-only in the route, but the gap belongs to the Developer. I did not touch app code.

## Do the tests fail when the app is wrong? (checked)
I copied `practice-app-v2` to my scratchpad, broke the copy one way at a time, and ran `tests/duplicate` against it (`BASE_URL`, `APP_DIR`). Repo app code was never modified. Baseline on the unmodified copy: 52 passed.

| Deliberate fault in the copy | Result |
|---|---|
| copy keeps the source `clientOrderId` | 31 failed |
| copy keeps the source `decidedBy` | 5 failed (the Approved/Rejected cases, TC06) |
| approver allowed to duplicate | 2 failed (TC08) |
| duplicate edits the source (`updatedAt`) | 29 failed |
| "Duplicate order" button never disabled | 2 failed (TC16, TC12) |
| button hidden for Rejected orders | 2 failed (TC14) |
| wrong `duplicatedFrom` in the created event | 3 failed (TC06, TC12, TC17) |
| copy owned by the source's creator | 4 failed (TC01 other-trader, TC12) |

## Framework changes made (my lane)
- `types/order.ts`: ticket fields on `CreateOrderRequest`, `UpdateOrderRequest`, `UserKey`, `ErrorResponse`, `ValidationErrorResponse`, `OrderEvent`. `Order` now extends `Omit<CreateOrderRequest, 'notes'>`.
- `helpers/api-client.ts`: typed `listOrders`, `getOrderEvents`, `duplicateOrder(Response)`, `patchOrder(Response)`, `putOrder`, `deleteOrder(Response)`, `approveOrder`, `rejectOrder`, `getOrderResponse`, `ApiClient.withToken`. **Behaviour change:** with no token, no `Authorization` header is sent (it used to send `Bearer null`).
- `helpers/api-client-pool.ts`, `helpers/isolated-app.ts` (new), `helpers/readJson.ts` (accepts any response with `status/url/json`), `helpers/env.ts` (`credentials` map, optional `APP_DIR`), `data/orders.ts` (builders, `utcDate`), `pages/order-details.page.ts`, `fixtures/desk.ts`, `fixtures/index.ts`.
- `fixtures/index.ts`: `apiClient`, `trader2ApiClient`, `approverApiClient` now each get their **own** request context (they used to share one, so the cookie from the last login could leak between roles), closed in `finally`. New fixtures: `desk`, `isolatedDesk`, `openSession`, `clientPool`. Existing fixture names are unchanged. `expect` is re-exported from `fixtures/index.ts`.

## Judgment calls to confirm (STANDARDS: flagged, not silently broken)
1. **`tests/support/`** holds `duplicate-assertions.ts` and `duplicate-network.ts`. They use `expect`, so they cannot live in `helpers/`. They are not specs and not page objects. OK to keep, or should shared assertions live somewhere else?
2. **UI tests sign in with an API login cookie** (`openSession`), not `LoginPage.login()`, because `LoginPage.login()` still has the missing-`waitForURL` race that QA-01 fixes. The existing `traderPage`, `trader2Page`, `approverPage` fixtures are unchanged and still have that race (my tests do not use them).
3. **The `for` loops in `tests/duplicate/*.spec.ts`** only generate the variant tests (matrix, boundaries). The loops in `fixtures/desk.ts` and `duplicate-assertions.ts` are page walks until a short page.
4. **TC21 GTD-today** skips itself if UTC midnight passes during setup (the plan allows skip/recreate). It did not skip in my runs.
5. **TC16:** the second activation is a key press on a button that is already disabled, so on its own it is a weak proof. The request counter plus the fault check above (button never disabled → red) is what makes it meaningful.

## Flaky behaviour
- **`tests/orders/hybrid-create.spec.ts` (existing, not mine, QA-01 scope):** both tests create an order with `clientOrderId: \`${Date.now()}\``. When the two parallel workers hit the same millisecond, the second `POST /api/orders` answers `409 Conflict` and the test fails with `Failed to create order: 409 Conflict` (`helpers/api-client.ts:86`). Reproduced: 1 failure in 2 consecutive 2-test parallel runs, and 1 in the second full `npm test`. Serial never fails. Cause is shared/colliding data, not timing. Fix is the QA-01 item "unique data" (`uniqueClientOrderId()` now exists in `data/orders.ts`). I did not change that spec (one ticket at a time).
- My 52 tests: no failures in 2 full serial runs, 4 full parallel runs and 1 baseline run on the scratchpad app copy, after fixing my own TC13/TC16 body-read race found in the very first run. No retries, no `waitForTimeout`, no timeout increases.

## Definition of Done (TEST-STANDARDS §10)
1. typecheck clean: yes.
2. `test-alone` green: yes, 54 passed.
3. `npm test` green: **partly**: 54 passed in 3 of 4 full runs, and 53 passed + 1 failed in one; the one failure is the pre-existing hybrid-create collision above.
4. No `any`, sleeps, `.only`, unused imports, commented-out code: grep over `types helpers fixtures pages data tests` found none (one false positive: the word "any" in an assertion message). The only timer is the 15 s start-up timeout in `helpers/isolated-app.ts`, not a wait inside a test.
5. Every approved plan case maps to a test: yes, TC11 to the app-level case (table above).
6. No changes outside my lane: `git status` shows no change to `practice-app-v2/`, `agents/` or `.env*` from me (the `practice-app-v2/` modifications in the tree are the Developer's). No secrets in code; credentials only through `helpers/env.ts`. `.env` was not read.
7. Reviewer Go: pending.

## Not run / not covered
- Playwright coverage of AC4 (expired GTD): intentionally app-level only, per Omer.
- Exact response for an invalid token: not asserted (Omer's exception).
- Manual/exploratory items in the plan (focus visibility, toast readability, console errors): not done.
- Any browser other than Chromium.
