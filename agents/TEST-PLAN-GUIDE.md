# Test Plan Guide (for the Test Planner, Codex)

This is how to write `work/dev/<DEV-ID>/TEST-PLAN.md`. Use it with `agents/templates/TEST-PLAN.md` and `agents/TEST-STANDARDS.md`. If this guide and TEST-STANDARDS ever disagree, **TEST-STANDARDS wins**. Tell Omer about the conflict.

**Your job:** decide *what* to test, *at which layer*, *with which data* and *what exactly proves it passed*. You write no code. The SDET turns your plan into tests, and the Reviewer checks the tests against your plan, so vague cases become weak tests.

**Your inputs, in this order:** `TICKET.md` → `FEATURE-SPEC.md` (the contract) → `DEV-NOTES.md` → the existing `tests/`, `pages/`, `fixtures/`, `types/` (to see what can be reused). Plan from the spec, not from the app's source code. If the spec and what you see disagree, raise it as a question.

**About the examples:** they come from the current Practice-App-v2 (orders, approvals, execution status, roles) to make each idea concrete. For a real ticket, the exact codes and messages always come from that ticket's FEATURE-SPEC.

---

## 1. Workflow (do it in this order)
1. **List the acceptance criteria** (AC1, AC2, …) from FEATURE-SPEC. Each one becomes a row in the traceability matrix.
2. **List the risks.** What could break, who would be hurt, and how likely is it? Include existing behaviour this feature touches (regression risk).
3. **Model the feature:** inputs and their rules, roles, states and transitions, endpoints, UI elements. This is where the techniques in section 3 apply.
4. **Derive the cases** with the coverage checklist (section 2). One case checks one behaviour.
5. **Pick a layer and a priority** for each case (sections 6 and 5).
6. **Write the exact assertions** for each case (section 4).
7. **Fill in the traceability matrix, regression scope and risk notes**, then run the self-check (section 10).
8. **Stop.** Omer approves or edits the plan before the SDET starts.

## 2. Coverage checklist
Go through every line. If a line doesn't apply, write "N/A: <why>" in the plan's self-check. Don't silently skip it.

| # | Area | What to cover | Practice-App-v2 example |
|---|---|---|---|
| C1 | **Functional, positive** | The main happy path of every AC, with realistic valid data | Trader creates a Buy order → 201, `status: "Pending Approval"` |
| C2 | **Negative / validation** | Each invalid input on its own (one bad field per case), missing required fields, wrong types, malformed JSON, unknown fields | `quantity: 0` → 400 `Validation failed.` with `details.quantity` |
| C3 | **Boundaries** | Min, max and just outside, empty and whitespace-only strings, max length, decimals | `quantity` 1 and 1,000,000 accepted, 0 and 1,000,001 rejected; reject reason 200 chars OK, 201 rejected |
| C4 | **Roles and permissions** | Each role allowed and each role refused (function level), no token, bad token | Trader calls approve → 403 `Only a approver can do this.`; no token → 401 |
| C5 | **Cross-user access (object level)** | User A reads or changes User B's object by swapping the id (OWASP API1 BOLA) | Trader B PATCHes Trader A's order → 403 `You can only change your own orders.` |
| C6 | **State transitions** | Every valid transition, and **invalid ones** (acting on a final state), repeat actions | Approve an already Rejected order → 409 `Order <id> is already Rejected.` |
| C7 | **API contract** | Status code, response schema (fields, types, nullability), headers that matter (`Content-Type`, CSV download headers), error body shape | 404 body is `{ error: "Order <id> not found." }` |
| C8 | **UI behaviour** | What the user sees and can do: text, enabled or disabled controls, navigation, validation messages, empty states | Reject without a reason shows the spec's message and the order stays Pending |
| C9 | **Accessibility basics** | New controls are reachable by role and accessible name (the locators the SDET will use), labels on inputs, focus after an action if the spec says so | "Reject" button found by `getByRole('button', { name: 'Reject' })` |
| C10 | **Hybrid** | API setup → UI action → API check (or UI create → API verify) | Create via API, approve in UI, then GET via API shows `status: "Approved"` and `decidedBy` |
| C11 | **Data integrity / persistence** | The change is saved, survives a reload, other fields are untouched, timestamps and actor fields are set | After PATCH `quantity`, GET shows the new value, `updatedAt` changed, `symbol` unchanged |
| C12 | **Concurrency and parallel safety** | Two actors on one object, double submit, duplicate unique keys, tests that would collide in parallel | Same `clientOrderId` twice → 409 the second time |
| C13 | **Async / eventual states** | States that change on their own; poll for them, never sleep | After approve, `executionStatus` goes Working → Partially Filled → Filled |
| C14 | **Idempotency / retries** | What happens if the same request is sent twice (POST is not idempotent, PUT and DELETE are meant to be) | DELETE the same order twice → 204, then 404 |
| C15 | **Regression on existing behaviour** | Endpoints, pages and exports the feature touches still behave as before | Existing order JSON keeps all its fields; CSV export columns unchanged |
| C16 | **Non-functional, light touch** | Only what the spec mentions or what is cheap: no secrets or stack traces in error bodies, sensible response time under default latency, no console errors on the new page | 500s don't leak stack traces |

