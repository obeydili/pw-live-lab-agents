# REVIEW: QA-01
**Reviewer:** Codex · **Date:** 2026-11-20 · **Branch:** qa/01-parallel-safe · **Base/Head:** afdcf47a1dc91b3cefd9603ff8ff8d1c113bc804 plus the existing working tree
**Reviewed against:** QA-01 TICKET.md, approved PLAN.md (Hub 2026-11-20T06:34:00.220Z), SDET-NOTES.md, TEST-STANDARDS, previous review and Developer's BUG-1 fix/regression.

## Verdict: Go

QA-01's collision and login-navigation fixes are verified, and the app timestamp defect that blocked the shared suite is now resolved. Typecheck passed; serial 54/54, parallel 54/54, full repeat 162/162, focused repeat 150/150 and app tests 77/77. No blocking issue remains for QA-01 or its DEV-02 dependency.

This final review supersedes the previous No-Go after the Developer's actual BUG-1 repair. Earlier failures were not suppressed or waived.

## What I checked

- Re-read repository/role/standards, QA ticket and approved SDET plan, author notes, prior reviewer findings and BUG-1 Developer evidence. Checked current source and index status on the same integration branch.
- Rechecked QA-01 diff/whole relevant methods in pages/login.page.ts, pages/orders.page.ts, tests/orders/hybrid-create.spec.ts, data/orders.ts, the me() message in helpers/api-client.ts, and .gitignore. Checked the current BUG-1 server diff and the complete new deterministic regression in app tests/activity.test.js:176–242, including teardown.
- No QA-01 TEST-PLAN.md is required: this framework ticket's approved PLAN.md supplies the acceptance checks. Relevant framework work covers typed fixtures/config/POM/unique data (T04/T05/T06/T08/T09/T20); unrelated migrations remain out of scope.
- Verified all ticket implementation tasks below, both core hybrid behaviors, full DEV-02 regression coverage, plus the new bug test. Independently executed the commands below. Mutation reasoning covers both core hybrid checks; no source mutation performed.
- Rechecked ignore behavior by path only: .env.local, .auth/x and .DS_Store at root/app/tests ignored; .env.example not ignored. The two formerly tracked metadata files remain staged for deletion, as previously disclosed.

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

## Coverage vs approved plan / ticket

The plan uses acceptance checks rather than numbered/prioritized feature cases. Q1/Q2 below are reviewer labels for the two core P1 hybrid behaviors. All implementation tasks are Covered; every required executable acceptance check passes.

| Check | Evidence (file:line / run) | Coverage | Meaningful proof |
|---|---|---|---|
| Q1 P1: trader1 hybrid | tests/orders/hybrid-create.spec.ts:5 | Covered | Fresh builder ID, exact 201 via ApiClient, reload, destination and own-row Pending Approval; 50 focused repetitions passed. |
| Q2 P1: trader2 hybrid | tests/orders/hybrid-create.spec.ts:16 | Covered | Separate signed-in role context, fresh builder ID, exact own-row status; 50 focused repetitions passed. |
| Login completion | pages/login.page.ts:18 | Covered | waitForURL('/orders') before returning to fixture/test. |
| Reload rather than competing goto | pages/orders.page.ts:16; hybrid spec:10/:22 | Covered | Reloads completed login destination; no removed navigate caller remains. |
| Unique data / no reset | data/orders.ts:6/:24; hybrid spec:9/:21 | Covered | UUID-based TEST IDs per call, no Date.now-only key, no global reset. |
| Import/comment cleanup | tests/orders/hybrid-create.spec.ts:1 | Covered | test/expect from fixtures; obsolete imports and commented reset removed. |
| me() error wording | helpers/api-client.ts:66 | Covered by inspection | Failed to get current user names the actual operation; no API behavior change. |
| Ignore rules / metadata | .gitignore:13/:14/:15/:18; index | Covered | Local/secret paths ignored, example eligible; no tracked metadata remains in index. |
| Typecheck / serial / parallel | Commands below | Pass | 0 type errors, 54 serial and 54 parallel passed. |
| Flaky check | 150 focused executions | Pass | Includes 100 hybrid executions, no collision/navigation error. |
| Full suite under repetition | npm test -- --repeat-each=3 | Pass | 162/162; includes 156 DEV-02 executions and 6 hybrids. |
| DEV-02 integration / BUG-1 | TC06 50/50; app 77/77 | Covered / Pass | Exact Activity equality remains enforced and deterministic clock regression passes. |

The old plan count of 54 DEV-02 + 2 hybrid was an arithmetic typo; actual suite remains 52 + 2 = 54, with no tests removed.

## Mutation spot-check (two core P1 checks)

| Test | Behavior break reasoned about | Assertion that would fail | Actual edit? |
|---|---|---|---|
| Q1, tests/orders/hybrid-create.spec.ts:5 | New order status at practice-app-v2/server.js:516 becomes Rejected. | Own-row Pending Approval assertion at spec:12. | No, reasoning only. |
| Q2, tests/orders/hybrid-create.spec.ts:16 | Omit state persistence at practice-app-v2/server.js:527 but return the newly allocated 201 body. | Own returned ID has no row after reload; spec:23 fails. | No, reasoning only. |

The independent pre-fix 409 reproduction remains in the earlier Hub/report history. Current UUID-based data removes that cause; no assertion weakening or serialization was used.

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

