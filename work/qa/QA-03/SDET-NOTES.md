# SDET-NOTES: QA-03 README deep-dive, Kanban / Orchestration UI (7 screenshots)
**Author:** SDET (Claude) · **Branch:** `qa/03-readme-kanban` (from `main` at `fc4c1f1`) · **Plan:** approved by Omer. Nothing pushed.

## Result
The README has a new `## Kanban / Orchestration UI` section with the 7 screenshots, each with a subsection, alt text and 1–2 sentences. The only changes against `main` are `README.md` (**+46 lines, 0 deleted**) and the 7 PNGs. `npm run typecheck` clean, `npm run test-alone` **54 passed (38.5s)**, `npm test` **54 passed (10.3s)** (no code changed; run because the ticket asks for them).

## What changed
| Step | Result |
|---|---|
| Renames (plain `mv`) | `DEV02-Ticket.png` → `ticket-detail-dev-02.png`, `Questions from TestPlanner.png` → `test-planner-questions-dev-01.png`, `DEV02-TestPlan.png` → `test-plan-and-timeline-dev-02.png`, `SDET-Notes-For-QA01.png` → `sdet-notes-qa-01.png`, `Bug01 Ticket.png` → `bug-report-bug-1.png`, `DEV02-Review.png` → `reviewer-go-dev-02.png`; `kanban-board.png` unchanged. No spaces left in any file name |
| `git add docs/images/` | 7 PNGs; `docs/images/.DS_Store` stayed out (ignored) |
| README | new section between the `### Tickets` table and `## The framework`; intro says clearly that the UI is **not part of this repo** and reads the same `work/` folders and handoff state; subsections in the ticket's order: The board · Ticket detail · Test Planner questions · Test plan and timeline · SDET notes · Bug found by the Reviewer · Reviewer verdict |
| Commits | `8d21761` docs: add the Kanban / Orchestration UI screenshots · `8a361a1` docs: README Kanban / Orchestration UI section (both with the `Co-Authored-By` trailer) · this notes commit |

## Acceptance checks, real results
Script: `check-readme.py` (scratchpad, not committed), run on the committed state.
| Check | Result |
|---|---|
| Heading order | `The agent workflow` → `Tickets` → `Kanban / Orchestration UI` → the 7 subsections → `The framework` → `Run it` → `CI` → `Practice-App-v2` → `challenges/` → `Licence`. PASS |
| Section sits directly after the Tickets table and directly before `The framework` | PASS |
| Rest of the README unchanged | the README with the new section removed is byte-identical to the README before. PASS (`git diff --numstat main`: `46 0`) |
| 7 images, in the ticket's order | PASS |
| Every image has non-empty alt text | PASS (126–166 characters each) |
| Relative links only (no leading `/`, no `http`, no spaces) | PASS; no URL anywhere in the new section |
| Every link resolves | each path is in the git tree (`git ls-files docs`) with the exact, case-sensitive name. PASS |
| No other files changed | `git diff --name-only main` lists only `README.md` and the 7 PNGs (plus this ticket's `work/qa/QA-03/` files in the notes commit) |
| Privacy | the new text has no `@`, `/Users/`, user name, email or URL. I looked at all 7 images: they show `~/Desktop/pw-live-lab-agents`, model names, a commit hash and the name "Omer", no email or username. As your ticket said |
| typecheck / serial / parallel | clean / 54 passed / 54 passed |

**The check can fail:** I broke one image link in the README on purpose (`/docs/images/SDET-notes-qa-01.png`: leading slash and wrong case) and the script reported 4 FAILs (structure, order, the image, tracked). I restored it and it passed again. A first version of the script read my draft instead of the README, so it did not catch that; I fixed it before relying on it.

## Not proven
- **"All 7 images render on GitHub"** needs the push. My stand-in is the check above (paths, case, tracked files, alt text); I did not render the Markdown here.
- Nothing pushed or merged.

## Choices and follow-ups for you
1. **Voice:** the README says "Omer uses a small local board" (third person, like the rest of the README), not "I use". Easy to flip if you prefer.
2. **Stale table (left untouched, as you said):** `### Tickets` still lists QA-02 as "In review" and has no QA-03 row. The board screenshot shows QA-02 as Done/Go. Worth a small follow-up ticket.
3. **Image weight:** the 7 PNGs are about 5.4 MB in total and become permanent git history. Not resized.
4. The "Question from Test Planner" badge is on the board image only, so the Test Planner questions subsection doesn't mention it.

## Commands for you (after the Reviewer's Go)
```bash
git switch main
git merge --ff-only qa/03-readme-kanban
git push origin main
```
Then open the repository page on GitHub and check that all 7 images show.
