# REVIEW: QA-02
**Reviewer:** Codex · **Date:** 2026-11-20 · **Branch:** qa/02-public-release · **Base:** main / 89aaf134f0543604d6cdacbca406c8e55c89db5e · **Head:** 7e404d1a8fbf000369bc6dd4d8af481d94e2be64
**Reviewed against:** QA-02 TICKET.md · PLAN.md (Hub approved 2026-11-20T08:21:19.799Z) · SDET-NOTES.md · agents/framework-plan.md T20/T21 · TEST-STANDARDS · Omer's subsequent public-name/history/practice-password decisions in the Hub record.

## Verdict: Go

No release-blocking implementation defect found. Independent typecheck passed; serial **54/54**, parallel **54/54 twice**, smoke **10/10**, isolated hybrid spec **2/2**. A clean local clone with **no .env file**, CI=true and explicit credential environment passed typecheck, **77/77 app tests**, and **54/54 Playwright tests**; expected report/log paths were generated and missing-secret configuration was rejected.

This is the agreed **pre-push release review**. A real GitHub-hosted Node-24/Linux Actions run and artifact download are not yet proven: the approved plan expressly uses a clean-clone dry run before Omer creates/pushes the repository. No repo was created, no push/merge/commit was performed by reviewer, and no Hub gate is approved here.

## What I checked

- Read AGENTS.md, reviewer role, TEST-STANDARDS, full QA-02 ticket/approved plan/author report, and T20/T21. The approved adaptation is the current 54-test suite rather than migrating the standalone challenges in this release.
- Read every change in main...HEAD: .env.example, .github/workflows/tests.yml, .gitignore, LICENSE, NOTES.md deletion, README.md, package.json, tests/orders/hybrid-create.spec.ts, tests/duplicate/duplicate-ui.spec.ts, QA-02 PLAN.md and SDET-NOTES.md. Opened the complete workflow, README, metadata/template/license and affected spec context. No app source or assertions changed in this release diff.
- Inspected main's four preparation commits, their ancestry/subjects/scopes, and the current branch history. Replayed typecheck and app tests for each commit in temporary source snapshots. Main and qa/01-parallel-safe both point at 89aaf13; QA-02 adds four subsequent commits.
- Checked README local links (none missing), workflow YAML parsing/triggers/permissions/Node version/upload condition, ignore behavior, framework any/reset/sleep/only/stray-tag scans, high-signal token/key patterns, tracked environment/local-agent state paths, and all ten reachable revisions for token/key patterns while excluding environment files.
- Checked DEV-01, DEV-03 and DEV-04 folders against main: unchanged. DEV-01/DEV-03 remain at test_plan; DEV-04 remains its existing filed ticket without a status.json. README lists these open rather than claiming completion.
- All runs below were performed by reviewer, not copied from SDET. Existing port-3300 listener's working directory was verified as this workspace's practice-app-v2. The clean-clone app used spare port 3393 and was stopped by its verification runner. No shared-app reset/restart.
- Reviewer authored this REVIEW.md only. Temporary clones/snapshots and installed dependencies were outside the workspace. No tracked code, rule file, environment file, index, branch or history was changed by reviewer.

## Runs (real output)

Required checks in the working repository:

```text
$ npm run typecheck
> pw-live-lab-agents@1.0.0 typecheck
> tsc --noEmit
(exit 0)

$ npm run test-alone
Running 54 tests using 1 worker
54 passed (38.6s)
(exit 0)

$ npm test                     # first independent parallel run
Running 54 tests using 6 workers
54 passed (10.5s)
(exit 0)

$ npm test                     # second run: T21 and reviewer flaky check
Running 54 tests using 6 workers
54 passed (10.3s)
(exit 0)

$ npx playwright test --grep @smoke
Running 10 tests using 6 workers
10 passed (5.3s)
(exit 0)

$ npx playwright test tests/orders/hybrid-create.spec.ts
Running 2 tests using 2 workers
2 passed (844ms)
(exit 0)
```

Both complete parallel runs cover all changed specs, satisfying the reviewer's repeat alternative. Zero failed/skipped/flaky tests were reported. Browser runs used the existing permission to launch Chromium outside the sandbox; no test retry/timeout policy was changed.

Clean clone of **7e404d1** in temporary storage, with its own freshly installed packages and no .env file:

