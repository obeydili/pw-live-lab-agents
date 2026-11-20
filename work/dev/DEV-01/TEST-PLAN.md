# TEST-PLAN: DEV-01 Order activity history
**Author:** Test Planner (Codex) · **Status:** Draft, not approved — questions Q1–Q3 open
**Inputs read:** work/dev/DEV-01/TICKET.md, FEATURE-SPEC.md, DEV-NOTES.md; existing tests/orders/hybrid-create.spec.ts, pages/orders.page.ts and login.page.ts, fixtures/index.ts, types/order.ts, helpers/api-client.ts, readJson.ts and env.ts; playwright.config.ts. Existing API contracts referenced from practice-app-v2/README.md, read earlier in this session; no app source used to derive expectations.
**Guide:** agents/TEST-PLAN-GUIDE.md and agents/TEST-STANDARDS.md, using agents/templates/TEST-PLAN.md.

## Acceptance criteria
| AC | Required behavior |
|---|---|
| AC1 | Signed-in traders and approvers read only the requested order's events, 200 array, chronological order and insertion order for equal timestamps. |
| AC2 | API create, CSV import and duplicate record a first created event with correct actor, trade fields and source; duplication also identifies its source order. |
| AC3 | PATCH/PUT append one edited event only when an editable value changes; exact changed keys and from/to values; no event for no-op or refused edits. |
| AC4 | Approval appends approved then system execution transitions null → Working → Partially Filled → Filled. |
| AC5 | Rejection records trimmed reason or null; refused decisions append nothing. |
| AC6 | Unauthenticated history read gives exact 401; unknown/deleted order gives exact 404. |
| AC7 | Seed history is derived from seed fields, and reset restores it and removes subsequent history. |
| AC8 | Activity section renders accurate time/actor/action/details in order and updates after decisions and execution steps. |
| AC9 | Existing order API shapes and behavior remain unchanged; existing tests remain green. |
| Ticket cancellation requirement | A cancelled event is recorded, although the specified public API cannot retrieve it after deletion; Q1. |

## Scope
- In: history endpoint, all specified event producers, append-only integrity, permission/read boundaries, UI rendering/live updates, seed/reset behavior, focused existing-order regression.
- DEV-02 integration appears in AC2 but is **deferred while DEV-02 is on hold per Omer**. TC04 documents the future integration check only; no DEV-02 work or edits are authorized by this plan.
- Out: global audit log, history filtering/export, durable storage across restarts, external services, load testing, pixel styling, exhaustive unchanged order validation rules, unrelated quotes/watchlist functionality.
- Empty-state UI is exercised with a documented-response stub because a live existing order always has a created event. Stubs do not prove backend recording behavior.

## Risk notes
| Risk | Likelihood | Impact | Covered by |
|---|---|---|---|
| R1: missing, incorrect or duplicated audit entries misrepresent order decisions/trades | M | H | TC01, TC03–08, TC12–17, TC29 |
| R2: wrong actor/order attribution or incorrect read restrictions | M | H | TC01–02, TC09–11, TC18 |
| R3: refused or no-op actions fabricate history or mutate the order | M | H | TC08, TC12–14 |
| R4: event order loses execution steps or changes earlier entries | M | H | TC05–07, TC15–17, TC23–24, TC29 |
| R5: UI stale/misformatted history hides actual changes | M | H | TC19–26 |
| R6: global reset/config collides with other tests | H | M | TC17–18/23 isolation rules |
| R7: existing order response/action behavior regresses | M | H | TC03/05–08/12–14/27–28 |
| R8: cancellation audit requirement cannot be verified externally | H | H | TC30; Q1 |
| R9: history UI renders user text as markup | L | H | TC26 |

