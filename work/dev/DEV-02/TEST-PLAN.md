# TEST-PLAN: DEV-02 Duplicate order
**Author:** Test Planner (Codex) · **Status:** Planning complete — Q1–Q2 resolved by Omer; awaiting Hub approval gate
**Inputs read:** DEV-02 TICKET.md, FEATURE-SPEC.md, DEV-NOTES.md; DEV-01 FEATURE-SPEC.md (Activity contract); practice-app-v2/README.md (existing API contract only, no app source); tests/orders/hybrid-create.spec.ts; pages/orders.page.ts and login.page.ts; fixtures/index.ts; types/order.ts; helpers/api-client.ts, readJson.ts and env.ts; playwright.config.ts.
**Guide:** agents/TEST-PLAN-GUIDE.md and agents/TEST-STANDARDS.md; template: agents/templates/TEST-PLAN.md.

## Acceptance criteria
| AC | Contract to prove |
|---|---|
| AC1 | Trader duplicates any existing status/owner: 201, fresh normal Pending Approval order, copied trade/ticket fields, reset identity/decision/execution fields, body ignored, readable in detail/list. |
| AC2 | Every source field unchanged; repeating duplication produces distinct ids even with a source clientOrderId. |
| AC3 | Auth → role → existence precedence; exact 401/403/404 error; no creation. |
| AC4 | Revalidate copied fields; expired GTD returns exact 400/details and creates nothing. |
| AC5 | Trader-only accessible button on every status; loading/in-flight guards; exact success URL/flash; failure toast, source URL retained and button re-enabled. |
| AC6 | Copy's first Activity event identifies creation by duplication and the source id. Added by FEATURE-SPEC beyond ticket AC1–AC5; included here, pending Omer's plan approval. |

## Scope
- In: duplicate endpoint, details action/flash/toast, Activity provenance, persistence, source immutability, repeated/concurrent copies, normal lifecycle of the copy, focused regression.
- Out: table duplicate action, confirmation dialog, editable pre-save copy, copying clientOrderId, Cancelled status, redesign of Cancel/Approve/Reject; CSV/import/quotes/watchlist functionality unrelated to duplication; pixel/layout testing, external services, load tests, exhaustive re-testing of create validation with unreachable corrupt source records.
- No code edits, test execution claims or approval are implied by this plan.

## Risk notes
| Risk | Likelihood | Impact | Covered by |
|---|---|---|---|
| R1: copied decisions/execution or wrong trade values create an incorrect trading ticket | M | H | TC01–04, TC11, TC24–27 |
| R2: cloning mutates source or collides with unique client ids/counter | M | H | TC01–06, TC12 |
| R3: role check bypass or incorrect ownership restriction | M | H | TC01, TC07–10, TC14, TC28 |
| R4: stale GTD date bypasses validation | M | H | TC11 (accepted app-level coverage), TC19 |
| R5: UI double submission, wrong destination/source attribution or invisible errors | M | H | TC13–20 |
| R6: shared data or asynchronous source execution gives misleading results | H | M | isolation rules, stable-source setup, TC12, TC15–16 |
| R7: adding duplication breaks existing creation/actions/read contracts | M | H | TC21–27 |
| R8: error response leaks implementation details | L | M | exact error-body assertions in TC07–08/10–11/29; TC09 response contract excepted by Omer |

## Test design notes
**Reuse and gaps:** Reuse typed Order/status/role unions, readJson, trader1/trader2/approver API fixtures and signed-in page concepts. ApiClient currently supports login/create/get but needs typed duplicate/list/events/update/decision/delete and negative-response support. CreateOrderRequest lacks ticket-field overrides. There is no order-details POM or data builder yet. SDET must add these in its lane, export expect through fixtures, use API authentication for new setup, and close owned contexts in finally. Existing specs are reuse references, not proof of standards compliance or feature coverage. Credentials/config must come through helpers/env.ts; never copy README credentials.

