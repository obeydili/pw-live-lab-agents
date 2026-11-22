# QA-03: README deep-dive, Kanban / Orchestration UI (7 screenshots)
**Written by:** Chief of Staff · **For:** SDET (Claude) · **Branch:** `qa/03-readme-kanban`

## Tasks
- Add a `## Kanban / Orchestration UI` section to `README.md`, right after `## The agent workflow` and its `### Tickets` table, before `## The framework`.
- Use the 7 screenshots in `docs/images/`, one short subsection and caption each.

## Extra notes
- The 7 PNGs in `docs/images/` are untracked. Rename them with plain `mv` (not `git mv`), then `git add docs/images/`:
  - `kanban-board.png` → `kanban-board.png` (unchanged)
  - `DEV02-Ticket.png` → `ticket-detail-dev-02.png`
  - `Questions from TestPlanner.png` → `test-planner-questions-dev-01.png`
  - `DEV02-TestPlan.png` → `test-plan-and-timeline-dev-02.png`
  - `SDET-Notes-For-QA01.png` → `sdet-notes-qa-01.png`
  - `Bug01 Ticket.png` → `bug-report-bug-1.png`
  - `DEV02-Review.png` → `reviewer-go-dev-02.png`
- Intro paragraph: the workflow runs from the command line, and I use a small local board on top of it to see each ticket's stage, reports and timeline and to approve or send back each gate. Say clearly that **the UI is not part of this repo**: it reads the same `work/` folders and handoff state, so readers can build their own UI around the same orchestration.
- Subsections, in this order: The board · Ticket detail · Test Planner questions · Test plan and timeline · SDET notes · Bug found by the Reviewer · Reviewer verdict.
- Write 1–2 plain sentences per image, describing only what the screenshot shows: no new features and no numbers that aren't in the image. Give every image descriptive alt text.
- Use relative image links only (`docs/images/...`), with no leading `/` and no external hosts.
- Don't change any other README section or any other file.
- Privacy is already checked: the images show only `~/Desktop/...`, model names and a commit hash. Keep it that way.
- The AI trail stays, including the Co-Authored-By trailer.
- Don't push. Stop after Reviewer Go and report the exact git commands.

## Done when
- All 7 images render on GitHub and every relative link resolves. The heading order is `The agent workflow` → `Tickets` → `Kanban / Orchestration UI` → `The framework` → the rest unchanged. `npm run typecheck` is green, SDET-NOTES.md is written, and the Reviewer says Go.
