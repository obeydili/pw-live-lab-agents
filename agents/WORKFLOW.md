# Agent workflow: who does what, and the prompts to start each session

```
Omer: DEV ticket ─▶ Developer (Claude): PLAN ─▶ Omer OK ─▶ build + FEATURE-SPEC + DEV-NOTES
      ─▶ Test Planner (Codex): TEST-PLAN ─▶ Omer approves
      ─▶ SDET (Claude, own session): tests + SDET-NOTES   (app bug? ─▶ BUG ─▶ Developer)
      ─▶ Reviewer (Codex): runs + REVIEW (Go / No-Go) ─▶ Omer decides
Omer: QA ticket (1–3 framework To-Dos) ─▶ SDET: PLAN ─▶ OK ─▶ build ─▶ Reviewer ─▶ Omer
```

Keep one terminal or session per role. Don't reuse the Developer session for SDET work.

## Start prompts (paste these)
**Developer (Claude):**
> You are the Developer. Read AGENTS.md and agents/roles/developer.md. Work on work/dev/DEV-01/TICKET.md. Write PLAN.md first and wait for my OK.

**Test Planner (Codex):**
> You are the Test Planner. Read AGENTS.md and agents/roles/test-planner.md. Write work/dev/DEV-01/TEST-PLAN.md from the ticket, FEATURE-SPEC.md and DEV-NOTES.md. Don't edit any code.

**SDET (Claude, new session):**
> You are the SDET. Read AGENTS.md and agents/roles/sdet.md. TEST-PLAN.md for DEV-01 is approved. Write the tests, run them serially and in parallel, then write SDET-NOTES.md.
> (Framework work: "Work on work/qa/QA-01/TICKET.md. Write PLAN.md first and wait for my OK.")

**Reviewer (Codex):**
> You are the Reviewer. Read AGENTS.md and agents/roles/reviewer.md. Review DEV-01 (or QA-01): run typecheck, test-alone and test, then write REVIEW.md with Go or No-Go. Don't edit any code.

## Models and terminals (one fixed terminal and session per role)
Plans: Claude Pro (Developer + SDET share its 5-hour and weekly limits with Claude chat) and ChatGPT Pro (Planner + Reviewer). Sign in with those accounts. Never set `ANTHROPIC_API_KEY`: Claude Code would bill the API instead of the plan. Keep `OPENAI_API_KEY` unset in these terminals too, as a precaution.

| Role | CLI | Model | Effort | Permissions |
|---|---|---|---|---|
| Developer | Claude Code | `opus` | medium (`/effort high` for a hard bug) | `acceptEdits`, no `git push`, no `.env` |
| SDET | Claude Code, its own session | `sonnet` (`/model opus` for a tricky framework ticket) | high | `acceptEdits`, no `git push`, no `.env` |
| Test Planner | Codex CLI | `gpt-6-astra` | medium | `workspace-write`, no network, asks on request |
| Reviewer | Codex CLI | `gpt-6.1-sol` (different from the Planner) | high | `workspace-write` + network (Chromium, :3300), asks on request |

In the Hub, **▶ Run <role>** starts or resumes that role's own session with these settings, and **Send task prompt** pre-fills the ticket prompt (you press Enter). Without the Hub, keep one terminal per role and resume by id or name, never `claude --continue` or `codex resume --last`: all roles share this folder, so "most recent" can pick another role's chat.

## Branches
`dev/<id>-slug` for features and `qa/<id>-slug` for framework work. Omer merges. Agents never push.