**Data profiles (planned inputs, not observed results):** Every Playwright invocation creates a fresh source via API (TC11 instead uses the accepted app-level custom seed), with a collision-resistant per-test clientOrderId (worker/retry identity plus UUID) and captures its returned id. Base trade is ACME/Buy/10/12.50, documented in DEV-01. Profile D omits ticket fields → Day/null/false/null. Profile G uses Sell, GTD, a valid UTC date safely in the future, urgent=true and a unique short note. Profile C uses GTC, no date, urgent=false, empty note → null. Quantity boundary profiles are 1 and 1,000,000; price is 0.01; note boundary is 200 characters. All source profiles are first verified through GET.

**State/owner matrix:** TC01 expands into six independent cases: source status Pending Approval/Approved/Rejected × source owned by current trader/other trader. Every cell succeeds; there is no forbidden source status or cross-trader BOLA denial for duplication. Setup decisions use documented approve/reject endpoints and approver fixtures; reject reason is `DEV-02 rejection`. Approved setup polls GET until Filled (5 s at documented default 4 s) before the immutable source snapshot. Do not change fillDelayMs. If the app is configured differently, establish the documented default in an isolated environment rather than increasing timeouts to hide a failure.

**Transition model:** source S → source S plus a new Pending Approval copy, for every S. Repeating the event creates another copy. A deleted/nonexistent source cannot duplicate (TC10). Copy Pending Approval → edited Pending Approval, Approved, Rejected or deleted (TC24–27). Forbidden edits after approval/rejection are TC28. Do not invent a rejection rule for duplicating final-state orders.

**Body partitions:** no body (TC01), parsed JSON containing conflicting known/unknown fields (TC04), malformed JSON (TC29, existing global parser contract from README). Source validation, not supplied-body validation, controls the parsed-body case. Invalid-token status/body are accepted as currently returned per Omer; TC09 retains no-creation/source-integrity assertions without prescribing those response values.

**Common exact assertions (incorporated by reference in each row):**
- **COPY(S,T):** POST is 201 with exactly the Order fields enumerated by FEATURE-SPEC. id is a string matching ORD-<digits>, different from S.id; createdBy=T; status=`Pending Approval`; clientOrderId, decidedBy, decidedAt, updatedAt, executionStatus, filledAt, rejectionReason are null. symbol/side/quantity/limitPrice/timeInForce/goodTillDate/urgent/notes equal the captured source values, with D/C defaults above. Validate numeric/boolean/string/null types. createdAt is a valid ISO timestamp within the request's start/end interval on the local app/test clock. Do not require it to differ from a source created in the same millisecond. GET detail succeeds and all fields equal the returned copy; GET list contains that exact id and those values (no shared-list counts). A later GET after reload must retain createdAt/id, not regenerate them.
- **UNCHANGED(S):** follow-up authenticated GET succeeds; compare each named Order field to the captured stable source, including timestamps, notes, identity, decision and execution fields. This is a targeted comparison of a record created by this test, not a whole-response snapshot containing arbitrary ids/timestamps. Where events are checked, GET events is 200 and its array equals the captured source events.
- **NO-CREATE:** on a dedicated app instance with no other writers, snapshot the full unpaginated list's id set before/after; sets are equal, and every pre-existing record has unchanged fields. Use stable records (settle execution first). Never compare a shared application's list counts. Applies to all real refused/malformed requests below. If fixture isolation is unavailable, leave these tests blocked rather than weakening the assertion. No global reset is required.
- **EVENT(C,S,T):** GET /api/orders/C.id/events is 200, one initial event on the untouched copy: orderId=C.id, action=`created`, actor=T, at=C.createdAt, details exactly {symbol:C.symbol, side:C.side, quantity:C.quantity, limitPrice:C.limitPrice, source:`duplicate`, duplicatedFrom:S.id}. No inherited edited/approved/rejected/execution events.
- All polling/web-first expectations use the existing 5 s assertion budget; gate network responses explicitly for loading/in-flight UI cases, with no sleeps, retry increases or global latency changes.