```text
$ npm ci
added 11 packages, and audited 12 packages in 795ms
found 0 vulnerabilities
(exit 0)

$ npm ci --prefix practice-app-v2
added 65 packages, and audited 66 packages in 277ms
found 0 vulnerabilities
(exit 0)

$ npx playwright install --with-deps chromium
(exit 0)

Clean clone .env present: false
ci-typecheck: exit 0
> tsc --noEmit
ci-app-tests: exit 0
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ skipped 0
CI app health: 200
ci-playwright: exit 0
54 passed (10.4s)
Artifact paths present: {"playwright-report/index.html":true,"test-results":true,"app.log":true}
Clean clone tracked diff empty: true
```

The CI reproduction executed npm run typecheck, npm --prefix practice-app-v2 test, and npx playwright test under CI=true. Credentials were passed in memory through helpers/env.ts, never printed or saved to an environment file in the clone. BASE_URL/PORT used 3393 to avoid the existing app; startup used the same npm start script and a successful health request. The exact hosted shell loop was inspected, not claimed to have run as a GitHub step. Password values were scrubbed from captured verification output.

Expected negative configuration check in that clone:

```text
$ CI=true ... TRADER1_PASSWORD='' npx playwright test --list
ci-missing-secret: exit 1
Error: Environment variable TRADER1_PASSWORD is missing! Check your .env file.
```

Exit 1 was required and verified for this deliberate missing-secret check; it is not a failing suite result. The clone had no fallback .env file, so this also demonstrates explicit CI configuration rather than dependence on local configuration.

Step-0 historical snapshot replay (temporary sources, unchanged dependency versions; no checkout of the working repository):

| Commit | Typecheck | App tests |
|---|---|---|
| ecbd0b6, workflow/open-ticket scaffolding | exit 0 | 61 passed, 0 failed |
| e5c3aa9, DEV-02/framework | exit 0 | 76 passed, 0 failed |
| c456783, BUG-1 | exit 0 | 77 passed, 0 failed |
| 89aaf13, QA-01 | exit 0 | 77 passed, 0 failed |

Inspection checks:

```text
Workflow YAML: push, pull_request, workflow_dispatch
permissions: contents=read; setup-node: 24; upload condition: always()
Missing local README links: []
High-signal token/key-pattern matches in tracked current text: []
Reachable revisions scanned: 10
High-signal historical token/key-pattern matches: []
Framework any/sleep/force/only/reset/@trader2 scan: no matches (rg exit 1)
git diff --check main...HEAD: exit 0
```

Ignore checks confirm .claude/settings.local.json, .claude/scheduled_tasks.json, CLAUDE.local.md, .env.local, .auth/x, .DS_Store and app.log are ignored; .env.example is not ignored. No local-agent settings or actual .env file appears in tracked paths/history. These were filename/ignore checks, not environment-file reads.

**Not run / limits:** actual GitHub Actions execution, remote artifact upload/download (including a failed hosted run), Node 24/Linux execution, manual interview/layer walkthrough by Omer, or actual mutation execution. Local runtime was Node v25.5.0/macOS; the workflow selects Node 24/ubuntu-latest. Successful install and execution here are evidence for the approved dry run, not a claim that the first hosted run already exists. No new secret-pattern match was found; the scans do not assert an exhaustive audit of every possible form of private information.

## Coverage vs approved plan / T20 / T21

This framework/release ticket has acceptance checks, not a separate feature TEST-PLAN. All executable release checks required by the approved adaptation passed. Hosted-only/manual checks remain explicitly assigned to the post-push/Omer stage.