## Test design notes
### Reuse and implementation prerequisites
Reuse Order, OrderStatus, ExecutionStatus, Role and TimeInForce types; readJson; trader1/trader2/approver API fixture concepts; signed-in page/context concepts. ApiClient needs typed events, mutations, import and expected-negative-response methods. Add event types with action-specific details in types/, optional ticket inputs to request types, data builders and an Activity/order-details POM in the SDET lane. No such code is written by this plan.

New specs import test and expect from fixtures/index.ts (expect is not currently exported); setup/auth belongs in fixtures via API, using config only through helpers/env.ts. Existing UI fixtures log in through a page; do not copy that pattern into new specs. POM methods contain actions, no assertions; locators are assigned in constructors and navigation waits for URLs. Existing hybrid-create specs are regression references, not coverage of history.

### Data and assertion vocabulary
Every case/variant creates a private order via API unless explicitly a seed test on an isolated app. Baseline: symbol=ACME, side=Buy, quantity=100, limitPrice=42.50; unique clientOrderId built from worker/retry identity plus UUID. Defaults: Day, null goodTillDate, urgent=false, notes=null. No real credential/token values enter the plan or code.

- **H(id):** GET /api/orders/id/events returns 200 and an array. Each event has exactly orderId, at, actor, action, details; orderId equals requested id; at is a valid ISO timestamp; actor/action/details have the specified types and values. Timestamp order is non-decreasing. Assert the full expected action sequence and payloads, not just length/presence. For events created during an action, at is within its local server/test-clock request interval; async events use the interval through the successful poll. Do not require distinct timestamps.
- **CREATED(O,source):** first event has orderId=O.id, action=created, actor=O.createdBy, at=O.createdAt; details exactly {symbol:O.symbol, side:O.side, quantity:O.quantity, limitPrice:O.limitPrice, source}. A duplicate also requires duplicatedFrom=source order id. Normal API/import events have no duplicatedFrom.
- **APPEND(before,new):** history equals the previous event values in the original order followed by exactly the expected new events. Compare named fields and action details, not snapshots of arbitrary runtime responses. A later mutation must not overwrite an earlier changes object.
- **NO-CHANGE:** authenticated observer gets the same full history and same Order fields as before refusal (including updatedAt/decision/execution fields); no new event. Settle Approved orders to Filled first using a 5 s poll at documented default fillDelayMs=4000. For unknown/deleted ids, verify continued 404 and unchanged private sentinel order/history; do not claim this proves absence of inaccessible internal orphan events.
- **NO-OP:** domain Order fields unchanged; updatedAt is allowed to change per DEV-NOTES. Event array is identical; do not incorrectly demand an unchanged updatedAt.
- **ORDER-SHAPE:** exactly existing keys id, clientOrderId, symbol, side, quantity, limitPrice, status, createdBy, createdAt, decidedBy, decidedAt, updatedAt, executionStatus, filledAt, rejectionReason, timeInForce, goodTillDate, urgent, notes; types/nullability from types/order.ts. No events/history field is embedded. Also assert the actual submitted/changed fields, identity and state.
- UI comparisons use web-first assertions against the documented Activity region/list/listitems. Match event time datetime exactly to API at; actor, action label and detail text must match expected values. Avoid global table counts, arbitrary sleeps, force actions or retry/timeout padding.