## Cases
Rows with variants expand into independent tests with their own data. TC11 is mapped to existing app-level coverage, not a new Playwright case. P1s precede P2s within API and UI groups; tags apply to every expansion.

| ID | AC / Risk | Title (should … when …) | Technique | Layer | Priority | Preconditions / Data | Steps (short) | Expected + Assertions | Tags |
|---|---|---|---|---|---|---|---|---|---|
| TC01 | AC1–2 / R1–3 | should create a fresh pending copy when any supported status/owner is duplicated | Decision table | API | P1 | Six matrix cells; own unique source, G profile; stable Approved/Rejected source has non-null decision data | Snapshot source; duplicate as current trader; read copy/list/source | COPY(S,T); UNCHANGED(S). Other trader is explicitly allowed; copy belongs to caller, never source owner. | @api @smoke |
| TC02 | AC1 / R1 | should apply create defaults when optional ticket inputs were omitted | EP | API | P1 | Fresh D source | Duplicate; GET both | COPY(S,T), specifically Day/null/false/null; UNCHANGED(S). | @api @regression |
| TC03 | AC1 / R1 | should retain GTC semantics when a source has no date and an empty note | EP | API | P1 | Fresh C source | Duplicate; read copy/source | COPY(S,T), timeInForce=GTC, goodTillDate=null, urgent=false, notes=null; UNCHANGED(S). | @api @regression |
| TC04 | AC1 / R1 | should ignore supplied order overrides when duplicating | Error guessing | API | P1 | Own source; JSON body has quantity=0, symbol=`INVALID`, status=`Approved`, createdBy=other trader, clientOrderId=source's id, notes=`override`, unknownField=true | POST with that parsed JSON body | 201 and COPY(S,T); source fields win, no unknownField in response; UNCHANGED(S). | @api @regression |
| TC05 | AC2 / R2 | should create distinct orders when the same unique-client-id source is duplicated twice | State transition | API | P1 | Fresh source with unique non-null clientOrderId | Duplicate twice; GET each and source | Both 201/COPY; source/copy1/copy2 ids pairwise distinct; both clientOrderId=null; both persist; UNCHANGED(S). | @api @smoke |
| TC06 | AC6 / R2 | should start an independent creation history when duplicating a decided source | AC-driven | API | P1 | Own rejected source, capture its events | Duplicate; GET copy/source events | COPY; EVENT; source events and all source fields unchanged. | @api @smoke |
| TC07 | AC3 / R3, R8 | should require authentication before id lookup | Decision table | API | P1 | Isolated app; no token AND no cookies; separate existing-id and unknown-id variants | Snapshot via authorized observer; POST anonymously | 401, exact {error:`Authentication required.`}; NO-CREATE; UNCHANGED for existing source. | @api @regression |
| TC08 | AC3 / R3, R8 | should reject an approver before id lookup | Decision table | API | P1 | Isolated app; approver; existing-id and unknown-id variants | POST as approver | 403, exact {error:`Only a trader can do this.`}; NO-CREATE; UNCHANGED for existing source. | @api @regression |
| TC09 | C4 / R3 | should leave orders unchanged when an invalid token is supplied | Error guessing | API | P1 | Isolated app; no session cookie; invalid token through fixture | POST against own source; observer verifies state | NO-CREATE and UNCHANGED. Per Omer, accept the current status/error body without prescribing exact values; record the observed status and non-sensitive error text in SDET-NOTES, never the token. This is an explicit response-contract exception, not a guessed missing-auth response. | @api @regression |
| TC10 | AC3 / R2–3 | should refuse duplication when the source does not exist | State transition | API | P1 | Isolated app; authenticated trader; unknown-id and previously-created-then-deleted-id variants | Verify absence; POST | 404, exact {error:`Order <id> not found.`}; NO-CREATE; GET still 404 with same error. | @api @regression |
| TC11 | AC4 / R4 | should reject a copied GTD date when it is in the past | BVA | API (app-level) | P1 | Existing custom-seed case in practice-app-v2/tests/duplicate.test.js, identified in DEV-NOTES as AC4; expired GTD source in its isolated app | SDET maps AC4 to that existing case; Reviewer reruns app tests and checks assertion coverage | 400; exact {error:`Validation failed.`,details:{goodTillDate:`Good till date is required for GTD and cannot be in the past.`}}; NO-CREATE; UNCHANGED. Omer accepts app-level coverage; no new hook or Playwright expired-date setup. Any assertion gap belongs to Developer, not an SDET app-code edit. | @api @regression (plan classification) |
| TC12 | AC1–2 / R2, R6 | should allocate independent copies when two traders duplicate concurrently | Error guessing | API | P1 | Fresh source; trader1 and trader2 clients; no source mutations | Issue both requests concurrently; read returned ids | Both 201/COPY for the respective caller; distinct ids; both persist; EVENT for each; UNCHANGED(S). Do not assert contiguous counters in parallel. | @api @regression |
| TC13 | AC5 / R5 | should navigate to the new copy when the trader activates Duplicate order | AC-driven | Hybrid | P1 | Fresh source via API; signed-in trader; keyboard activation | Load source; focus named button and activate; capture successful response; read destination/API | Exactly one duplicate POST, 201/COPY; URL exactly /orders/<newId>?duplicated=1; status flash exact `Order <newId> created as a copy of <sourceId>.`; UNCHANGED(S). | @hybrid @smoke |
| TC14 | AC5 / R3 | should expose duplication only to traders after any source status loads | Decision table | UI | P2 | Fresh stable own/other sources across all three states; trader and approver variants | Load details | Trader: button role/name `Duplicate order`, testid duplicate-order, enabled. Approver: zero matching buttons. For pending owner, Cancel order precedes duplicate in document order. No pixel-position assertion. | @ui @regression |
| TC15 | AC5 / R5–6 | should hide duplication until source details finish loading | State transition | UI | P2 | Fresh source; gate this page's detail response only | Visit while response held; release | loading-spinner visible, zero Duplicate order buttons while held; after release spinner gone and named button enabled. | @ui @regression |
| TC16 | AC5 / R5–6 | should prevent a second submission while duplication is in flight | State transition | Hybrid | P2 | Fresh source; gate real duplicate response locally | Click once; inspect pending state; release response | Named button disabled before release; no second duplicate request from repeated user activation; then one 201/COPY and exact TC13 URL/flash. No force clicks. | @hybrid @regression |
| TC17 | AC5–6 / R5 | should recover source attribution when sessionStorage has no copy source | Error guessing | Hybrid | P2 | Own copy made via API; fresh signed-in browser context with empty sessionStorage | Visit copy URL with ?duplicated=1; reload once | Exact TC13 flash on both loads, attributed to actual source; EVENT and copy fields persist unchanged. | @hybrid @regression |
| TC18 | AC5 / R5 | should hide the duplicate flash when the flag is absent | EP | UI | P2 | Own source/copy | Visit plain /orders/<copyId> | Flash status element hidden, not a stale duplicate message; source and copy still exist. | @ui @regression |
| TC19 | AC5 / R4–5 | should render validation details and allow retry when the endpoint refuses | Error guessing | UI | P2 | Fresh source; intercept only this context's duplicate call and fulfill the exact documented 400 JSON | Click; inspect error; remove intercept and retry against real API | Toast role alert contains exact `Validation failed. Good till date is required for GTD and cannot be in the past.` (dismiss glyph may coexist); source URL unchanged; button enabled; source unchanged and no backend duplicate request during stubbed refusal. Retry gives TC13 success. This verifies UI handling only, NOT AC4 backend validation. | @ui @regression |
| TC20 | AC3, AC5 / R5 | should recover on a real not-found response when the source was deleted after loading | State transition | Hybrid | P2 | Isolated app; own pending source loaded, then deleted through API | Click still-rendered duplicate button | POST 404 with exact `Order <sourceId> not found.`; toast contains that text; source URL unchanged, button re-enabled; NO-CREATE and source remains absent. | @hybrid @regression |
| TC21 | AC1 / R1 | should retain valid boundary values when copying | BVA | API | P2 | Independent profiles: quantity=1; quantity=1,000,000; limitPrice=0.01; notes=200 characters; GTD date=today UTC (skip/recreate setup crossing UTC midnight) | Create source then duplicate | COPY and UNCHANGED; exact boundary value survives POST and GET. Each variant changes only its named boundary input from baseline. | @api @regression |
| TC22 | AC1 / R2, R7 | should share the existing id allocator with ordinary creation | AC-driven | API | P2 | Isolated app, no concurrent writes; fresh source | Duplicate, then ordinary POST create | Both 201; numeric duplicate suffix equals source suffix+1, ordinary suffix equals duplicate suffix+1; all three ids distinct and persist; ordinary order has its own submitted clientOrderId. Do not hardcode ORD-1026. | @api @regression |
| TC23 | AC5 / R7 | should preserve the existing creation flash when created=1 is used | AC-driven | UI | P2 | Fresh normal API-created order | Visit /orders/<id>?created=1 | Exact status text `Order <id> submitted for approval.`; no copy-of text. | @ui @regression |
| TC24 | State/data rules / R1, R7 | should edit a copy independently when its owner updates it | State transition | API | P2 | Independent fresh copy for PATCH and PUT variants | PATCH quantity=77; or PUT same symbol/side/price, quantity=77, omit clientOrderId | 200; quantity=77, status=Pending Approval, clientOrderId=null, updatedAt valid non-null timestamp; GET retains changes; other non-updated fields match baseline; source UNCHANGED. | @api @regression |
| TC25 | State/data rules / R1, R7 | should approve a copy independently when an approver acts | State transition | API | P2 | Own fresh copy, approver fixture | POST approve; poll detail | 200, status=Approved, decidedBy=current approver, decidedAt valid timestamp, executionStatus=Working; poll within 5 s to Filled and filledAt valid non-null timestamp; source UNCHANGED. | @api @regression |
| TC26 | State/data rules / R1, R7 | should reject a copy independently when an approver acts | State transition | API | P2 | Own fresh copy; reason `DEV-02 rejection` | POST reject; GET | 200, status=Rejected, rejectionReason exactly sent reason, decidedBy=current approver, decidedAt valid non-null timestamp, executionStatus/filledAt=null; GET agrees; source UNCHANGED. | @api @regression |
| TC27 | State/data rules / R1, R7 | should remove only the copy when its owner cancels | State transition | API | P2 | Fresh source and copy | DELETE copy; GET copy/source | DELETE 204 with empty body; GET copy 404 exact `Order <copyId> not found.`; source UNCHANGED. | @api @regression |
| TC28 | State/data rules / R3, R7 | should retain ordinary edit restrictions on a copied order | Decision table | API | P1 | Isolated app; own copy. Variants: other trader, approver, owner after Approved/Filled, owner after Rejected | Snapshot; PATCH quantity=77 as specified actor | Other trader 403 `You can only change your own orders.`; approver 403 `Only a trader can do this.`; final states 409 `Order <copyId> is already <Approved or Rejected>.`; exact {error:message}; copy/source UNCHANGED, event arrays unchanged, NO-CREATE. | @api @regression |
| TC29 | Existing parser / R8 | should reject malformed JSON before duplicating | Error guessing | API | P2 | Isolated app; own source, authenticated trader | Send malformed application/json body | 400 exact {error:`Malformed JSON body.`}; NO-CREATE; source UNCHANGED. Parsed JSON overrides remain ignored per TC04. | @api @regression |