| Requirement | Evidence (file:line / run) | Disposition |
|---|---|---|
| Step 0: separate preparation commits, merge earlier work, branch correctly | ecbd0b6 → e5c3aa9 → c456783 → 89aaf13; main/QA-01 refs; snapshot replay above | Covered: ancestry/scopes and per-commit checks verified. SDET's pre-commit saved-tree equality is reported in SDET-NOTES:19; its original uncommitted snapshot was not independently available for a second byte-for-byte comparison. |
| T20 tags and useful smoke selection | tests/orders/hybrid-create.spec.ts:7/:18; existing duplicate tags; smoke 10/10 | Covered; @trader2 replaced, test count unchanged. |
| Parallel data independence | data/orders.ts:6/:24; owned IDs/isolated fixtures unchanged; serial/parallel×2/alone pass | Covered; no resets, added retries or serialization. |
| CI install both packages and Chromium | .github/workflows/tests.yml:31–47; clean-clone installs | Covered; no dependency on working-repo node_modules. |
| Start app and wait for readiness | workflow:49–58; clean app health 200 | Covered by configuration inspection and successful clean-instance startup. Bounded infrastructure readiness polling is not a sleep inserted into a test. |
| CI typecheck, app suite, Playwright | workflow:60–67; clean-clone 0 / 77 / 54 | Covered. |
| Upload HTML report/traces on every outcome | workflow:69–79, if always(); generated paths exist | Configured; actual hosted transfer/download awaits Omer's push, as approved in plan. Passing runs do not produce retry traces unnecessarily. |
| Least privilege / secrets | workflow:10–15/:21–29; negative missing-secret check | Covered; secret references only, required empty value rejected. |
| T21 typecheck, serial, parallel twice, spec alone, no any | Results above; framework folders scanned | Covered for approved current 54-test scope. Challenges remain intentionally unmigrated/outside CI. |
| README roles/workflow/handoff/layers/run/CI | README.md:15–38/:52–94; local link check | Covered; app start is explicitly in a second terminal, three repository secrets documented. |
| License and public package metadata | LICENSE:3; package.json:2–30 | Covered; MIT and Omer Beydili, confirmed repository URLs, no author email added to package metadata. Non-blocking lockfile discrepancy below. |
| Complete example configuration | .env.example:1–16; helpers/env.ts | Covered; all application/test config keys represented, password values empty, optional APP_DIR commented, existing non-secret defaults preserved. No actual environment file inspected. |
| Local-only agent state | .gitignore:19–22; ignore/tracking checks | Covered; public rules/AI trail stay trackable. |
| Privacy cleanup and preserved history | NOTES deletion; generic path; current/history scans; Hub note | Covered with Omer's explicit exceptions for public names, personal email/history, documented fake seed password. No new unapproved hit found. |
| Keep open tickets untouched | README:48–50; DEV-01/03/04 diff vs main empty | Covered. |
| No publishing by agent; exact commands for Omer | No remote configured; reviewer actions read/test/report only; commands below | Covered; no repository creation, push or merge executed by reviewer. |

## Mutation spot-check (at least two P1 behaviors)

No production or test mutation was made. The release diff only changes tags and one assertion message in existing specs; behavior assertions remain intact.

| P1 test | Break reasoned about | Assertion that would fail |
|---|---|---|
| Smoke hybrid, tests/orders/hybrid-create.spec.ts:5 | Change initial order status at practice-app-v2/server.js:516 from Pending Approval to Rejected. | Own-row status assertion at hybrid spec:12; the test cannot pass merely because an API request returned a success status. |
| Smoke duplicate UI, tests/duplicate/duplicate-ui.spec.ts:24 | Render the wrong source ID in the copy flash at practice-app-v2/public/static/app.js:380. | Exact flash assertion at UI spec:42 via tests/support/duplicate-assertions.ts:187, plus correct destination/API copy checks remain. |

The clean-clone missing-secret check additionally exercises failure behavior rather than accepting a silently missing credential. CI YAML parse and successful CLI smoke filtering verify selection/configuration; they are not falsely presented as a remote Actions run.

## Standards checklist (TEST-STANDARDS section 11)

- [x] **Pass, reviewed changes — Structure:** release files in conventional root/.github paths, existing thin specs retained.
- [x] **Pass, reviewed changes — Types:** no new models/API shapes or untyped boundaries; framework any scan empty. Existing shared models/parsing unchanged.
- [x] **Pass, reviewed scope — POM:** no new locators or page behavior; constructor locators/navigation waits/no page assertions retain the prior reviewed baseline.
- [x] **Pass — Fixtures:** setup/auth/context teardown unchanged; no login added to specs; clean clone proves explicit environment configuration works.
- [x] **Pass — Assertions:** only a diagnostic sentence changed; exact status/body/persistence/flash assertions preserved. Tag edits do not weaken tests.
- [x] **Pass — No padding:** no added retries, timeout increases, force clicks or test sleeps. CI retains the already configured retry policy; zero flakes were reported. Workflow sleep is bounded app-start readiness polling.
- [x] **Pass — Data:** fresh builder IDs and private instances unchanged, no global reset, serial/parallel/two complete runs and standalone spec green.
- [x] **Pass, approved public-demo exceptions — Config/secrets:** three GitHub secret references, empty example password values; no real credential or local agent state found by the stated scans. Omer explicitly approved the existing documented practice seed password and public names/history; none is treated as an employer secret.
- [x] **Pass — Required runs:** independent typecheck, serial 54/54, parallel 54/54 twice, smoke 10/10, isolated spec 2/2, clean-clone app 77/77 and CI Playwright 54/54, with real output.