### Partitions and state model
- Readers: creator trader, other trader, approver (all allowed); no auth; invalid auth (Q2). Read access to another trader's order is expressly allowed, not a BOLA refusal.
- Producers: API create, CSV import, duplicate (deferred), PATCH, PUT, approve, reject, execution, seed reconstruction, cancellation (Q1).
- Editable-field matrix TC05: side Buy→Sell; quantity 100→77; limitPrice 42.50→40.25; clientOrderId unique A→unique B; timeInForce Day→GTC; goodTillDate future date A→later date B on a GTD source; urgent false→true; notes null→unique text. Each method/field variant starts fresh and changes only that field. PUT supplies the other fields unchanged. TC06 adds coupled fields/null normalization; no invented length limits.
- State path: created Pending → edited Pending (zero or more) → Approved → Working → Partially Filled → Filled; or Pending → Rejected; or Pending → deleted. Final-state edits and repeated decisions are rejected. GET and no-op edits add no events.
- Boundaries: rejection absent / 1 character / 200 trimmed characters / whitespace-only / 201 trimmed characters; the last two need exact errors in Q2. Quantity change to 1 and 1,000,000 uses existing documented valid limits. Empty note normalizes to null.
- Approval polling: 5 s bound at documented default 4 s, inspect the retained event log for all intermediate steps even if a GET misses transient order states. UI live-step test TC23 uses an isolated app and documented fillDelayMs=10000 with a planned 15 s overall bound, established before implementation to observe each step reliably; this is not a timeout increase to fix a failing test. No exact millisecond scheduler SLA is assumed.

## Cases
Variant rows expand into independent tests, not one multi-behavior scenario. Priority order is P1 first, then P2/P3; integration and unresolved-observability cases are identified explicitly.