## Traceability matrix
| AC | Cases | Covered? |
|---|---|---|
| AC1 | TC01–04, TC12, TC21–22 | Planned |
| AC2 | TC01–06, TC12; UNCHANGED throughout | Planned |
| AC3 | TC07–10, TC20 | Planned; TC09 exact response values excepted by Omer, integrity checks retained |
| AC4 | TC11 | Accepted app-level coverage via TC11; Reviewer to verify/rerun; TC19 remains UI-only |
| AC5 | TC13–20, TC23 | Planned |
| AC6 | TC06, TC12, TC17 | Planned from FEATURE-SPEC extension |
| State/data rules and named regression risks | TC24–29 | Planned |

## Regression scope
- POST /api/orders and shared allocator/defaults → TC02–03, TC21–22; existing tests/orders/hybrid-create.spec.ts has two create/list scenarios, not duplicate coverage.
- GET /api/orders and GET /api/orders/:id keep the normal Order shape and persistent values → COPY checks across API and hybrid cases.
- PATCH/PUT/DELETE /api/orders/:id and POST /api/orders/:id/approve and /reject → TC24–28 on independent copies; source isolation included.
- GET /api/orders/:id/events → TC06/12/17; read allowed for all signed-in roles per DEV-01. Full history endpoint permissions remain DEV-01's scope, not a second DEV-01 suite.
- /orders/:id flash/loading/actions/toasts → TC13–20/23; accessible Cancel/Approve/Reject coexistence can be inspected in TC14, without expanding this ticket into all existing UI workflows.
- No CSV format changes specified; exhaustive exports/imports remain outside scope. App-level regression results in DEV-NOTES are developer-reported only and were not rerun by this planner.

