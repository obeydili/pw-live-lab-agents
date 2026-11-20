# SDET-NOTES: QA-02 Prepare pw-live-lab-agents for a public GitHub release
**Author:** SDET (Claude) · **Branch:** `qa/02-public-release` (from `main`) · **Plan:** approved by Omer with the defaults, repo `obeydili/pw-live-lab-agents`; `agents/framework-plan.md` left untouched as asked. **Nothing pushed.**

## Result
- Step 0 done: four commits, merged into `main`, `qa/02-public-release` cut from it.
- T20 and T21 acceptance checks pass, with two things I cannot prove from here (see "Not proven" below).
- `npm run typecheck` clean · `npm run test-alone` **54 passed** · `npm test` **54 passed**, twice · `--grep @smoke` **10 passed** · app tests **77 passed** · clean-clone CI dry run **54 passed**.

## Step 0: split, merge, branch
Everything from DEV-01, DEV-02, BUG-1 and QA-01 was uncommitted in one working tree on `qa/01-parallel-safe`. I built the commits from a saved tree (plumbing only, working files never touched):

| Commit | Subject | Real check (throwaway worktree) |
|---|---|---|
| `ecbd0b6` | chore: add the agent workflow and the open tickets | typecheck clean · app tests 61/61 |
| `e5c3aa9` | feat: DEV-02 duplicate order (API, UI button, framework and tests) | typecheck clean · app tests 76/76 |
| `c456783` | fix: BUG-1 created event uses the exact timestamp the order records | typecheck clean · app tests 77/77 |
| `89aaf13` | test: QA-01 make the hybrid orders spec parallel-safe | typecheck clean · app tests 77/77 |

- The last commit's tree is **identical** to the saved full working tree (tree hash compared), so nothing was lost or invented. The app test count going 76 → 77 at BUG-1 shows the split is real.
- Per the plan's default, the DEV-01 app code (activity events) is inside the DEV-02 commit, because they share `server.js`; the DEV-01 tickets/docs are in the first commit and DEV-01 stays open.
- The BUG-1 "before" state of `server.js` and `activity.test.js` was **reconstructed** (reverse of the documented change), not recovered from an original. Its comment wording may differ from the Developer's pre-fix text; the behaviour matches `work/bugs/BUG-1.md`.
- `git merge --ff-only qa/01-parallel-safe` into `main` (no merge commit), then `git switch -c qa/02-public-release`.
- A first attempt at the QA-02 commits put the `NOTES.md` deletion in the wrong commit. I undid those two local, minutes-old commits with `git reset --soft` and redid them correctly (before anything was merged or pushed).

## QA-02 commits (on `qa/02-public-release`)
1. `ab13245` feat: tags and a GitHub Actions workflow (T20)
2. `94d010d` docs: README, MIT licence, package metadata, complete `.env.example`
3. `2f4813f` chore: ignore local agent state and the CI log, drop the sandbox note
4. (this file + the PLAN.md redaction) docs: QA-02 notes

## T20: tags, parallel-safe data, CI
| Check | Result |
|---|---|
| `.github/workflows/tests.yml` exists | yes. Parsed with the YAML parser bundled in Playwright: triggers `push`, `pull_request`, `workflow_dispatch`; `permissions: contents: read`; steps checkout, setup-node (24, npm cache), install both packages, install Chromium, start the app and wait on `/api/health`, typecheck, app tests, Playwright, upload report/traces with `if: always()` |
| No secrets in the workflow | usernames are plain env values; the three passwords are `${{ secrets.* }}`. `rg -i password` on the file shows only those references |
| A spec carries `@smoke`/`@api` | yes: `@smoke` ×10 runs, `@api` many. The stray `@trader2` tag is gone (hybrid tests are now `@hybrid` + `@smoke` / `@regression`) |
| `npx tsc --noEmit` | clean |
| `npx playwright test --grep @smoke` | `10 passed (5.3s)` |
| Parallel-safe data | no `reset(`, `waitForTimeout` or `Date.now()` ids in `tests/ pages/ helpers/ fixtures/ data/` (the two `Date.now()` hits are the duration measurement in `tests/support/duplicate-assertions.ts`) |
| **Clean-clone CI dry run** | A fresh `git clone` of the branch, no `.env` (`.env present: no`), `CI=true`, the six variables passed as env, the workflow's exact commands: `npm ci`, `npm ci --prefix practice-app-v2`, `playwright install chromium`, app started on a spare port and waited on `/api/health`, then **typecheck clean, app tests 77/77, Playwright `54 passed (10.4s)`**. `playwright-report/`, `test-results/` and `app.log` exist, which is what the upload step sends |
| Missing secret fails fast | with `TRADER1_PASSWORD` unset: `Error: Environment variable TRADER1_PASSWORD is missing!` (an unset GitHub secret becomes an empty string, which `required()` also rejects) |

## T21: full suite green (checks adapted, see below)
| Check | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| serial | `npm run test-alone` | `54 passed (38.6s)` |
| parallel, twice | `npm test` ×2 | `54 passed (10.4s)`, `54 passed (10.3s)` |
| one spec alone | `npx playwright test tests/orders/hybrid-create.spec.ts` | `2 passed (481ms)` |
| no `any` | `rg -n "\bany\b" types helpers fixtures pages data tests --glob '*.ts'` | no matches (exit 1). One false positive, the word "any" in a message in `duplicate-ui.spec.ts`, was reworded |
| app's own tests | `npm --prefix practice-app-v2 test` | `tests 77, pass 77, fail 0` |

