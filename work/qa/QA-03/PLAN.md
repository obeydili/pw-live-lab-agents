# PLAN: QA-03 README deep-dive, Kanban / Orchestration UI (7 screenshots)
**Author:** SDET (Claude) · **Branch:** `qa/03-readme-kanban` (cut from `main`, which is at `fc4c1f1` and clean apart from the untracked `docs/` and `work/qa/QA-03/`) · **Status:** waiting for Omer's OK
This is a docs-only ticket. I wrote a plan anyway because the wording **is** the deliverable, and AGENTS rule 5 says plan first. Nothing has been changed yet; I only looked at the 7 images and the README.

## What I'll change (and nothing else)
1. `mv` the 6 files (plain `mv`, not `git mv`) to the names in the ticket; `kanban-board.png` stays. Then `git add docs/images/`. `docs/images/.DS_Store` is already ignored, so it won't be added.
2. In `README.md`, insert one new section **between the `### Tickets` table and `## The framework`**: `## Kanban / Orchestration UI`. No other line of the README, and no other file, changes.
3. Commits (each ends with the `Co-Authored-By: Claude Sonnet 5.5` trailer): `docs: add the Kanban / Orchestration UI screenshots` (7 PNGs) · `docs: README Kanban / Orchestration UI section` · `docs: QA-03 notes` (PLAN, SDET-NOTES, ticket folder). I don't push.

## Draft of the section (please read this part)
Written from what each screenshot shows; no feature, number or name that isn't visible in the image. Relative links only (`docs/images/...`).

> ## Kanban / Orchestration UI
>
> The workflow above runs from the command line: each role works in its own terminal session and finishes with the handoff command. On top of that, Omer uses a small local board to see each ticket's stage, reports and timeline, and to approve or send back each gate. **That UI is not part of this repo.** It reads the same `work/` folders and handoff state, so you can build your own UI around the same orchestration.
>
> ### The board
> ![Orchestration board with columns Filed, Dev · Claude, Test Planner, SDET, Reviewer and Done, one card per ticket, and the role sessions with a Reviewer terminal below](docs/images/kanban-board.png)
>
> One column per stage and one card per ticket: DEV-04 is filed, DEV-01 and DEV-03 are at the Test Planner, and BUG-1, QA-02, QA-01 and DEV-02 are done. The panel underneath has a Run and Stop control and a terminal for each role, here showing the Reviewer's Go for QA-02.
>
> ### Ticket detail
> ![Ticket detail for DEV-02 Duplicate order showing the ticket text with user story, scope and acceptance criteria, and the Reports list below it](docs/images/ticket-detail-dev-02.png)
>
> Opening a card shows the stage and branch, the ticket text (user story, scope, acceptance criteria) and then the reports the roles have handed in, each with a button to open its file.
>
> ### Test Planner questions
> ![DEV-01 at the test plan stage with the Test Planner's Questions for Omer, Q1 to Q3, and the timeline entry where the Test Planner asked a question](docs/images/test-planner-questions-dev-01.png)
>
> When the Test Planner is blocked it writes its questions into `TEST-PLAN.md`. Here DEV-01 has three (Q1 to Q3), and the timeline records when the question was asked.
>
> ### Test plan and timeline
> ![DEV-02 test plan opened in the detail panel with its acceptance criteria table, and below it the timeline of handoffs and approvals](docs/images/test-plan-and-timeline-dev-02.png)
>
> The DEV-02 `TEST-PLAN.md` opens in the same panel, with its acceptance criteria table. The timeline below lists every handoff and gate: the SDET handoff, a Reviewer No-Go, Omer requesting changes, the Reviewer's Go and Omer's approval.
>
> ### SDET notes
> ![QA-01 SDET-NOTES.md in the detail panel showing the result and a table of ticket task, change and file, with the timeline below](docs/images/sdet-notes-qa-01.png)
>
> The SDET's `SDET-NOTES.md` for QA-01 opens the same way: the result (the hybrid spec went from 7 failed of 30 parallel runs to 0 failed of 130) and a table mapping each ticket task to its change and file.
>
> ### Bug found by the Reviewer
> ![BUG-1 report in the detail panel: found by Reviewer (Codex), severity Med, with steps to reproduce, expected behaviour and actual output](docs/images/bug-report-bug-1.png)
>
> A bug is its own kind of ticket. BUG-1 was found by the Reviewer (Codex) during the QA-01 check, with steps to reproduce, what the plan expects and the real output.
>
> ### Reviewer verdict
> ![REVIEW.md for DEV-02 in the detail panel with Verdict: Go, and the timeline showing the Reviewer's handoff and Omer's approval](docs/images/reviewer-go-dev-02.png)
>
> The Reviewer's `REVIEW.md` for DEV-02 opens with **Verdict: Go**: all 29 plan cases are covered and the earlier blockers and BUG-1 are resolved. The timeline shows the Reviewer's handoff and Omer's approval.

## Checks I will run
| Check | How | Pass means |
|---|---|---|
| Only the intended files change | `git diff --stat main` and `git diff --numstat main -- README.md` | README: additions only, 0 deleted lines; plus the 7 PNGs and `work/qa/QA-03/` |
| Heading order | a script over `README.md` | `The agent workflow` → `Tickets` → `Kanban / Orchestration UI` → `The framework` → `Run it` → `CI` → `Practice-App-v2` → `challenges/` → `Licence`, and the 7 subsections in the ticket's order |
| Links | a script over the new section | 7 images, each alt text non-empty, each path relative (no leading `/`, no `http`), each file exists in the git tree with the exact (case-sensitive) name |
| Unchanged elsewhere | diff of the README before/after the section | identical |
| Privacy | I look at the 7 images again, plus `rg` on the new text | only `~/Desktop/...`, model names and a commit hash, no email, username or other names |
| `npm run typecheck` | as asked by the ticket | clean (no code changes) |
| Does it render on GitHub? | **I can't prove this before the push.** My stand-in is the link/alt/path check above | You confirm on GitHub after pushing |

## Things I noticed and need your call on
1. **Voice:** the ticket says "I use a small local board", but the README speaks about Omer in the third person everywhere else. I wrote "Omer uses ...". Say so if you want the first person.
2. **Stale ticket table (not touched, as told):** the `### Tickets` table still says QA-02 "In review" and has no QA-03 row, while the board screenshot shows QA-02 as Done with Go. The ticket says don't change other sections, so I'll **leave it** and list it in the notes as a follow-up.
3. **Image weight:** the 7 PNGs are about 5.4 MB in total (0.7–0.8 MB each, 3382 px wide for the board). They render fine on GitHub, but they are permanent in the git history. I'll keep them as they are (not resizing your screenshots) unless you want smaller copies.
4. **Wording limit:** I describe the board's counts and statuses only where they are visible in the image (for example, Done shows BUG-1, QA-02, QA-01 and DEV-02). The "Question from Test Planner" badge is visible on the board image, not in the question image, so the question subsection doesn't mention it.

## Not doing
No push; no merge into `main` (I will give you the exact `git switch main && git merge --ff-only qa/03-readme-kanban && git push` commands after the Reviewer's Go). No edits to `agents/`, the app, the framework, the images' content, or any other README section.
