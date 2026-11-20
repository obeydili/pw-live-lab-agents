# TEST-PLAN: DEV-<id> <title>
**Author:** Test Planner (Codex, <model/setting>) · **Status:** Draft → Approved by Omer (date)
**Inputs read:** TICKET.md · FEATURE-SPEC.md · DEV-NOTES.md · existing tests/pages/fixtures (list what you can reuse)
**Guide:** written per `agents/TEST-PLAN-GUIDE.md` and `agents/TEST-STANDARDS.md`

## Scope
- In:
- Out (and why; see guide section 7):

## Risk notes
| Risk | Likelihood (L/M/H) | Impact (L/M/H) | Covered by |
|---|---|---|---|
| e.g. trader can change another trader's order | M | H | TC7 |

## Test design notes (only when they drive more than three cases)
- Partitions / boundaries:
- Decision table:
- State model (valid and invalid transitions):

## Cases
One behaviour per case. Expected + Assertions must name the exact status code, body fields and values, and/or exact UI text, plus "nothing changed" checks for refused requests.

| ID | AC / Risk | Title (should … when …) | Technique | Layer | Priority | Preconditions / Data | Steps (short) | Expected + Assertions | Tags |
|---|---|---|---|---|---|---|---|---|---|
| TC1 | AC1 | should … when … | EP / BVA / DT / ST / Pairwise / Error guess / AC | API / UI / Hybrid | P1 | e.g. trader fixture; order created via API with unique clientOrderId | 1. … 2. … | 201; body.status = "Pending Approval"; GET shows … | @api @smoke |

## Traceability matrix
| AC | Cases | Covered? |
|---|---|---|
| AC1 | TC1, TC4 | Yes |
| AC2 | | BLOCKED: Q1 |

## Regression scope
Existing endpoints, pages and exports this feature touches, and the cases (new or existing specs) that protect them.
- e.g. `GET /api/orders/:id` response keeps all existing fields → TC__ / existing `tests/...`

## Parallel-safety
- Unique data each case creates (e.g. clientOrderId with a timestamp suffix). No global reset.
- Serial-only cases and why (anything that touches `/api/test/reset` or `/api/test/config`):

## Manual / exploratory notes (not automated)
-

## Questions for Omer
1.

## Self-check (tick honestly; see guide section 10)
- [ ] Every AC has ≥1 case and every case points to an AC or a named risk
- [ ] Coverage areas C1–C16 covered or marked N/A with a reason:
- [ ] Each case: one behaviour, technique, layer, priority, data, tags
- [ ] Every Expected has exact codes / body values / UI text; no weak assertions
- [ ] Refused requests also check nothing changed
- [ ] Cross-user (BOLA) and wrong-role cases for every endpoint that takes an id
- [ ] Invalid state transitions included
- [ ] Async states planned as polling with a timeout, never sleeps
- [ ] Parallel-safe, or serial-only with a reason
- [ ] Regression scope filled
- [ ] Nothing invented; unclear points are Questions for Omer
