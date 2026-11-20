# REVIEW: DEV-02
**Reviewer:** Codex · **Date:** 2026-11-20 · **Integration branch:** qa/01-parallel-safe · **Base/Head:** afdcf47a1dc91b3cefd9603ff8ff8d1c113bc804 plus the existing working tree
**Reviewed against:** DEV-02 TICKET.md, FEATURE-SPEC.md, TEST-PLAN.md (Hub approved 2026-11-12T17:08:12.392Z), DEV-NOTES/SDET-NOTES, TEST-STANDARDS, QA-01 dependency review and Developer's BUG-1 repair.

## Verdict: Go

**All 29 plan cases are Covered, including every P1. B1–B5, QA-01 dependency R1 and BUG-1 are resolved.** Typecheck passed; serial 54/54, parallel 54/54, full repeat 162/162, focused repeat 150/150 and app tests 77/77. No blocking issue remains.

This final report supersedes the prior No-Go: the original exact event assertion is retained, the app producer is fixed, and the previously failing TC06 passed 50 focused repetitions in addition to the full suites. No gate waiver is assumed.

## What I checked

- Re-read current repository/role/standards, approved feature contracts/common COPY/UNCHANGED/NO-CREATE/EVENT requirements, prior 29-case mapping and author notes. Rechecked QA-01's source changes and all BUG-1 timestamp call sites/new app regression against the prior reviewed baseline.
- Prior complete review covered four duplicate specs, both duplicate support files, details POM, types/order.ts/types/api.ts, fixtures, API clients/pool, isolated app helper and data builder; those framework assertions remain unchanged by the Developer's BUG-1 fix. Rechecked TC06 and exact event helper and accepted app-level AC4 case directly.
- Reviewed current server.js diff, including order/event timestamp capture, and app tests/activity.test.js:176–242. All fixes are in the appropriate author's lane. DEV-01 integration context is present, but this is not a review or resumption of its separate ticket.
- All 52 Playwright duplicate variants executed serially, in normal parallel, and three times in the full repeat. Accepted TC11 custom-seed coverage ran in the 77-case app suite. TC09's exact invalid-token response exception remains honored; integrity checks remain required.
- Mutation spot-checks below reason about at least two P1 cases, including the newly deterministic bug regression. No code mutation, API reset or assertion weakening by reviewer.

## Closure of previous findings

| Finding | Result | Evidence |
|---|---|---|
| B1: literal password in AC4 | Closed | `practice-app-v2/tests/duplicate.test.js:84` uses startApp with a custom seed and `:88` calls seeded.login. `practice-app-v2/tests/helpers.js:6` resolves the fixture password from the existing seed user store, with no new literal credential. The custom-seed case reuses those users. |
| B2: missing source integrity on rejected duplication | Closed | `practice-app-v2/tests/duplicate.test.js:94`/`:95` capture full source/history; `:98`/`:99` check exact 400/body; `:102` checks the ID set; `:103`/`:104` compare full source/history after refusal. The source includes non-empty notes and urgent=true. |
| B3: persistence, boundary values, success contracts | Closed | TC02/03/04/06 call expectCopyPersisted (`tests/duplicate/create.spec.ts:58`, `:73`, `:97`, `:130`); UI TC13/16/19 confirm final API state (`duplicate-ui.spec.ts:44`, `:142`, `:219`). TC19 captures/checks the retry response at `:212`–`:218`. Boundary preconditions are compared at create spec `:176`; ordinary submitted client ID at `:204`. ApiClient requires 201 for create (`helpers/api-client.ts:76`) and 200 for reads/patch/put/decisions (`:87`, `:104`, `:114`, `:144`, `:155`, `:176`, `:187`). |
| B4: URL wait and flash/toast roles | Closed | `pages/order-details.page.ts:22` waits for the requested detail path. Test-ID locators retain the identified elements while support assertions explicitly check status/alert roles (`tests/support/duplicate-assertions.ts:185`, `:191`); hidden flash has a role assertion at UI spec `:180`. All affected UI paths use these checks. TC14 also adds explicit visibility at `:61`. |
| B5: shared API types | Closed | `types/api.ts:2`, `:8`, `:13` centralize JsonResponse, OrdersQuery, RequestOptions. Helpers/support import them as types. `tests/duplicate/duplicate-ui.spec.ts:5` imports ErrorResponse and `:241` uses it instead of repeating the shape. |
| R1: QA-01 collision/navigation | Closed | UUID builder IDs, waited login destination and reload; 100 current focused hybrid executions passed. |
| BUG-1: created-event timestamp | Closed for review | Shared producer reuses order.createdAt; deterministic app regression and TC06 50/50 passed. See detailed verification below. |

