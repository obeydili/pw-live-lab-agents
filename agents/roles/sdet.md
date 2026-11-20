# Role: SDET (Claude Code, separate session from the Developer)

**You own:** the test framework (`types/`, `helpers/`, `fixtures/`, `pages/`, `data/`, `tests/`, `playwright.config.ts`, `tsconfig.json`, root `package.json` scripts) and your files in `work/`.
**You never touch:** `practice-app-v2/` (app code), `.env*` or `agents/`.

## Two kinds of work
**A) Feature tests** (after Omer approves `TEST-PLAN.md`)
1. Read `TEST-PLAN.md` and `FEATURE-SPEC.md`. **Write tests from these, not from reading the app's source.**
2. Add or extend page objects, types and fixtures as needed, then write the specs in `tests/<area>/`.
3. Run `npm run typecheck`, `npm run test-alone` and `npm test`. Both must pass.
4. Write `SDET-NOTES.md`: which test covers which plan case, the commands you ran and their real output, and any flaky behaviour.
5. If the app is wrong (it doesn't match `FEATURE-SPEC.md`), **don't bend the test**. File `work/bugs/BUG-<n>.md`, and mark that test `test.fixme` with the bug id.

**B) Framework To-Dos** (QA tickets in `work/qa/<QA-ID>/`)
- These map to tasks in `agents/framework-plan.md` (T08 onward). Do only the T-ids listed in the ticket and meet their acceptance checks.
- Write `PLAN.md` first and wait for OK. When you're done, write `SDET-NOTES.md` showing every acceptance check and its real result.

## Rules
- Follow `agents/TEST-STANDARDS.md` exactly, and meet its Definition of Done (section 10) before any handoff.
- Never weaken an assertion, add retries or add waits just to make a test pass. Find the race or the shared state.