## Blocking issues

None found in the reviewed release candidate. This Go applies to the approved pre-push scope; Omer still owns publishing, repository-secret configuration, hosted CI/artifact confirmation and gates.

## Non-blocking suggestions / process observations

1. **package-lock.json:2/:8/:10** still says the old package name and ISC, while package.json:2/:5 and LICENSE declare the current name/MIT. Both clean installs succeed, so this does not block the reviewed runs. Synchronize root lockfile metadata while preserving dependency versions in a follow-up.
2. **work/qa/QA-02/SDET-NOTES.md:64–67/:91–96** predates the latest Hub decisions. Those privacy questions are resolved, and the optional fresh-history instructions are not the chosen release path. The authoritative commands below preserve history. Consider marking that older optional section as superseded rather than having a future reader mistake it for the current plan.
3. **Process deviation, SDET-NOTES.md:23:** SDET reports using git reset --soft to redo two unpublished QA-02 draft commits, also visible in the local reflog. That conflicts with the standing AGENTS.md no-history-rewrite instruction and must not be repeated; corrections should be follow-up commits. This review does not retroactively authorize that operation. The retained main ancestry and candidate commits were inspected/replayed, and Omer has since explicitly instructed retaining the current real history. No further rewriting is proposed as a remedy, and no current code/test failure results from that past draft correction.

## App bugs found

None. No BUG file created; app source is unchanged by QA-02 and the current app suite passed 77/77.

## Questions for Omer

None required for this handoff. The Hub already resolves repository identity, license, public terminology, personal history/email and fake seed-password exceptions. Do not replace history with an orphan branch.

## Lane / secrets check

- Release/test changes match the approved SDET ticket. The approved NOTES deletion and generic DEV-01 path redaction are the explicit documentation exceptions; protected agents/framework-plan.md was left unchanged as instructed.
- No app behavior change in main...HEAD. DEV-01/03/04 work remains untouched in this branch; no unrelated ticket was advanced by reviewer.
- Actual .env/.env.* files were never opened, printed or copied. Only the permitted .env.example was inspected; filename/history/ignore queries do not read credential files. Clean clone had no .env and received credentials only through the allowed config helper/in-memory environment. No credential values appear in this report.
- No new only/fixme/skip. The pre-existing plan-permitted UTC-midnight conditional skip was not taken. Test reports are ignored artifacts.
- Working-tree change present before review: Hub-managed work/qa/QA-02/status.json. Reviewer added only this REVIEW.md. All temporary apps launched by the clean-clone runner were stopped; the existing port-3300 app was left running.

## Exact release commands for Omer (not executed by reviewer)

After your final Hub decision, include this review and the resulting ticket state so the public AI trail includes the actual Go. The following retains the existing history and fast-forwards the prepared branch; no force/orphan/rebase/reset is involved.

```bash
# On qa/02-public-release, after your Hub gate decision:
git add work/qa/QA-02/REVIEW.md work/qa/QA-02/status.json
git commit -m "docs: record QA-02 release review"

# If the empty GitHub repository/remote has not already been created:
gh repo create obeydili/pw-live-lab-agents --public --source . --remote origin

# Each command prompts for the documented practice user's password:
gh secret set TRADER1_PASSWORD --repo obeydili/pw-live-lab-agents
gh secret set TRADER2_PASSWORD --repo obeydili/pw-live-lab-agents
gh secret set APPROVER1_PASSWORD --repo obeydili/pw-live-lab-agents

git switch main
git merge --ff-only qa/02-public-release
git push -u origin main
```

If you create the empty repo in the browser instead, add its origin remote once before pushing; do not also run the gh repo-create command. After the first push, confirm the GitHub Actions run and download the uploaded HTML report/artifact. That hosted result is intentionally not claimed by this pre-push review.