**Adapted T21 checks:** T21 assumes the 19 challenges were migrated into `tests/` (T08–T19). They were not, so the suite is `hybrid-create` + the DEV-02 specs (54 tests). The "spec alone" check uses `hybrid-create.spec.ts` because `tests/approvals/approve.spec.ts` doesn't exist. The "walk through the layers" manual check is for Omer. The Framework Builder peer review is the Reviewer's Go.

## Public-ready files
- **README.md:** the agent workflow (roles, flow, handoff CLI, standards), a ticket table (DEV-02, QA-01, BUG-1 done; QA-02 in review; **DEV-01, DEV-03 open at test plan, DEV-04 open, filed**), the framework layers, how to run the app and tests, CI and the three secrets, `challenges/` explained, licence. Badge: `obeydili/pw-live-lab-agents`.
- **LICENSE:** MIT, "Copyright (c) 2026 Omer Beydili".
- **package.json:** description, author `Omer Beydili`, `license: MIT`, `private: true`, repository/bugs/homepage, keywords, `engines.node >=24`. `.env.example` is complete (adds a comment header and the optional `APP_DIR`; passwords empty).
- **.gitignore:** `.claude/settings.local.json`, `.claude/scheduled_tasks.json`, `CLAUDE.local.md`, `app.log` (CI), on top of QA-01's `.env.*`, `!.env.example`, `.auth/`, `.DS_Store`. `.claude/settings.local.json` was never tracked (`git ls-files .claude` empty, and it is also globally ignored on this machine).

## Privacy scrub
Done: `NOTES.md` deleted; the local path in `work/dev/DEV-01/DEV-NOTES.md` made generic (before it was ever committed); the same path removed from my own `PLAN.md`. `.env` was never read or printed. No secrets in the tree. `AI trail` untouched (`work/`, handoffs, reviewer names, `Co-Authored-By`).

**Left alone, your call** (not mine to change; `agents/` is yours and you said leave `framework-plan.md`):
1. `agents/framework-plan.md` (lines 3, 19) names "QA Co-Pilot Hub", "Muallim" and your personal `pw-live-lab` repo link; `agents/bin/handoff.ts:2` names "QA-Co-Pilot Hub". Its own line 21 says "no employer names, internal app names, codenames", so check that these names are public-safe.
2. **History already holds a few things:** the original `NOTES.md` (with "Muallim") is in the first two commits `3d5189e`/`afdcf47`; `ecbd0b6` contains the old `~/qa-workspace/...` string only inside my earlier PLAN.md; and every commit's author email is your personal Gmail address (9 commits). Deleting a file later does not remove it from history. I did not rewrite history (AGENTS rule 3). If you want it clean before the first public push, use a fresh history instead (commands below), at the cost of the per-commit trail (the `work/` documents keep the story).
3. `challenges/` scripts and `practice-app-v2/` contain the practice password `Password123!`. It is a fake, documented in `practice-app-v2/README.md` and `data/seed.json`, not a real secret. The framework code (`types/ helpers/ fixtures/ pages/ data/ tests/`) has no password literals. It also means the three GitHub secrets are not strictly needed for this app; I kept them because T20 says "passwords as Actions secrets".

## Not proven / not done
- **The Actions run being green** and the report/trace artifact being downloadable: needs the push. The clean-clone dry run above is the stand-in.
- Not pushed, and `qa/02-public-release` is **not** merged into `main` (your step).
- `status.json` files are changed by the Hub handoff and are not committed in this branch.
- `challenges/` was not migrated or edited (one `any` remains there, outside the T21 check).
- Environment: Node 25.5 locally (the workflow uses 24), macOS (CI is Linux: the Playwright install uses `--with-deps` there).

## Commands for you (after the Reviewer's Go)
Before pushing, create the empty repository on GitHub (no README, no licence) and add the three secrets (values = the practice users' passwords from `practice-app-v2/README.md`):
```bash
gh repo create obeydili/pw-live-lab-agents --public --source . --remote origin   # or create it in the browser
gh secret set TRADER1_PASSWORD --repo obeydili/pw-live-lab-agents
gh secret set TRADER2_PASSWORD --repo obeydili/pw-live-lab-agents
gh secret set APPROVER1_PASSWORD --repo obeydili/pw-live-lab-agents
```
Then merge and push:
```bash
git switch main
git merge --ff-only qa/02-public-release
git remote add origin git@github.com:obeydili/pw-live-lab-agents.git   # skip if gh already added it
git push -u origin main
```
Optional, if you want a clean public history instead of the current one (this drops per-commit history, including the Gmail author on old commits if you also set a noreply address first):
```bash
git config user.email "<your-id>+obeydili@users.noreply.github.com"
git switch main && git checkout --orphan public-main
git add -A && git commit -m "Initial public release"
git push -u origin public-main:main
```
Afterwards: check the Actions tab (first run needs the secrets).