| ID | AC / Risk | Title (should … when …) | Technique | Layer | Priority | Preconditions / Data | Steps (short) | Expected + Assertions | Tags |
|---|---|---|---|---|---|---|---|---|---|
| TC01 | AC1 / R1–2 | should return only the requested order's history when records coexist | AC-driven | API | P1 | Own A/B, different trade values; mutate A only | H(A), H(B), repeat GET | A has exact created+edited entries; B has only its CREATED; all orderIds/actors/details match their respective records; repeat reads identical, no read events. | @api @smoke |
| TC02 | AC1 / R2 | should allow each signed-in role to read another user's history | Decision table | API | P1 | Own fresh source by trader1; reader variants trader1/trader2/approver | Read using Bearer; include cookie-only authenticated variant through fixture | Each is 200 with identical CREATED payload, creator remains trader1; read does not mutate order/history. No 403 is expected for these roles. | @api @smoke |
| TC03 | AC2, AC9 / R1, R7 | should record API provenance when an order is created | AC-driven | API | P1 | Fresh unique baseline input | POST /api/orders; H(id); GET order | POST 201, ORDER-SHAPE, exact input values and Pending Approval; H consists of one CREATED(O,api), persisted on repeat read. | @api @smoke |
| TC04 | AC2 / R1 | should record source order provenance when duplication is available | AC-driven | API | P1 | **DEFERRED: DEV-02 on hold**; future own source and duplicate | Future POST duplicate; H(copy), H(source) | 201 new pending copy; CREATED(copy,duplicate), duplicatedFrom=source.id; no source history inherited; source order/history unchanged. Documented integration obligation only, not executed in this task. | @api @regression |
| TC05 | AC3 / R1, R4 | should append only the changed field when PATCH or PUT updates it | EP | API | P1 | Independent 2 methods × 8 editable-field variants above | Snapshot; update; H; GET | Mutation 200, returned/GET changed field equals requested value; APPEND one edited event with actor=owner, details exactly {method,changes:{field:{from:old,to:new}}}; no other keys in changes; existing CREATED unchanged. | @api @smoke |
| TC06 | AC3 / R1, R4 | should preserve normalized from/to values when related fields or nulls change | Decision table | API | P1 | Fresh variants: GTD→Day; notes text→empty; PUT omits existing clientOrderId; quantity+urgent change together | Perform documented update; H; later make another distinct edit | 200; respective changes exactly {timeInForce:GTD→Day,goodTillDate:date→null}, {notes:text→null}, {clientOrderId:old→null}, or {quantity:100→77,urgent:false→true}; one edited event each, other fields absent. Later edit leaves earlier event details unchanged. | @api @regression |
| TC07 | AC4 / R1, R4 | should retain all execution transitions when approval completes | State transition | API | P1 | Own pending order; approver fixture; default 4 s fill | POST approve; poll H to final sequence ≤5 s | 200 order Approved/Working, decidedBy=approver; H exact created, approved(actor=approver,details={}), execution(system,null→Working), execution(system,Working→Partially Filled), execution(system,Partially Filled→Filled); non-decreasing timestamps, no extras; final GET Filled and valid non-null filledAt; final event at lies within the approval-to-successful-poll interval. Exact equality of independently generated runtime timestamps is not assumed. | @api @smoke |
| TC08 | AC5 / R1 | should record normalized rejection when a decision is accepted | EP/BVA | API | P1 | Fresh cases: reason `  risk limit  `, omitted reason, 1 character, 200 characters after trim | POST reject; H; GET | 200 Rejected; actor=approver; APPEND exactly rejected with details.reason=`risk limit`, null, or exact boundary string respectively; Order.rejectionReason agrees, executionStatus/filledAt null; no execution event. | @api @smoke |
| TC09 | AC6 / R2 | should refuse history reads when no credentials are supplied | EP | API | P1 | Own source; client without Bearer or cookie | GET events anonymously; observer rereads | 401 exact {error:`Authentication required.`}; NO-CHANGE. | @api @regression |
| TC10 | AC6 / R2 | should report an absent history when an id is unknown or deleted | State transition | API | P1 | Separate unknown-id and own-order-deleted variants; private sentinel | GET events authenticated; GET detail | Both 404 exact {error:`Order <id> not found.`}; sentinel fields/history unchanged. Deleted variant first asserts DELETE 204 empty body. This does not prove cancelled event recording (TC30). | @api @regression |
| TC11 | C4 / R2 | should refuse invalid authentication when reading history | Error guessing | API | P1 | Own order, no cookie, invalid Bearer via fixture | GET events; observer rereads | **BLOCKED: Q2** exact status/error unspecified. Require NO-CHANGE; never log token. | @api @regression |
| TC12 | AC3 / R3 | should leave history unchanged when an edit is refused | Decision table | API | P1 | Fresh per method/status variant: other trader, approver, stable Approved, Rejected, unknown id, invalid quantity=0 | PATCH/PUT with otherwise valid inputs; H/GET via observer | Other trader 403 `You can only change your own orders.`; approver 403 `Only a trader can do this.`; final states 409 `Order <id> is already <status>.`; unknown 404 `Order <id> not found.` (exact error objects). NO-CHANGE. Invalid-quantity variant **BLOCKED: Q2**: 400 Validation failed., exact details.quantity needed. | @api @regression |
| TC13 | AC5 / R3 | should append nothing when a decision is refused | Decision table | API | P1 | Fresh variants: approve/reject unknown; approve/reject already Approved or Rejected; trader calls decision; reject whitespace or 201-character reason | Snapshot; attempt decision; observer checks | Known status classes: unknown 404, final state 409, wrong role 403, invalid reason 400. **BLOCKED: Q2** exact decision error bodies/check order absent from supplied spec. Each requires NO-CHANGE; existing execution settled first. | @api @regression |
| TC14 | AC3 / R3, R7 | should retain history when an edit repeats current values | EP | API | P1 | Own order; independent PATCH/PUT variants, existing edited event | Send current values twice, H after each | Both 200, NO-OP each time; no new edited event; earlier values/history retained. updatedAt may change per DEV-NOTES. | @api @regression |
| TC15 | AC1 / R4 | should preserve insertion order when events share a timestamp | BVA | API | P1 | **BLOCKED: Q3** deterministic equal-timestamp fixture or app-level clock-controlled test | Produce known created/edited/decision sequence at equal timestamps; H | 200 exact original action and detail sequence despite identical at values; timestamps actually equal (test must not silently pass without exercising tie). No public seed/clock hook assumed. | @api @regression |
| TC16 | AC1, AC3 / R4 | should preserve both edits when independent fields are updated concurrently | Error guessing | API | P1 | Own pending order; quantity=100, urgent=false | Concurrent PATCH quantity=77 and PATCH urgent=true; H; GET | Both 200; GET quantity=77 and urgent=true; CREATED followed by exactly two edited events, one quantity 100→77 and one urgent false→true, each correct actor and method; either causal completion order allowed, at non-decreasing; no lost/duplicated change. | @api @regression |
| TC17 | AC7 / R1, R6 | should derive exact seed history when an isolated app is reset | AC-driven | API | P1 | **Serial-only exclusive app**; reset response provides seed orders | Reset; select Pending/Approved/Rejected seed records from returned data; H | Reset 200 with ok=true. Pending: CREATED(source=seed) only. Rejected: CREATED then rejected(actor=decidedBy,at=decidedAt,reason=rejectionReason). Approved: CREATED, approved(actor=decidedBy,at=decidedAt,details={}), single execution(system,at=filledAt,details={from:null,to:Filled}); no fabricated edited or intermediate steps. Assert every seed record from response. | @api @regression |
| TC18 | AC7 / R6 | should restore original history when reset follows user changes | State transition | API | P1 | **Serial-only exclusive app**; capture baseline seed orders/H; create unique order; mutate a pending seed owned by fixture user | Reset again; read seed orders/history and created id | 200 ok=true; seed fields/history exactly baseline, added seed edit gone; created order detail/events 404 exact `Order <id> not found.`; second reset produces identical seed history, not appended duplicate events. | @api @regression |
| TC19 | AC8 / R5 | should show precise event content when a signed-in user loads Activity | AC-driven | Hybrid | P2 | Own source created then quantity=77/urgent=true; reader trader1/trader2/approver variants | H via API; open details; reload | Named region Activity and heading Activity; list has exact created+edited sequence. Created line `Buy 100 ACME @ 42.50`; Edited line `Quantity: 100 → 77; Urgent: No → Yes`; correct actor and datetime=API at per item, data-action matching action; reload preserves values/count, no duplicate rows. | @hybrid @regression |
| TC20 | AC8 / R5 | should hide Activity until its events response arrives | State transition | UI | P2 | Own source; context-local gate on events response | Load details while events held; release real response | Activity region hidden before release; then one Created entry with correct trade line/actor/time. No global latency changes or fixed sleeps. | @ui @regression |
| TC21 | AC8 / R5 | should display the documented empty state when events are empty | EP | UI | P3 | Own source; context-local events stub 200 [] | Load details | Exact text `No activity yet.`, zero listitems in Activity; no stale Created text. Stub-only rendering check; live empty history is unreachable today. | @ui @regression |
| TC22 | AC2, AC8 / R1, R5 | should record and render import provenance when CSV creates an order | AC-driven | Hybrid | P2 | Unique clientOrderId; one valid CSV row with baseline values | API import; H(created id); open details | Import 200, created contains exactly submitted trade/id, errors=[], createdLines=[2]; H one CREATED(source=import). UI Created line `Buy 100 ACME @ 42.50 · CSV import`, exact actor and datetime. | @hybrid @regression |
| TC23 | AC4, AC8 / R4–6 | should refresh Activity for each execution step after UI approval | State transition | Hybrid | P2 | **Serial-only exclusive app**; own pending order; approver; set fillDelayMs=10000 and restore in finally | Open source; click Approve; observe without reload; poll within planned 15 s total | POST approve 200/Approved; Approved label with approver, empty detail; then Execution `Working`, `Working → Partially Filled`, `Partially Filled → Filled` with system actor. Assert each stage before next; previous entries persist. Final UI order/time values match exact H sequence from TC07; GET Filled. | @hybrid @regression |
| TC24 | AC5, AC8 / R5 | should refresh Activity when rejection is submitted on details | AC-driven | Hybrid | P2 | Own pending order; approver fixture; reason `risk limit` | Use existing reject prompt action; submit reason; H | API reject 200; GET Rejected/rejectionReason=`risk limit`; Activity adds Rejected with approver, exact datetime and `Reason: risk limit`, previous Created retained; no reload or execution rows. Existing action name from README: Reject with reason…. | @hybrid @regression |
| TC25 | AC8 / R5 | should render normalized and seeded details without inventing values | EP | UI | P2 | Independent cases: API rejection without reason; notes text→null edit; price 42.50→40.25 edit; isolated Approved seed | Open details; compare H/UI | Rejected: `No reason given`. Seed Execution: `Filled`, not a fabricated intermediate transition. Empty field uses `—`, prices use 2 decimals. Exact full labels for notes/price edit lines **BLOCKED: Q2** (not specified); reject/seed variants runnable. Actor/time/order always checked. | @ui @regression |
| TC26 | AC8 / R9 | should display user text literally when a reason contains markup | Error guessing | Hybrid | P2 | Own source, reject via API with reason `<b>risk</b>` | Open Activity | Rejected detail text exactly `Reason: <b>risk</b>` displayed literally; no rendered b element in that detail; H reason equals supplied string. No external payload/network needed. | @hybrid @regression |
| TC27 | AC9 / R7 | should retain existing order response shapes when history is recorded | AC-driven | API | P2 | Own separate cases for create, PATCH, PUT, approve, reject and CSV import | Perform operation, GET detail/list by owned id | Exact documented operation status (201 create, 200 others); ORDER-SHAPE on returned/order/list item; assert input/changed values, current state and identity. Corresponding H exists separately. Do not assert shape only. Existing app regression suite also required. | @api @regression |
| TC28 | AC3, AC9 / R1, R7 | should record accepted edge values without truncation when editing | BVA | API | P2 | Fresh variants quantity=1, quantity=1000000, notes=200 chars | PATCH field; H; GET | 200; field exactly submitted value in Order and event details.changes[field].to; from equals previous value; no unrelated change keys; prior events unchanged. | @api @regression |
| TC29 | AC3 / R1, R4 | should record each real change when a value changes and returns | State transition | API | P2 | Own source quantity=100 | PATCH 77 then PATCH 100; H | Both 200; events exactly CREATED then edited 100→77 then edited 77→100; final Order quantity=100; history must not collapse because final value equals original. | @api @regression |
| TC30 | Ticket / R8 | should record cancellation before removal when a pending order is deleted | AC-driven | API | P1 | **BLOCKED: Q1** internal observation or accepted app-level proof needed; own pending order | DELETE; verify recording via approved mechanism | DELETE 204 empty body; cancelled event requires orderId=deleted id, action=cancelled, actor=owner, valid at, details={}; external GET events/detail 404 per TC10. 404 alone is expressly insufficient evidence of recording. | @api @regression |