**Watch for global state:** anything that changes app-wide settings (for example `POST /api/test/config` for `fillDelayMs`, or `/api/test/reset`) affects every parallel worker. Mark such cases **serial-only**, with the reason, as TEST-STANDARDS section 6 requires.

## 3. Test design techniques
Name the technique in the plan's **Technique** column so Omer and the Reviewer can see why the case exists. Source: ISTQB CTFL v4.0, chapter 4, unless noted.

| Technique | How to use it (one line) | Practice-App-v2 example |
|---|---|---|
| **Equivalence partitioning (EP)** | Split each input into valid and invalid groups that the app should treat the same; test one value per group | `side`: Buy, Sell (valid) / "Hold", missing, number (invalid) |
| **Boundary value analysis (BVA)** | For ordered values, test each boundary and its neighbour outside (2-value); add the neighbour inside for risky rules (3-value) | `quantity`: 0, **1**, 2 … 999,999, **1,000,000**, 1,000,001; `limitPrice` 0.01 OK, 0.001 rejected |
| **Decision table** | List the conditions as rows, one column per combination; one case per feasible column | `timeInForce` × `goodTillDate`: GTD + date = OK, GTD + no date = 400, Day + date = 400, Day + none = OK |
| **State transition** | Draw states and events; cover every valid transition and try the invalid ones | Pending → Approved → Working → Partially Filled → Filled; Pending → Rejected; Rejected + approve = 409 |
| **Pairwise (combinatorial)** | When many parameters combine, cover every *pair* of values instead of every combination (NIST: most failures involve one or two factors) | role × side × timeInForce for the order form; don't multiply into 30 UI tests |
| **Error guessing** | Use a checklist of common mistakes: empty, null, wrong type, whitespace, Unicode, very long, duplicate, wrong order of calls | Reject reason `"   "` (only spaces) → 400 |
| **Risk-based prioritisation** | Risk level = likelihood × impact; spend cases where risk is highest | Approving the wrong order (money impact) is P1; tooltip text is P3 |
| **Use case / AC-driven (ATDD)** | Turn each Given/When/Then AC into at least one case written the same way | AC: "Given a Pending order, when the approver rejects with a reason, then the reason is shown" |

Don't force every technique onto every feature. Use the ones the spec's rules call for, and write the partitions or table out in the plan when they drive more than three cases.

## 4. Assertions: what exactly to check
Each case's **Expected + Assertions** column must be specific enough that the SDET can't write a weak test from it.

**API case:**
- The **exact status code** (`201`, not "success").
- The **body fields that prove the behaviour**: values, not just presence (`status === "Rejected"`, `rejectionReason === "<sent text>"`, `decidedBy === "<approver username>"`).
- For errors, the **error message text and `details` key** from the spec (`details.reason`).
- **Side effects:** a follow-up GET shows the change, or shows *no* change for a refused request (a 403 PATCH must leave the order untouched).
- **Headers** only when they matter (CSV `Content-Type`, download filename).

**UI case:**
- The **visible outcome**: text, status badge value, row present or gone, URL after navigation, enabled or disabled state, validation message.
- Locate by role and accessible name as given in FEATURE-SPEC.
- Web-first assertions only (TEST-STANDARDS section 5). For async states, say "poll until Filled (timeout N s)", never "wait N seconds".

**Hybrid case:** the UI outcome **and** the final API state.

**Weak assertions to ban in the plan:**
- "Response is OK" or "status 2xx" only.
- "Element is visible" when the value matters (assert the text instead).
- "Body is not empty" or "has property X" without the value.
- Counting rows in a shared table (other workers add rows). Find the row by the test's unique data instead.
- Asserting on data the test didn't create.
- Snapshot of a whole response that includes timestamps or ids.

**Ask yourself for each case:** *"If the developer broke this behaviour, would this exact assertion fail?"* If not, make it sharper.