## Parallel-safety
- Every row/variant owns fresh source/copy ids; profile notes/client ids use unique data. No seed orders, shared resets, fixed next-id assumptions, cross-test dependencies or assertions against other workers' rows.
- TC07–10, TC20, TC22, TC28–29 require an isolated app instance for global no-creation/counter assertions. Run this group serially with exclusive app ownership. Merely setting a describe block to serial or running --workers=1 while another suite hits the same app is insufficient. Do not reset or reconfigure the shared :3300 instance. Provision isolation through fixtures/config using helpers/env.ts; no app code change implied.
- TC11 uses the existing app-level test’s custom seed and isolated app; it does not require a public seed endpoint or a shared-app reset. Its tags above classify the plan, not existing node:test metadata.
- Other tests are parallel-safe, including TC12's deliberate concurrency within its own source. Global reset/config is never needed. Network gates/stubs affect only the owned browser context and are removed in teardown.
- Approved sources must settle before immutable snapshots. Execution events are independently asynchronous; never interpret legitimate fill transitions as duplicate mutations.
- Clean up owned pending records through the API when needed; final-state records remain unique and can disappear with the isolated instance lifecycle. Do not attempt unsupported deletes or reset shared data.

## Manual / exploratory notes (not automated)
- Inspect action placement, focus visibility and toast readability; pixel styling is not a pass/fail requirement. Keyboard activation is automated in TC13.
- Observe console errors during the focused UI scenarios as a cheap diagnostic; no performance SLA or load-testing gate is invented.