## Traceability matrix
| AC | Cases | Covered? |
|---|---|---|
| AC1 | TC01–02, TC15–16 | Planned; equal-time guarantee blocked Q3 |
| AC2 | TC03–04, TC22 | API/import planned; duplicate deferred by Omer's DEV-02 hold |
| AC3 | TC05–06, TC12, TC14, TC16, TC28–29 | Planned; invalid-input error detail in TC12 blocked Q2 |
| AC4 | TC07, TC23 | Planned |
| AC5 | TC08, TC13, TC24 | Planned; refused decision assertions blocked Q2 |
| AC6 | TC09–10 | Planned; extra invalid-token coverage TC11 blocked Q2 |
| AC7 | TC17–18 | Planned, isolated app required |
| AC8 | TC19–26 | Planned; two formatting variants blocked Q2 |
| AC9 | TC03, TC12–14, TC27–28 plus existing suites | Planned; existing suites not run by planner |
| Ticket cancellation | TC10, TC30 | Public 404 planned; actual recording blocked Q1 |

## Regression scope
- POST /api/orders; GET /api/orders and /api/orders/:id → TC01/03/27. Existing tests/orders/hybrid-create.spec.ts has two trader create/list checks and must still pass.
- PATCH/PUT /api/orders/:id → TC05–06/12/14/16/27–29: mutation, no-op semantics, ownership and final-state protection.
- POST /api/orders/:id/approve and /reject → TC07–08/13/23–24/27: state, actor, reason, execution and UI update.
- DELETE /api/orders/:id → TC10/30; no Cancelled order status introduced.
- POST /api/orders/import → TC22/27. Full CSV parser/export testing is outside this focused change; run the existing app suite for unchanged behavior.
- POST /api/test/reset → TC17–18; global config used only in isolated TC23.
- /orders/:id existing actions and details remain alongside Activity; relevant UI action outcomes covered in TC23–24. Activity does not add order response keys.
- DEV-02 duplicate provenance TC04 remains deferred; no change to DEV-02 report or Hub status.

