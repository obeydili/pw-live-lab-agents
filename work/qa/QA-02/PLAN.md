# PLAN: QA-02 Prepare pw-live-lab-agents for a public GitHub release
**Author:** SDET (Claude) · **Branch:** `qa/02-public-release` (cut from `main` after step 0) · **Status:** waiting for Omer's OK
Nothing below has been done yet. This plan only read the repo (never `.env`).

## What I found (current state)
- **Git:** `main` = 2 commits (`afdcf47`). You are on `qa/01-parallel-safe`, and **all** DEV-01/DEV-02/BUG-1/QA-01 work is uncommitted in one working tree.
- **Entangled files:** DEV-01 (activity events), DEV-02 (duplicate) and the BUG-1 fix all edit `practice-app-v2/server.js` (and `app.js`, `activity.test.js`). DEV-02 is built on DEV-01's events, so DEV-02 cannot be committed without DEV-01's app code.
- `.claude/settings.local.json` is **not tracked** (`git ls-files .claude` is empty), only needs ignoring.
- No `README`, `LICENSE` or `.github/` yet. `package.json`: description/author empty, license `ISC`. `.env.example` has 6 keys (3 passwords empty) and no `APP_DIR`.
- **T21 mismatch:** T21 assumes the 19 challenges were migrated (T08–T19). They were not; `tests/` has `hybrid-create` and the DEV-02 specs only. `challenges/` (16 standalone scripts, run with `npm run challenge`) is outside `tsc`, outside the Playwright `testDir`, and has one `any` (`01-table-strict-mode.ts`).
- **Tags today:** `@smoke` ×4, `@api` ×24, `@ui` ×6, `@hybrid` ×5, `@regression` ×30, plus one stray `@trader2`.
- **Privacy scan** (no `/Users/…` paths, no emails, no secrets in the tree). Hits to decide on:
  1. `NOTES.md` (root): a sandbox note about "Send to workspace/sandbox" and the Hub tooling.
  2. `work/dev/DEV-01/DEV-NOTES.md:34`: local path `~/qa-workspace/pw-live-lab`.
  3. `agents/framework-plan.md:3`: link to a personal `pw-live-lab` repo.
  4. Git author email is a personal Gmail address, which becomes public in every commit.
  5. `BUG-1.md` / `REVIEW.md` name "Codex" as the Reviewer. That is the AI trail, so it **stays**.

## Step 0: split the existing work into commits, merge, branch
On `qa/01-parallel-safe`, in this order. Each commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

| # | Commit | Contains |
|---|---|---|
| 0 | `chore: add the agent workflow and open tickets` | `AGENTS.md`, `CLAUDE.md`, `agents/`, `work/README.md`, `work/bugs/.gitkeep`, `work/dev/DEV-01,03,04` and `work/qa/QA-02` as they stand (stay open) |
| 1 | `feat: DEV-02 duplicate order` | app endpoint + button, DEV-01's event code it builds on, DEV-02 framework (`pages/order-details`, `fixtures/desk`, `api-client(-pool)`, `isolated-app`, `types`, `data/orders.ts`), `tests/duplicate/`, `tests/support/`, `work/dev/DEV-02/` |
| 2 | `fix: BUG-1 created-event timestamp` | the `recordEvent(..., at)` change in `server.js`, its new test in `activity.test.js`, `work/bugs/BUG-1*` |
| 3 | `test: QA-01 parallel-safe hybrid spec` | `login()` wait, `reload()`, unique ids, `me()` message, `.gitignore` basics, the two `.DS_Store` removals, `work/qa/QA-01/` |

