# BUG-1: Created Activity event can differ from the order creation timestamp
**Found by:** Reviewer (Codex) · **Ticket:** QA-01 verification / DEV-02 TC06 · **Severity:** Med

## Steps to reproduce
1. Use the current Practice-App-v2 on port 3300 and configured test credentials through helpers/env.ts. No reset or timing changes are needed.
2. Run `npm run test-alone`. The failure is intermittent when creation crosses a millisecond boundary. A focused check is `npx playwright test tests/duplicate/create.spec.ts:120 --repeat-each=50`; this focused command is suggested, not reviewer-run.
3. TC06 creates its own Rejected source, duplicates it, and reads the copy's creation event. Compare the event's at field with the duplicate response's createdAt.

## Expected (cite FEATURE-SPEC / plan)
DEV-02 TEST-PLAN.md:48 defines EVENT(C,S,T) with `at=C.createdAt`; TC06 at TEST-PLAN.md:61 applies that exact event contract. DEV-01 TEST-PLAN.md:49 specifies the same equality for CREATED(O,source).

The copy's created event must use the same timestamp as the order's creation.

## Actual (real output, response, or screenshot path)
Reviewer run on branch qa/01-parallel-safe, base commit afdcf47a1dc91b3cefd9603ff8ff8d1c113bc804 plus the existing working tree, Node v25.5.0:

```text
$ npm run test-alone
1 failed
  tests/duplicate/create.spec.ts:120:3
  should start an independent creation history when duplicating a decided source
53 passed (39.2s)

Expected at: 2026-11-20T06:37:29.531Z
Received at: 2026-11-20T06:37:29.532Z

at expectDuplicateCreatedEvent (tests/support/duplicate-assertions.ts:143:21)
at tests/duplicate/create.spec.ts:131:7
```

The reported source ID was ORD-2365. Both QA-01 hybrid tests passed in this run. This failure is unrelated to the corrected clientOrderId collision or login navigation race.

App evidence: practice-app-v2/server.js:514 assigns createdAt from new Date(), then :524 calls recordEvent; :263 independently reads new Date() for the event timestamp. Those clock reads can cross a millisecond boundary. No source mutation was needed to observe the mismatch.

## Fix (Developer fills in)
**Fixed by the Developer (Claude), 2026-11-20.**

**Cause:** two clock reads. `createOrder` set `createdAt` from one `new Date()`, and `recordEvent` read the clock again for the event's `at`, so the two could land a millisecond apart. The same pattern existed for `edited` (vs `updatedAt`, PATCH and PUT), `approved`/`rejected` (vs `decidedAt`) and the `Filled` execution step (vs `filledAt`).

**Change (`practice-app-v2/server.js` only):** `recordEvent(order, actor, action, details, at)` takes the timestamp the order itself records. `created` uses `order.createdAt` (POST, CSV import and DEV-02 duplicate all go through `createOrder`), `edited` uses `order.updatedAt`, `approved`/`rejected` use `order.decidedAt`, and `Filled` uses `current.filledAt`. Events with no matching order field (`cancelled`, execution `Working` and `Partially Filled`) keep reading the clock as before. No assertion was loosened, and nothing in the framework changed.

**Regression test:** `practice-app-v2/tests/activity.test.js` › *each event uses the exact timestamp its order records, even when clock reads differ (BUG-1)*. It replaces `Date` with one whose every argument-less read returns the next millisecond, so two reads in one request always differ, deterministically, with no waits or retries. It checks created (POST, duplicate, import), edited (PATCH, PUT), approved, rejected and Filled with exact equality.

**Real output.** Before the fix (the new test, deterministic):
```text
✖ each event uses the exact timestamp its order records, even when clock reads differ (BUG-1)
  actual: '2026-03-01T10:00:00.003Z',
  expected: '2026-03-01T10:00:00.002Z',
ℹ pass 9
ℹ fail 1
```
After the fix: `npm --prefix practice-app-v2 test`
```text
✔ each event uses the exact timestamp its order records, even when clock reads differ (BUG-1)
ℹ tests 77
ℹ pass 77
ℹ fail 0
```
The new test passed in 5 of 5 repeated runs of `tests/activity.test.js`. The Reviewer's focused check and both suites, against this workspace's fixed app on a spare port (`PORT=3391`, `BASE_URL=http://localhost:3391`, so Omer's app on :3300 was not touched):
```text
$ npx playwright test tests/duplicate/create.spec.ts:120 --repeat-each=50
50 passed (2.3s)
$ npx playwright test --workers=1
54 passed (38.6s)
$ npx playwright test
54 passed (10.3s)
```
**Before re-testing on :3300:** restart Practice-App-v2 (the running app still has the old server.js in memory).

---
*Reviewer's note when filing:* Suggested direction: reuse the captured order creation timestamp for its created event, preserving the timing of other event types. Keep the exact assertion; do not add tolerance, retries, waits or longer timeouts to hide the mismatch. Add a focused app-level regression that exercises differing clock reads.

No implementation or test code was edited by the Reviewer. The existing P1 test remains active and correctly reports the defect; it has not been skipped or marked fixme by this review.
