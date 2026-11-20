# pw-live-lab-agents

[![Tests](https://github.com/obeydili/pw-live-lab-agents/actions/workflows/tests.yml/badge.svg)](https://github.com/obeydili/pw-live-lab-agents/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A **Playwright + TypeScript** test framework that was built, tested and reviewed by **AI agents working in separate roles**, with a human (Omer) owning every gate. The system under test is a small order-ticket app, Practice-App-v2 ("Trade Desk Lite"), kept in this repo.

The repo is meant to show two things:

1. **A clean, parallel-safe test framework**: typed API client, fixtures, page objects, web-first assertions, unique data per test, CI.
2. **The agent workflow that produced it**: tickets, plans, specs, test plans, notes and reviews are all kept in [`work/`](work/), so you can read how each feature went from idea to "Go".

The AI trail is deliberate. Nothing here was hidden or cleaned up.

## The agent workflow

| Role | Agent | Owns | Writes |
|---|---|---|---|
| **Developer** | Claude Code | the app, `practice-app-v2/` | `PLAN.md`, `FEATURE-SPEC.md`, `DEV-NOTES.md` |
| **Test Planner** | Codex | the test plan only, no code | `TEST-PLAN.md` |
| **SDET** | Claude Code (own session) | the framework: `types/`, `helpers/`, `fixtures/`, `pages/`, `data/`, `tests/`, config | `PLAN.md`, `SDET-NOTES.md` |
| **Reviewer** | Codex (different model) | nothing: reports only | `REVIEW.md` with **Go / No-Go** |
| **Omer** | human | the rules, every approval, merges | tickets, approvals |

```
DEV ticket ─▶ Developer: PLAN ─▶ OK ─▶ build + FEATURE-SPEC + DEV-NOTES
           ─▶ Test Planner: TEST-PLAN ─▶ approved
           ─▶ SDET: tests + SDET-NOTES      (app is wrong? ─▶ BUG ─▶ Developer)
           ─▶ Reviewer: runs everything + REVIEW (Go / No-Go) ─▶ Omer decides

QA ticket (framework to-dos) ─▶ SDET: PLAN ─▶ OK ─▶ build ─▶ Reviewer ─▶ Omer
```

Rules every agent follows ([`AGENTS.md`](AGENTS.md)): stay in your lane, never read or commit `.env`, never push, one ticket at a time, plan first, don't invent results, and **whoever writes code never reviews it**.

- **Handoffs:** each role finishes with one command, `node agents/bin/handoff.ts --ticket <ID> --role <role> --done --summary "<real result>" --report <FILE>.md` (or `--blocked` with a question). The CLI moves the ticket to the next stage and refuses to run at the wrong one. Gates are Omer's.
- **Standards:** [`agents/TEST-STANDARDS.md`](agents/TEST-STANDARDS.md) is what the SDET writes to and the Reviewer checks against. [`agents/TEST-PLAN-GUIDE.md`](agents/TEST-PLAN-GUIDE.md) is the Test Planner's playbook. [`agents/WORKFLOW.md`](agents/WORKFLOW.md) has the session prompts.
- **Where the work lives:** [`work/dev/<DEV-ID>/`](work/dev/) for features, [`work/qa/<QA-ID>/`](work/qa/) for framework to-dos, [`work/bugs/`](work/bugs/) for bugs. See [`work/README.md`](work/README.md).

### Tickets

| Ticket | What | Status |
|---|---|---|
| DEV-02 | Duplicate order (`POST /api/orders/:id/duplicate` and a button) | **Done**, review Go |
| QA-01 | Parallel-safe hybrid spec, login race fix, repo basics | **Done**, review Go |
| BUG-1 | Created activity event could differ by 1 ms from the order's `createdAt` (found by the Reviewer) | **Fixed** |
| QA-02 | Public release: tags, CI, README, licence | In review |
| DEV-01 | Order activity history | Open: at test plan |
| DEV-03 | Order stats endpoint | Open: at test plan |
| DEV-04 | Inline validation on the order ticket | Open: filed |

## The framework

```
types/      shared interfaces and unions (Order, ErrorResponse, ...), one source of truth
helpers/    env.ts (config + credentials), readJson<T>, ApiClient (Bearer), client pool, isolated app launcher
data/       builders with unique ids: buildOrder({ side: 'Sell' }), buildSourceOrder('gtc')
fixtures/   test.extend: apiClient, trader2ApiClient, approverApiClient, desk, isolatedDesk, openSession, signed-in pages
pages/      page objects: locators in the constructor, user actions, no expect(), navigation waits for the URL
tests/      thin specs: tests/duplicate/ (DEV-02), tests/orders/ (hybrid), tests/support/ (shared assertions)
```

Ideas worth a look:
- **Parallel-safe by construction.** Every test creates its own data (unique `clientOrderId`), asserts only on what it created, and never calls the global reset. The same suite passes with `--workers=1` and in parallel.
- **"No order was created" is provable.** Those tests start a private app instance on a free port (`isolatedDesk`), so counts can't be affected by other workers.
- **Hybrid tests.** Arrange through the API, act in the UI, assert through the API.
- **Tests can fail.** Each ticket's notes list the faults injected into a copy of the app to prove the tests turn red.
- **Tags:** `@smoke`, `@api`, `@ui`, `@hybrid`, `@regression`.

## Run it

Requirements: Node 24+.

```bash
npm ci
npx playwright install chromium
npm ci --prefix practice-app-v2

cp .env.example .env            # then fill in the passwords (see practice-app-v2/README.md)
PORT=3300 npm --prefix practice-app-v2 start     # the app under test, in a second terminal

npm run typecheck
npm test                        # parallel
npm run test-alone              # one worker
npx playwright test --grep @smoke
npm run report                  # open the HTML report
npm --prefix practice-app-v2 test   # the app's own tests
```

## CI

[`.github/workflows/tests.yml`](.github/workflows/tests.yml) installs both packages, starts Practice-App-v2 on `:3300`, waits for `/api/health`, then runs the typecheck, the app's tests and the Playwright suite. The HTML report and traces are uploaded on every run.

The workflow needs three repository secrets: `TRADER1_PASSWORD`, `TRADER2_PASSWORD` and `APPROVER1_PASSWORD` (the practice users' passwords). No secret is stored in the repo.

## Practice-App-v2

A fake order-ticket app (Express, in-memory, resets on restart) with a UI and a REST API. Pages, endpoints and users are described in [`practice-app-v2/README.md`](practice-app-v2/README.md).

## `challenges/`

The original one-file Playwright practice scripts the framework grew out of. They are standalone (`npm run challenge -- <file>`), are **not** part of the typecheck or the test run, and are not run in CI.

## Licence

[MIT](LICENSE) © 2026 Omer Beydili