**How, safely:** no interactive git. I save the full tree first (tree hash), build commit 1 and 2 states by temporarily reversing the BUG-1 hunks and the three QA-01 lines I know exactly (`me()` message, `TEST` prefix, hybrid spec/pages), commit, then restore.
**Proof:** `git diff` of the last commit against the saved tree is **empty** (nothing lost or invented), and commits 1–3 each pass `npm run typecheck` and `npm --prefix practice-app-v2 test` (checked in a throwaway worktree in the scratchpad).
Then: `git checkout main && git merge --ff-only qa/01-parallel-safe` (main hasn't moved, so no merge commit), and `git switch -c qa/02-public-release`.

## T20: tags, parallel-safe data, CI
- **Tags:** keep `@smoke @ui @api @hybrid @regression`. Replace the stray `@trader2` with `@hybrid`. Make sure `@smoke` is a small fast set (one hybrid test, DEV-02's basic API create and UI duplicate, the existing 4).
- **Data:** already unique per test (no resets). I'll prove it again by grep (`reset(`, `Date.now`).
- **`.github/workflows/tests.yml`:** triggers `push`/`pull_request` to `main` + manual. Steps: checkout → `setup-node` (24, npm cache) → `npm ci` (root and `practice-app-v2`) → `npx playwright install --with-deps chromium` → start the app on `:3300` in the background and wait for `/api/health` (curl loop with a timeout, no extra deps) → `npm run typecheck` → `npm --prefix practice-app-v2 test` → `npx playwright test` → upload `playwright-report/` and `test-results/` (traces) with `if: always()`. Least-privilege `permissions: contents: read`, `concurrency` to cancel superseded runs.
- **No secrets in the file:** usernames are plain `env:` values; the three passwords come from `${{ secrets.TRADER1_PASSWORD }}`, `TRADER2_PASSWORD`, `APPROVER1_PASSWORD`. **You must add those 3 repository secrets** after creating the repo (values = the practice users' passwords). Until then the first run is red (fail fast on the missing-variable error).

## T21: full suite green (checks adapted, see mismatch above)
- `npm run typecheck` clean. `npm run test-alone` and `npm test` green. `npm test` run **twice** (T21). One spec alone: `tests/orders/hybrid-create.spec.ts` (T21 names `approve.spec.ts`, which doesn't exist).
- `rg "\bany\b" types helpers fixtures pages data tests --glob '*.ts'` → 0. One false positive today (the word "any" in a message in `duplicate-ui.spec.ts:61`); I'll reword it. `challenges/` is outside this check (I'll say so in the README, not edit the scripts).
- **CI dry run:** clone the repo to the scratchpad, `CI=true`, install, start the app, run exactly the workflow's commands with the 6 variables passed as env (no `.env` file in that clone). This proves the workflow needs nothing from my machine. **I cannot prove the Actions run is green; that needs the push (yours).**

## Public-ready files
- **README.md:** what the repo shows (AI-assisted multi-role workflow); the roles (Test Planner, Developer, SDET, Reviewer) and who owns what; the ticket flow and `handoff` CLI; `work/` layout; the framework layers (types → `readJson` → `ApiClient` → fixtures → page objects → specs) and parallel-safety rules; how to run the app and the tests (`test-alone`, `test`, tags); CI badge; **open tickets table: DEV-01, DEV-03 (test_plan), DEV-04 (filed)** and the done ones (DEV-02, QA-01, BUG-1); `challenges/` explained as standalone practice scripts, not in CI; license.
- **LICENSE:** MIT, "Copyright (c) 2026 Omer Beydili".
- **`package.json`:** name `pw-live-lab-agents`, description, author `Omer Beydili` (no email), license `MIT`, `engines.node >=24`, keywords, `repository`/`bugs`/`homepage` only if you confirm the repo URL.
- **`.env.example`:** complete and keys-only (adds optional `APP_DIR`, comments pointing to `practice-app-v2/README.md` for the practice users). `.env` is never read or printed.
- **`.gitignore`:** add `.claude/settings.local.json`, `CLAUDE.local.md`, `.claude/scheduled_tasks.json` (local agent state). Keep `.claude/` itself trackable, only the local files are excluded.
- **Privacy scrub:** fix the hits above and re-scan code, `work/`, `agents/` and the commit messages/authors with the same `rg` patterns; report any new hit instead of silently rewording. AI trail (`work/`, handoff history, reviewer names, `Co-Authored-By`) is untouched.

## Commits on `qa/02-public-release` (small, reviewable)
`feat: tags + CI workflow (T20)` · `docs: README, LICENSE, package metadata, .env.example` · `chore: gitignore local agent state` · `chore: privacy scrub` · `docs: QA-02 notes`. I never push.

## Acceptance checks
| Check | Command | Pass means |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| serial / parallel | `npm run test-alone`, `npm test` ×2 | 0 failed |
| smoke | `npx playwright test --grep @smoke` | ≥1 test, 0 failed |
| no `any` | the `rg` above | no matches |
| app tests | `npm --prefix practice-app-v2 test` | all pass |
| clean-clone CI dry run | workflow commands, `CI=true`, no `.env` | 0 failed |
| files exist | `.github/workflows/tests.yml`, `README.md`, `LICENSE` | present, no secret values (`rg` for password literals in workflow) |
| ignore rules | `git check-ignore -v .claude/settings.local.json .env.local .auth/x .DS_Store` and not `.env.example` | as expected |
| privacy | the term scan over code, `work/`, `agents/`, `git log --format='%an %ae %s'` | no hits beyond the ones you approve |
| step 0 | tree-hash compare + per-commit typecheck | identical, green |

## Decisions for you (defaults if you just say OK)
1. **DEV-01 code inside the DEV-02 commit:** yes (they share `server.js`). Plus the extra commit 0 for workflow scaffolding and open tickets.
2. **Licence:** MIT, 2026.
3. **Repo URL** for the badge/`package.json`: `github.com/obeydili/pw-live-lab-agents`. Is that the name?
4. **Git author email:** commits currently use your personal Gmail, which will be public. Default: leave as is. If you'd rather use GitHub's `…@users.noreply.github.com` address, give it to me and I'll set it for step 0 (I won't rewrite history later).
5. **`NOTES.md`** (Hub sandbox note): delete. **`~/qa-workspace/...` path** (DEV-01 DEV-NOTES) and **the personal repo link** (`agents/framework-plan.md`): reword to generic text. Both files are other roles' / yours (`agents/`), so I touch only those exact words, since the ticket says "anywhere".
6. **`challenges/`:** keep as is, described in the README.
7. **Merge of `qa/02-public-release` into `main`:** you, with the commands I report. Default: I stop at Reviewer Go and print them (`merge`, `remote add`, `push`).