## BUG-1 verification

**Verified resolved.** `practice-app-v2/server.js:266` accepts a captured timestamp. Creation passes order.createdAt at `:528`, so ordinary POST, CSV import and duplication share the corrected producer. PATCH/PUT pass updatedAt at `:608`/`:632`; decisions pass decidedAt at `:665`; Filled passes filledAt at `:693`. Events without a matching order field retain the existing clock-based default. No order response fields or role/validation behavior were changed.

The focused app regression at `practice-app-v2/tests/activity.test.js:176` advances the clock on each argument-less Date construction. It asserts exact equality for POST/duplicate/import creation, both edit methods, approval/rejection and Filled (`:203`, `:208`, `:212`, `:217`, `:218`, `:225`, `:230`, `:231`, `:237`). Its finally block restores Date at `:239` and closes its isolated app. Separate clock reads would differ deterministically, so the original implementation cannot pass this test by chance. The app suite passed 77/77, and TC06 also passed 50/50 focused executions.

The original exact Playwright event assertion remains at `tests/support/duplicate-assertions.ts:143`, requiring at=copy.createdAt. No framework assertion, timeout or retry was changed to hide the bug. The Developer owns the app fix; the reviewer changed no implementation code.

## Runs (independent reviewer output)

All commands below exited 0. The Playwright runs used a fresh workspace app started with `PORT=3392 npm --prefix practice-app-v2 start`, and `BASE_URL=http://localhost:3392` for test configuration. This avoids relying on whether the existing port-3300 process had already been restarted after the fix. Private refusal-test instances also start from the current workspace app. No permanent configuration or environment file was edited.

```text
$ npm run typecheck
> pw-live-lab-agents@1.0.0 typecheck
> tsc --noEmit
```

```text
$ BASE_URL=http://localhost:3392 npm run test-alone
> playwright test --workers=1
Running 54 tests using 1 worker
54 passed (38.7s)
```

```text
$ BASE_URL=http://localhost:3392 npm test
> playwright test
Running 54 tests using 6 workers
54 passed (10.3s)
```

```text
$ BASE_URL=http://localhost:3392 npm test -- --repeat-each=3
> playwright test --repeat-each=3
Running 162 tests using 6 workers
162 passed (26.4s)
```

The full repeat covers all 52 DEV-02 tests three times (156 executions) plus the two hybrid tests three times (6 executions), satisfying the new/changed-spec flaky check.

```text
$ BASE_URL=http://localhost:3392 npx playwright test tests/orders/hybrid-create.spec.ts tests/duplicate/create.spec.ts:120 --repeat-each=50
Running 150 tests using 6 workers
150 passed (12.9s)
```

That focused run contains 50 executions of DEV-02 TC06, the previously failing creation-history case, and 50 of each QA-01 hybrid test (100 hybrid executions). No tolerance, skipped assertion or retry was introduced.

```text
$ npm --prefix practice-app-v2 test
> practice-app-v2@1.0.0 test
> node --test "tests/**/*.test.js"
✔ each event uses the exact timestamp its order records, even when clock reads differ (BUG-1) (7.935541ms)
ℹ tests 77
ℹ suites 0
ℹ pass 77
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 673.253791
```

Zero failures, skips or retries were reported in these verification runs. Earlier failed runs remain documented in BUG-1 and Hub history; these current results were obtained after a real app fix, not by repeating unchanged code until green.

Environment: Node v25.5.0 (repo specifies 24), Chromium; one serial / six parallel workers. Browser execution used permission to launch Chromium outside the sandbox. The reviewer stopped only the temporary port-3392 server after testing. The existing port-3300 app was not restarted or reset by this review; its in-memory version was not asserted. These results verify freshly loaded workspace code on port 3392. If another running instance still predates the fix, it needs a restart before using the updated code.

Not run: Node 24, other browsers, manual visual/console exploration, actual reviewer mutation execution, historical pre-fix baseline. Author mutation results were inspected but are not claimed as reviewer-executed results.

## Coverage vs approved plan

All 29 approved rows are Covered, including every P1; no missing or partial case remains. The following current test mappings and meaningful checks were retained from the prior complete review and validated by the current full/repeated suite. The BUG-1 producer repair leaves the exact assertions intact.

