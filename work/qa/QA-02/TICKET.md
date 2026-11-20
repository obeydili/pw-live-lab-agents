# QA-02: QA-02: Prepare pw-live-lab-agents for a public GitHub release
**Written by:** Omer · **For:** SDET (Claude) · **Branch:** `qa/02-public-release`

## Tasks from agents/framework-plan.md
- T20: Tags, parallel-safe data, and CI
- T21: Full suite green

## Extra notes
- T20 {tags, parallel-safe data, GitHub Actions CI}
- T21 {full suite green, release gate}
- Step 0, before any new work: on qa/01-parallel-safe, commit ealier finished work as separate commits (DEV-02 duplicate order, BUG-1 fix, QA-01 parallel-safe). Merge into main, then branch qa/02-public-release from main.
- Public-ready like pw-cucumber-framework / pw-live-lab-framework:
- README (what the repo shows: the AI-assisted multi-role workflow, roles, handoff, ticket flow, how to run app + tests, CI badge), LICENSE "Omer Beydili", .env.example complete, package.json name/description/author filled in.
- .gitignore: add .claude/settings.local.json (and any other
- local-only agent state). Untrack it if it's tracked.
- Privacy scrub: no employer, internal app, colleague names or codenames anywhere (code, work/ docs, commits). No secrets; .env never read or printed.
- DEV-01 and DEV-03 (at test_plan) and DEV-04 (filed) are in progress. Leave them as they are, and the README lists them as open tickets.
- AI trail stays. This repo is meant to show the agent workflow.
- Don't push. Stop after Reviewer Go and report the exact git commands.
- Omer creates the GitHub repo and pushes main himself.
## Done when
- Every acceptance check of the listed tasks passes, `npm run typecheck`, `npm run test-alone` and `npm test` are green, SDET-NOTES.md is written, and the Reviewer says Go.