## Questions for Omer — resolved
No outstanding questions for this planning handoff.

1. **Q1 — resolved by Omer:** “app-level coverage is sufficient.” AC4 maps to the existing custom-seed app-level case in practice-app-v2/tests/duplicate.test.js, reported by DEV-NOTES as `AC4: copied fields that no longer pass POST validation give 400 with details, and nothing is created`. SDET records that mapping in SDET-NOTES; Reviewer independently runs `npm --prefix practice-app-v2 test` and verifies the required assertions. No test-only hook or new Playwright expired-GTD setup is required. TC19 remains the separate UI failure-rendering check. The planner has not rerun or inspected that app test and does not claim independent proof of its results.
2. **Q2 — resolved by Omer:** “whatever the status/error body is returning for an invalid Bearer token is fine for now.” Exact response-contract enforcement is deferred; no current value is invented or frozen as a requirement. TC09 checks no creation and unchanged source, and asks SDET to record the observed non-sensitive response for reference. Omer may request a later ticket; this plan does not create one.

These decisions resolve the blockers and authorize completing the planning handoff. They do not bypass Omer’s Hub approval gate. DEV-01 remains on hold; DEV-02’s limited Activity provenance/fallback checks stay within this feature’s contract and do not resume DEV-01 work.

The branch observed was `main`; ticket names `dev/02-duplicate-order`, and DEV-NOTES acknowledges this mismatch. No branch/history changes made. This plan does not approve the implementation's working-tree location.