## 5. Priority (risk-based)
| Priority | Meaning | Examples | Runs in |
|---|---|---|---|
| **P1** | Core AC happy paths, security (authn, authz, cross-user), data loss or corruption, money or order state correctness | Approve and reject, role refusal, BOLA, state machine | Every run, `@smoke` for the top few |
| **P2** | Validation and boundaries, important error paths, UI behaviour of the AC, regression of touched features | 400s, boundaries, CSV columns | Every run, `@regression` |
| **P3** | Cosmetic, rare edge cases, nice-to-have UX, non-functional light touches | Long Unicode note, empty-state text | `@regression`, can be cut if time is short |

Rule of thumb: likelihood × impact. High impact is at least P2 even if unlikely. If you are unsure between two priorities, pick the higher and say why in Risk notes.

## 6. Layer choice
- **API first.** Validation, permissions, state rules, error bodies and data integrity are API cases. They are fast and stable.
- **UI only for UI behaviour:** what the user sees, clicks and is told. One UI case per AC behaviour is usually enough. Don't repeat every validation rule in the UI; pick one representative invalid input to prove the message renders.
- **Hybrid** when the AC spans both: set up through the API, act in the UI, confirm through the API.
- **Setup is always API** through fixtures and data builders (TEST-STANDARDS sections 4 and 6). A UI case never creates its data through the UI unless creating is what it tests.
- Mark each case **API / UI / Hybrid** and add tags `@api`, `@ui`, `@hybrid`, plus `@smoke` or `@regression`.

## 7. What NOT to automate (list these under Out of scope)
- Third-party or external sites and services you don't control (mock them if the feature depends on them).
- Pure visual look (colours, pixel layout) unless the spec makes it a requirement.
- One-off exploratory checks; list them as a short **manual / exploratory** note instead.
- Cases that duplicate a lower-layer case without adding UI value.
- Things the spec marks as Out of scope.
- Real performance or load testing (out of scope for this framework).

## 8. Parallel safety (plan it, don't leave it to the SDET)
For each case, say what unique data it creates (unique `clientOrderId` or note with a timestamp suffix), and what it must not touch. Flag any case that needs global state (reset, test config) as **serial-only** with the reason. No case may depend on another case or on run order.

## 9. Ambiguity: ask, never guess
If FEATURE-SPEC is missing an error message, a status code, a limit, a role rule, the order of checks (for example 404 vs 403 vs 409), or the exact UI text, **don't invent it**. Add a numbered question under **Questions for Omer**, mark the dependent case `BLOCKED: Q<n>`, and keep going with the rest. Also list any place where the spec and the ticket disagree.

## 10. Self-check before you hand off (copy into the plan, tick honestly)
- [ ] Every AC has at least one case, and every case points to an AC or a named risk (traceability matrix filled)
- [ ] Every coverage area C1–C16 is covered or marked N/A with a reason
- [ ] Each case checks one behaviour and has a technique, layer, priority, data and tags
- [ ] Every Expected column has an exact status code and/or exact UI text and the body fields to check; no weak assertions
- [ ] Refused requests (401, 403, 404, 409, 400) also check that nothing changed
- [ ] Cross-user (BOLA) and wrong-role cases are included for every endpoint that takes an id
- [ ] Invalid state transitions are included, not only the valid ones
- [ ] Async states are planned as polling with a timeout, never as sleeps
- [ ] Every case is parallel-safe, or marked serial-only with a reason
- [ ] Regression scope lists the existing endpoints and pages this feature touches
- [ ] Nothing in the plan is invented: unclear points are Questions for Omer
- [ ] The plan is sized sensibly: P1s first, no padding with near-duplicate cases

## Sources
- ISTQB Certified Tester Foundation Level Syllabus v4.0 (techniques, error guessing, risk-based testing, traceability): https://astqb.org/assets/documents/ISTQB_CTFL_Syllabus-v4.0.pdf
- OWASP API Security Top 10 2023, API1 Broken Object Level Authorization: https://github.com/OWASP/API-Security/blob/master/editions/2023/en/0xa1-broken-object-level-authorization.md
- OWASP WSTG, API Broken Object Level Authorization: https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/12-API_Testing/02-API_Broken_Object_Level_Authorization/
- NIST, Combinatorial Testing (interaction rule): https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software/combinatorial-methods-in-testing/interactions-involved-in-software-failures
- MDN, 403 / 409 / 422 status codes and Idempotent: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403 · https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/409 · https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/422 · https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
- Playwright Best Practices and Assertions: https://playwright.dev/docs/best-practices · https://playwright.dev/docs/test-assertions
- The Practical Test Pyramid (Martin Fowler site): https://martinfowler.com/articles/practical-test-pyramid.html