## Parallel-safety
- Every ordinary case/variant creates its own data through fixtures/builders. Do not reuse ORD-1001/ORD-1003 on the shared app. Use unique ids, no global row counts and no dependencies between tests.
- TC17–18, TC23 and the seed variant of TC25 are **serial-only on an exclusive app instance**. They reset/reconfigure or rely on seed data. A serial describe block alone does not exclude other workers/processes; launch these against an isolated instance with no concurrent writers. Configure its URL through helpers/env.ts. Restore config in finally and discard the isolated instance after the group. Never reset/configure the shared :3300 app for these cases.
- TC15/30 need an approved observation mechanism (Q1/Q3), not direct state edits or invented hooks. They remain blocked until defined.
- TC16 is deliberately concurrent within its own order; other rows cannot share it. Response gates/stubs are per browser context and removed on teardown. Contexts close in finally.
- Before NO-CHANGE checks on Approved sources, wait for stable Filled state so natural execution changes cannot masquerade as a refused mutation. All eventual-state checks are bounded polling/web-first assertions.
- Clean up owned pending orders only where needed; deletion is itself a lifecycle action. Final-state unique orders can remain until isolated app disposal; no shared resets.

## Manual / exploratory notes (not automated)
- Check readable chronological layout and browser-local en-GB date presentation in two time zones; automation asserts exact datetime values rather than hardcoded local clock strings.
- Observe console errors during UI scenarios as a cheap diagnostic. No performance SLA is specified; no invented timing threshold beyond documented test polling budgets.
- History-error/loading-retry UX is not specified beyond hidden-until-loaded behavior; do not invent expected messages.