| Plan case | Test (file:line) | Coverage | Assertion strength |
|---|---|---|---|
| TC01 | `tests/duplicate/create.spec.ts:21` | Covered | Six status/owner cells; exact copied/reset fields, caller ownership, timestamp window, persistence, unchanged source/history. |
| TC02 | `tests/duplicate/create.spec.ts:42` | Covered | Exact defaults in response and persisted copy; unchanged source. |
| TC03 | `tests/duplicate/create.spec.ts:63` | Covered | GTC/null/false/null preserved in response/detail/list; unchanged source. |
| TC04 | `tests/duplicate/create.spec.ts:78` | Covered | Conflicting body ignored; exact shape, persisted values, source unchanged. |
| TC05 | `tests/duplicate/create.spec.ts:102` | Covered | Repeated copies have distinct IDs/null client IDs; both persist; source unchanged. |
| TC06 | `tests/duplicate/create.spec.ts:120` | Covered | Persisted copy has one exact independent creation event; decided source/history unchanged. |
| TC07 | `tests/duplicate/refused.spec.ts:14` | Covered | Existing/unknown ID; exact anonymous 401/body; isolated no creation or mutation. |
| TC08 | `tests/duplicate/refused.spec.ts:31` | Covered | Existing/unknown ID; exact approver 403/body; isolated no creation or mutation. |
| TC09 | `tests/duplicate/refused.spec.ts:49` | Covered | Invalid token observed, full state/source unchanged; exact response values excepted by Omer. |
| TC10 | `tests/duplicate/refused.spec.ts:70`, `:85` | Covered | Unknown/deleted source, exact 404/body, absence retained, no creation. |
| TC11 | `practice-app-v2/tests/duplicate.test.js:81` | Covered | Exact expired-GTD 400/details, unchanged ID set, complete source/history before/after equality. |
| TC12 | `tests/duplicate/create.spec.ts:136` | Covered | Concurrent callers, distinct IDs, correct ownership, both persisted, exact provenance, unchanged source/history. |
| TC13 | `tests/duplicate/duplicate-ui.spec.ts:24` | Covered | Keyboard activation, one real 201/copy, exact URL/status flash, final API persistence, source unchanged. |
| TC14 | `tests/duplicate/duplicate-ui.spec.ts:51`, `:74` | Covered | Nine variants; trader visibility/enabled/name/test ID, approver absence, pending-owner action order. |
| TC15 | `tests/duplicate/duplicate-ui.spec.ts:91` | Covered | Explicit detail-response gate; progressbar/action states before and after release. |
| TC16 | `tests/duplicate/duplicate-ui.spec.ts:118` | Covered | Gated real request, disabled action, repeated activation, exactly one request, correct URL/status/body/final API state. |
| TC17 | `tests/duplicate/duplicate-ui.spec.ts:147` | Covered | Empty-storage fallback and reload, exact status flash/provenance, unchanged persisted copy. |
| TC18 | `tests/duplicate/duplicate-ui.spec.ts:167` | Covered | Status role retained while flash hidden; source/copy remain unchanged. |
| TC19 | `tests/duplicate/duplicate-ui.spec.ts:187` | Covered | Scoped 400 stub, alert/details, retained URL/recovered action, source unchanged; real retry has full successful response/URL/flash/persistence checks. UI-only refusal handling, not AC4 backend proof. |
| TC20 | `tests/duplicate/duplicate-ui.spec.ts:224` | Covered | Real exact 404/body, alert, unchanged URL/recovered action, isolated no creation, source remains absent. |
| TC21 | `tests/duplicate/create.spec.ts:169` | Covered | Five boundary preconditions explicitly verified, exact copy and persisted values, source unchanged. |
| TC22 | `tests/duplicate/create.spec.ts:190` | Covered | Isolated shared counter, exact 201 creates, submitted ordinary client ID, persisted records. |
| TC23 | `tests/duplicate/duplicate-ui.spec.ts:251` | Covered | Exact original creation flash and status role. |
| TC24 | `tests/duplicate/copy-lifecycle.spec.ts:30`, `:49` | Covered | Exact 200 via client; PATCH/PUT quantity/timestamp/other fields, GET persistence, source unchanged. |
| TC25 | `tests/duplicate/copy-lifecycle.spec.ts:73` | Covered | Exact 200; decision actor/time, Working→Filled, filledAt, source unchanged. |
| TC26 | `tests/duplicate/copy-lifecycle.spec.ts:99` | Covered | Exact 200; rejection reason/actor/time, no execution, persisted result, source unchanged. |
| TC27 | `tests/duplicate/copy-lifecycle.spec.ts:120` | Covered | Exact 204/empty body, subsequent exact 404/body, source unchanged. |
| TC28 | `tests/duplicate/copy-lifecycle.spec.ts:139`, `:148`, `:157`, `:168` | Covered | Four role/state restrictions, exact 403/409/body; full state plus source/copy/history unchanged. |
| TC29 | `tests/duplicate/refused.spec.ts:102` | Covered | Exact malformed-body 400/body, isolated no creation, source unchanged. |

