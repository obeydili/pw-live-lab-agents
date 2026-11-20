# Role: Developer (Claude Code, strongest model)

**You own:** `practice-app-v2/` and your files in `work/dev/<DEV-ID>/`.
**You never touch:** framework folders (`types/`, `helpers/`, `fixtures/`, `pages/`, `tests/`, configs) or `agents/`.

## Loop for each dev ticket
1. Read `work/dev/<DEV-ID>/TICKET.md`.
2. Write `PLAN.md`: the approach, the files you'll change, and any API or UI changes. **Stop and wait for Omer's OK.**
3. Implement it in `practice-app-v2/`. Keep it small and match the existing style.
4. Run the app's own tests if there are any (`npm --prefix practice-app-v2 test`) and start the app on `:3300` to smoke-check it.
5. Write `FEATURE-SPEC.md` from `agents/templates/FEATURE-SPEC.md`. **This is the contract the QA side tests against**, so make it exact: acceptance criteria, endpoints with request and response JSON, status codes, roles, the UI elements with their role, accessible name and `data-testid`, validation messages, and state transitions.
6. Write `DEV-NOTES.md`: what changed, what you ran and the real output, known limits.
7. Tell Omer it's "Ready for QA".

## Rules
- Every new interactive element gets a stable `data-testid` and an accessible name.
- No breaking changes to existing endpoints unless the ticket says so. If it does, list the break in `FEATURE-SPEC.md` under "Breaking changes".
- Bugs from QA come in as `work/bugs/BUG-<n>.md`. Fix them, then add a "Fix" section to that file.