## Questions for Omer
1. **Q1 — cancellation observability (FEATURE-SPEC Q1):** Is 404 after cancellation accepted while the recorded cancelled event remains internal? If so, should Developer provide an app-level assertion proving the cancelled event payload before removal? The public 404 test cannot prove the ticket's recording requirement. TC30 stays blocked pending an observable verification strategy; no global audit endpoint is proposed as an assumption.
2. **Q2 — missing exact contracts:** Please provide/approve exact invalid-Bearer response; invalid quantity=0 details.quantity text; approve/reject error bodies for unknown id, final state, wrong role and invalid reason (whitespace-only or 201 trimmed characters), including precedence where multiple failures apply; and full UI labels for notes/price edited details. TC11, the invalid-input part of TC12, TC13, and notes/price variants of TC25 remain blocked. Existing known edit errors come from README; no unknown message is guessed.
3. **Q3 — equal timestamps:** Can Developer supply a deterministic app-level clock-controlled test proving equal-timestamp insertion order, or is another approved fixture available? Public calls cannot reliably force equal milliseconds. TC15 must actually exercise a tie and cannot rely on chance or browser-clock changes affecting server time.

DEV-02 integration remains deferred because Omer explicitly put that ticket on hold. No answer is inferred from elapsed time. DEV-NOTES also records the main-vs-ticket-branch mismatch and another app previously occupying :3300; this plan neither changes branches nor stops that process. SDET must verify its target is this workspace's app before execution.