## Coverage checklist
| Area | Disposition |
|---|---|
| C1 positive | TC01–06/12–13 |
| C2 validation | TC04/11/19/29; source corruption other than expired GTD not publicly constructible. Body-field validation is N/A because parsed body is ignored. |
| C3 boundaries | TC11/21; omission/empty note TC02–03. Exhaustive invalid quantity/price/length sources N/A: create rejects them and no seeding hook is approved. |
| C4 roles/auth | TC01/07–09/14; invalid-token integrity covered, exact response values excepted by Omer |
| C5 cross-user | TC01 explicitly allows cross-trader duplication; TC12 caller attribution; TC28 preserves edit ownership |
| C6 states | TC01/05/10/24–28; final source states are valid, deleted source invalid |
| C7 API contract | COPY, EVENT, exact error bodies throughout, malformed JSON TC29 |
| C8 UI | TC13–20/23 |
| C9 accessibility | TC13–16 use documented button role/name; flash status and toast alert; no new inputs/unspecified focus restoration |
| C10 hybrid | TC13/16–17/20 |
| C11 integrity/persistence | COPY/UNCHANGED, TC06/17/24–28; server-restart persistence N/A for documented in-memory app |
| C12 concurrency | TC12/16 and isolation rules |
| C13 async | Stable Approved setup; TC15–16 gates; TC25 bounded polling, no sleeps |
| C14 retries | TC05 non-idempotent repeat; TC19 UI recovery |
| C15 regression | TC22–28 and regression scope |
| C16 light non-functional | Exact error-object shape rejects extra stack fields; keyboard behavior; console diagnostic. No latency SLA specified. |

## Self-check
- [x] Every AC has at least one case; every case points to an AC, existing contract or named risk.
- [x] Every C1–C16 area is covered/planned or explicitly scoped N/A with a reason; accepted coverage and contract exceptions identified above.
- [x] Each case checks one behavior and has technique, layer, priority, data and tags; matrix variants are independent.
- [x] Every case has meaningful exact outcomes; TC09 intentionally omits exact status/body under Omer’s explicit exception and asserts unchanged state/no creation. TC11 uses accepted app-level setup and exact AC4 assertions.
- [x] All refused real requests include no-creation and unchanged/absent-record checks; stubbed TC19 explicitly makes no backend claim.
- [x] Cross-user and wrong-role duplication covered for the feature endpoint; copy lifecycle security via TC28; broad existing endpoint matrices remain their original suites' scope.
- [x] Invalid states included (deleted source, final-state edits); final-state duplication correctly remains allowed.
- [x] Async checks use explicit gates or polling with 5 s timeout, never sleeps.
- [x] Every case is parallel-safe or marked serial-only on an exclusive app, with reason.
- [x] Regression scope filled.
- [x] Q1–Q2 are resolved below; no guessed endpoint, error text or hook, and no remaining question blocks this planning handoff.
- [x] Plan avoids full UI/API duplication and near-duplicate cases; P1 security case TC28 is in the lifecycle group for readability and should run with other P1s.

## Validation and handoff evidence
- `npm run typecheck` rerun by Test Planner after Omer resolved Q1–Q2: exit 0; output:
  ```text
  > pw-live-lab-agents@1.0.0 typecheck
  > tsc --noEmit
  ```
- `npm run test-alone`: not run. `npm test`: not run. App tests: not run. This is a planning handoff, not a Go verdict; SDET and Reviewer must execute required validation after implementation.
- Only this TEST-PLAN.md updated in this continuation. The plan has 29 case rows (28 Playwright rows plus 1 existing app-level coverage mapping, with documented independent variants). Q1–Q2 resolved; no remaining planning blockers. This completion does not approve the plan or issue a Go verdict.
