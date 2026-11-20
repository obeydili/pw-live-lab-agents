# AGENTS.md: rules for every AI agent in this repo

This repo has two parts, and each role owns one of them:

| Area | Path | Owner |
|---|---|---|
| App under test (Practice-App-v2, Express) | `practice-app-v2/` | **Developer** (Claude) |
| Test framework (Playwright + TypeScript) | everything else: `types/`, `helpers/`, `fixtures/`, `pages/`, `data/`, `tests/`, `playwright.config.ts`, `tsconfig.json` | **SDET** (Claude, separate session) |
| Handoff docs | `work/` | Every role writes only its own files |
| Rules and templates | `AGENTS.md`, `CLAUDE.md`, `agents/` | **Omer only**. Agents never edit these |

Before you start, read your role file in `agents/roles/`. If you were not told your role, stop and ask.

## Hard rules (all roles)
1. **Stay in your lane.** Only edit the paths your role owns. If something outside your lane is broken, file it in `work/bugs/` using `agents/templates/BUG.md`. Do not fix it yourself.
2. **Never read, print, edit or commit `.env` or `.env.*`**, except `.env.example`, which holds keys only and no values. Get config through `helpers/env.ts`.
3. **Never `git push`, never force anything, never rewrite history.** Commit only when Omer asks. Work on the branch you were given.
4. **One ticket at a time.** Do only what the ticket asks. No drive-by refactors.
5. **Plan first.** For any ticket, write your plan or notes file and wait for Omer's OK before you change code, unless the ticket says "no plan needed".
6. **Don't invent anything.** No made-up endpoints, selectors, data or results. If you didn't run it, say "not run".
7. **Whoever writes code never reviews it.** Claude writes and Codex reviews.

## Stack and commands
- Node 24, Playwright ^1.65, TypeScript ^7 (`strict: true`, ESM: `"type": "module"`).
- App: `PORT=3300 npm --prefix practice-app-v2 start` (default `BASE_URL` is `http://localhost:3300`).
- Typecheck: `npm run typecheck`. This must pass before any handoff.
- Tests, parallel: `npm test`. Tests, serial: `npm run test-alone`. Both must be green before Go.
- Report: `npm run report`.

## Test automation standards (SDET writes to them, Reviewer checks them)
The full rules are in **`agents/TEST-STANDARDS.md`**. Read it before writing or reviewing test code. The short version:
- Use POM: page objects in `pages/`, locators assigned in the constructor, `getByRole`/`getByLabel` first, no `expect` inside pages, and navigation that waits with `waitForURL`.
- Use types everywhere: shared interfaces and unions in `types/`, `readJson<T>()`, explicit return types, and no `any`.
- Use fixtures for setup: import `test` and `expect` from `fixtures/index.ts`, API through `ApiClient` (Bearer), and no logins inside specs.
- Use web-first assertions with no sleeps, and keep tests parallel-safe: unique data per test and no global reset.
- Done means `npm run typecheck`, `npm run test-alone` and `npm test` are all green.

## Instructions for Codex roles (Test Planner, Reviewer)
- **Test Planner:** read `agents/roles/test-planner.md` and follow **`agents/TEST-PLAN-GUIDE.md`** (coverage checklist, techniques, exact assertions, priorities, traceability, self-check). Write only `TEST-PLAN.md`.
- **Reviewer:** read `agents/roles/reviewer.md`. Review against TICKET, FEATURE-SPEC, the approved TEST-PLAN and TEST-STANDARDS; run the commands yourself and paste real output; cite `file:line`; split blocking from non-blocking; no code edits.

## Code Review Rules
- A test that would still pass if the behaviour it names broke is a blocking issue (status-only API checks, `toBeVisible` where the value matters, refused requests with no "nothing changed" check).
- Flag sleeps, `waitForTimeout`, added retries, longer timeouts or `force: true` used to make a test pass. Safe path: find the race or shared state, or file a BUG and use `test.fixme('BUG-<n>')`.
- Flag tests that share or reset global data in parallel runs. Safe path: unique data per test; serial-only with a written reason.
- Flag any credential, token or `.env` value in code, and any change outside the author's lane.

## Handoff files (where work lives)
- Dev ticket: `work/dev/<DEV-ID>/TICKET.md` → Developer writes `PLAN.md`, `FEATURE-SPEC.md`, `DEV-NOTES.md`.
- QA for a feature: the Test Planner writes `work/dev/<DEV-ID>/TEST-PLAN.md`, the SDET writes `SDET-NOTES.md`, the Reviewer writes `REVIEW.md`.
- Framework To-Dos: `work/qa/<QA-ID>/TICKET.md` → SDET `PLAN.md` + `SDET-NOTES.md`, then Reviewer `REVIEW.md`.
- Bugs: `work/bugs/BUG-<n>.md`.

## Handing off to the Hub (every role, last step)
When your part is done and your report file is written, run exactly one command, then stop:
`node agents/bin/handoff.ts --ticket <ID> --role <your-role> --done --summary "<1–2 sentences: what you did and the result>" --report <YOUR-FILE>.md`
- Roles: `developer`, `test-planner`, `sdet`, `reviewer`. The Reviewer adds `--verdict go` or `--verdict no-go`.
- If you need an answer from Omer, use `--blocked --summary "<question>"` instead of `--done`, and stop.
- If the command refuses (wrong stage, waiting on Omer, missing file), don't work around it. Tell Omer what it said.
- The summary is what Omer sees on the board: real results only ("12 passed, 0 failed"), never "should pass".
- Never edit `status.json` yourself, and never approve anything. Gates are Omer's.