## Coverage checklist
| Area | Coverage / reason |
|---|---|
| C1 positive | TC01–08/17–19/22–24; TC04 deferred, TC30 blocked |
| C2 negative/validation | TC09–13; unknown/invalid action cases preserve state/history. GET takes no body or mutable fields, so body validation on the new endpoint is N/A; exhaustive existing parser cases out of scope. |
| C3 boundaries | TC08/13/15/21/25/28; absent/empty/null/length and same-time boundaries; specified cases blocked where needed |
| C4 roles | TC02/09/11/12/13; no signed-in role is refused by GET events |
| C5 cross-user | TC02 allowed read; TC12 refused edit; mutation permission checks remain in existing contracts |
| C6 state transitions | TC07–08/10/12–14/18/23–24/29–30 |
| C7 API contract | H/CREATED/APPEND/exact errors/ORDER-SHAPE; missing exact error values flagged Q2 |
| C8 UI | TC19–26 |
| C9 accessibility | Named Activity region and heading, list/listitem structure, readable text and machine-readable datetime; no new interactive controls or specified focus movement |
| C10 hybrid | TC19/22–24/26 |
| C11 integrity | APPEND/NO-CHANGE/NO-OP, TC06/14/18/19/29; restart durability N/A for documented memory-only storage |
| C12 concurrency | TC16, per-test ownership and exclusive reset/config groups |
| C13 async | TC07/20/23; poll retained events or observe gated responses, no sleeps |
| C14 idempotency/retries | Repeat GET TC01, repeat unchanged edits TC14, repeated refused decisions TC13, reset twice TC18 |
| C15 regression | TC27 plus regression scope and existing suites |
| C16 light non-functional | Exact error object checks exclude extra stack fields where specified; TC26 literal user-text rendering; console diagnostic. Real load/performance tests N/A. |

## Self-check
- [x] Every AC has ≥1 case; each case maps to an AC, ticket requirement or named risk. Deferred integration is explicit.
- [x] Every C1–C16 area is considered and covered/planned or marked N/A with reason; unresolved coverage is not claimed executed.
- [x] Each case has one behavior, technique, layer, priority, data and tags; matrix variants expand independently.
- [ ] Every expected result has complete exact codes/body/text: missing contracts in Q2 prevent this for the marked variants.
- [x] Refused requests include unchanged history/order checks or continued absence plus an owned sentinel. Inaccessible internal state is not claimed verified.
- [x] Cross-user/wrong-role coverage included for the new endpoint (all authenticated roles allowed), with producer ownership/decision-role regression in TC12–13.
- [x] Invalid transitions included alongside valid states; cancelled-event recording still blocked Q1.
- [x] Async states use bounded polling or response gates, never sleeps.
- [x] Every case is parallel-safe or serial-only with exclusive app ownership and reason.
- [x] Regression scope lists affected endpoints/pages and existing checks.
- [x] No invented hook, expected error or unreported result; ambiguous points appear as Questions for Omer.
- [x] Plan sized around behaviors; field/method matrices are needed for explicit AC3 coverage, UI does not repeat all API validations. TC30 is P1 despite being listed last with the observability exception.

## Validation and handoff evidence
- `npm run typecheck` run for this DEV-01 planning task: exit 0.
  ```text
  > pw-live-lab-agents@1.0.0 typecheck
  > tsc --noEmit
  ```
- `npm run test-alone`: not run. `npm test`: not run. `npm --prefix practice-app-v2 test`: not run by Test Planner. DEV-NOTES results are developer-reported, not independent verification.
- Only work/dev/DEV-01/TEST-PLAN.md authored for this task. No code edited and no approval/Go verdict issued. SDET/Reviewer must execute required checks after approved implementation.
- Draft contains 30 case rows with explicit independent variants. Q1–Q3 block complete coverage; TC04 is deferred while DEV-02 is on hold.