No unrelated new Playwright cases were added. The extra app test makes the app suite 77 rather than 76 and directly protects BUG-1. The hybrid tests are the QA-01 dependency, not additional DEV-02 plan rows.

## Mutation spot-check (at least two P1 cases)

| Test | Behavior break reasoned about | Assertion that would fail | Actual edit? |
|---|---|---|---|
| TC01, tests/duplicate/create.spec.ts:21 | Pass source.clientOrderId instead of null at practice-app-v2/server.js:713. | Reset-field check at tests/support/duplicate-assertions.ts:103. | No, reasoning only. |
| TC08, tests/duplicate/refused.spec.ts:31 | Remove trader role protection from practice-app-v2/server.js:702. | Exact 403 at support helper:74; creation despite a 403 also fails full isolated state checks at :178/:181. | No, reasoning only. |
| TC06 / BUG-1, tests/duplicate/create.spec.ts:120 and app tests/activity.test.js:176 | Omit order.createdAt at practice-app-v2/server.js:528, causing a second clock sample. | Deterministically advancing clock makes the exact app equalities at :203/:230/:231 fail; Playwright EVENT equality at support helper:143 also detects a crossed millisecond. | No, reasoning only; deterministic regression independently passed on the fix. |

## Standards checklist (TEST-STANDARDS section 11)

- [x] **Pass, reviewed scope — Structure:** specs, page actions, typed API helpers, builders and fixtures remain in their intended areas; assertion support stays in tests/support.
- [x] **Pass, reviewed changes — Types:** shared API shapes in types/api.ts, existing Order/ErrorResponse reused, generic parsing and typed API/builder boundaries; no new any/suppression. Unchanged legacy signatures were not expanded into unrelated cleanup.
- [x] **Pass — POM:** constructor locators, no page expect; login and details actions wait for their destination; reload replaces overlapping navigation. Feedback test IDs retain specified identity and explicit role assertions protect status/alert semantics.
- [x] **Pass — Fixtures:** role setup stays in fixtures, isolated cookie jars and contexts, owned resources released after use; no login added inside specs. The legacy approverPage fixture is unchanged and not separately exercised; DEV-02 approver UI coverage uses openSession.
- [x] **Pass — Assertions:** exact own-row outcomes, status plus body, persistence/source/history integrity, isolated no-creation checks; exact event timestamp equality retained.
- [x] **Pass — No padding:** no new sleeps, waitForTimeout, force clicks, retries or timeout increases. Approved fill polling unchanged. App-level clock control is deterministic bug setup, not a Playwright timing workaround.
- [x] **Pass — Data:** fresh UUID-based IDs and owned sources; no shared reset or list-count assertions. QA-01's old millisecond-only IDs are gone.
- [x] **Pass, reviewed scope — Config/secrets:** Playwright settings/credentials through helpers/env.ts; no credential literal added; no .env or .env.* file opened or printed. Ignore checks confirm local paths ignored and .env.example eligible.
- [x] **Pass — Required runs:** typecheck, serial, parallel and repeat checks all pass with current independent output above.

## Blocking issues

None remain for this review. B1–B5, the QA-01 collision/navigation dependency, and BUG-1 are resolved and verified. This is a reviewer Go, not an approval of Omer's Hub gates.

## Non-blocking suggestions / limits

No additional scope requested. The previously documented UTC-midnight boundary setup edge in TC21 did not occur, and no test was skipped. Legacy hybrid names/grouping/@trader2 tag were intentionally retained in the approved QA-01 plan. Negative-login coverage will need an outcome-neutral submit action rather than the successful-login wait, as already documented in that plan.

## App bugs found

No new app bug found. BUG-1's repair is independently verified; the existing bug report's Developer section remains the implementation record.

## Questions for Omer

None needed for this handoff. Gate approvals remain Omer's.

## Lane / secrets check

- Reviewer edits only reviewer-owned REVIEW.md reports. No implementation edits, temporary mutations, staging, commits, pushes, history rewrites, rule-file changes or manual status.json edits.
- Developer's timestamp fix/regression are in practice-app-v2; QA-01 changes remain in framework paths. The staged .DS_Store metadata deletions, including the app metadata file, were already disclosed with the approved plan and SDET notes; no new deletion was performed by reviewer.
- Other mixed DEV-01/DEV-02 working-tree changes predate this verification and are not attributed to QA-01 or BUG-1. The active integration branch is qa/01-parallel-safe; no branch checkout was performed by reviewer.
- No new only/fixme/skip, credential or token in the reviewed repairs. The existing plan-permitted UTC-rollover skip was not taken. Existing seed-backed app test login is unchanged.

