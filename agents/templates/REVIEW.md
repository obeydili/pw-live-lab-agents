# REVIEW: <DEV-id or QA-id>
**Reviewer:** Codex (<model/setting>) · **Date:** · **Base:** `<branch or commit>` · **Head:** `<commit>`
**Reviewed against:** TICKET.md · FEATURE-SPEC.md · TEST-PLAN.md (approved <date>) · agents/TEST-STANDARDS.md · SDET-NOTES.md

## Verdict: Go / No-Go
One or two lines on why.

## What I checked
- Files read (the full diff plus any whole files opened):
- Plan cases checked: __ of __
- Commands run: (list)
- Mutation spot-checks: (list)

## Runs (real output, paste the summary lines)
- `npm run typecheck`:
- `npm run test-alone` (serial): passed / failed / skipped / flaky
- `npm test` (parallel): passed / failed / skipped / flaky
- Flaky check (`npx playwright test <new specs> --repeat-each=2`):
- Anything not run, and why:

## Coverage vs plan
| Plan case | Test (file:line) | Covered / Partial / Missing | Assertion strong enough? (would it fail if behaviour broke?) |
|---|---|---|---|
| TC1 | | | |

## Mutation spot-check (at least 2 P1 tests)
| Test (file:line) | Break I reasoned about or tried | Would it / did it fail? | Reverted, file unmodified? |
|---|---|---|---|
| | | | N/A (reasoning only) / Yes, `git diff <file>` empty |

## Standards checklist (TEST-STANDARDS section 11)
- [ ] Structure: each file is in the right folder, and specs are thin
- [ ] Types: no `any`, shared types reused, `readJson<T>` used, explicit return types
- [ ] POM: locators in the constructor, good locator priority, no `expect` in pages, navigation waits
- [ ] Fixtures: used for setup, contexts closed, no logins in specs
- [ ] Assertions: web-first and meaningful, API status plus body checked
- [ ] No sleeps, no `waitForTimeout`, no retry or timeout padding
- [ ] Data: unique per test, parallel-safe, no global reset
- [ ] Config and secrets: everything through `helpers/env.ts`, no credentials in code
- [ ] All three runs (typecheck, serial, parallel) pass, with real output pasted
(Mark each Pass / Fail with file:line / N/A.)

## Blocking issues (must fix before Go)
1. `file:line`: problem → why it matters → suggested fix

## Non-blocking suggestions
- `file:line`:

## App bugs found (not test issues)
- BUG-<n> / suggested bug: (spec says … , app does …)

## Questions for Omer
-

## Lane / secrets check
- Files changed outside the role's lane: none / list
- Secrets or .env values: none / list
- `.only` / unexplained `skip` / `fixme` without BUG id: none / list
