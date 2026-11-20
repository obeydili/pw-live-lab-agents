# Test Automation Standards

These are the rules for all test code in this repo. The **SDET** follows them when writing tests, the **Reviewer** checks every change against them, and the **Test Planner** uses them to decide the layer and data for each case. If a rule needs to be broken, write down why in `SDET-NOTES.md` and get Omer's OK.

---

## 1. Project structure
| Folder | What goes there | Rule |
|---|---|---|
| `types/` | Shared interfaces, type aliases and unions (`Order`, `LoginResponse`, `ExecutionStatus` …) | One source of truth. Never redeclare an API shape inside a spec or helper |
| `helpers/` | `ApiClient`, `readJson<T>()`, `env.ts`, small pure utilities | No Playwright `test`/`expect` here. Helpers return data or throw |
| `pages/` | Page objects, one class per page or component (`*.page.ts`) | Locators and user actions only. **No assertions** in page objects |
| `fixtures/` | `test.extend<MyFixtures>()`: the API clients, signed-in pages and page objects | Specs import `test` and `expect` from here only |
| `data/` | Test data builders and factories (`buildOrder()`, unique ids) | No hardcoded shared records |
| `tests/<area>/` | Specs, one feature per file (`tests/orders/hybrid-create.spec.ts`) | Thin. They read like the test case |

## 2. TypeScript
- `strict: true` stays on. **No `any`**, no `@ts-ignore`, no `@ts-expect-error` without a comment explaining why. Use `unknown` and narrow it if you must.
- **Type everything that crosses a boundary.** API requests and responses get interfaces in `types/`, function parameters and return types are explicit (`Promise<Order>`), and fixtures are typed through `MyFixtures`.
- Parse JSON with `readJson<T>(res)`. Check `res.ok()` or the status before you parse it.
- Use **unions for fixed values** (`'Working' | 'Partially Filled' | 'Filled'`, roles, sides), never magic strings. Use `as const` for constant lists.
- Use `import type { … }` for type-only imports.
- Prefer `readonly` for locators and injected dependencies. Use `private` for internal state, like the token in `ApiClient`.
- Prefer modern syntax: `const` by default, destructuring (`const { token } = await readJson<LoginResponse>(res)`), array methods (`map`, `filter`, `find`, `some`, `every`) instead of manual loops, template literals, `?.` and `??`.
- Use small, named functions. No dead code, no commented-out code and no unused imports.

## 3. Page Object Model (POM)
- One class per page. The constructor takes `page: Page` and **assigns every locator in the constructor**.
- **Locator priority:** `getByRole` (with `name`), then `getByLabel`, `getByPlaceholder`, `getByText`, then `getByTestId`, with CSS or XPath last. Never use auto-generated or brittle selectors (`nth-child`, long CSS chains).
- Methods are **user actions** named as verbs (`login()`, `createOrder()`, `filterBy()`, `open(id)`) and return `Promise<void>` or data. A method that navigates **waits for where it lands** (`await this.page.waitForURL(/\/orders/)`).
- **No `expect` inside page objects.** Assertions belong in specs. A page object may expose locators or getters for specs to assert on.
- Reusable widgets (a table, a modal, a toast) get their own component class used by pages.

## 4. Fixtures
- Put setup and teardown in fixtures, not in `beforeEach` copy-paste. Signed-in pages and API clients come from fixtures (`apiClient`, `traderPage`, `approverPage` …).
- A fixture that creates its own context or page **closes it in `finally`** after `use()`.
- Fixtures are lazy and independent, so a test only pays for what it asks for.
- Add a new role or client as a new typed fixture. Never hardcode a login inside a spec.
- Use `storageState` (logging in once per role) only through a setup project, and keep `.auth/` gitignored.

## 5. Writing tests
- **Name tests** `should <behaviour> when <condition>`, and group them with `test.describe('<Feature>')`.
- **Arrange, Act, Assert.** Set up data through the API (fast), act in the UI only for the behaviour under test, then assert.
- Use **web-first assertions only**: `await expect(locator).toHaveText()`, `toBeVisible()`, `toHaveURL()`, `toHaveCount()`. Don't use `expect(await locator.textContent())`.
- **No `waitForTimeout`, no sleeps and no fixed delays.** For async states (Working, then Partially Filled, then Filled) use `expect(...).toHaveText(..., { timeout })` or `expect.poll()`.
- Assert **meaningful outcomes**: status, values and messages, not just "it's visible". Check API responses for **both status code and body**.
- Every assertion message or `test.step()` should make a failure readable.
- Use `test.step()` to label the big phases in longer tests.
- Use tags for the suites: `@smoke`, `@api`, `@ui`, `@hybrid`, `@regression`.

## 6. Test data and parallel safety
- **Every test creates its own data** with unique values (for example a unique note or a `Date.now()` suffix), and asserts only on what it created.
- **No test depends on another test or on run order.** Running with `--workers=1` and in parallel must give the same result.
- **No global reset** (`/api/test/reset`) in parallel runs. Use it only in a serial setup project or a `test.describe.configure({ mode: 'serial' })` block, with a written reason.
- Clean up through the API when the data could affect other tests.
- Use data builders in `data/` with defaults plus overrides: `buildOrder({ side: 'Sell' })`.

## 7. Config and secrets
- All config comes through `helpers/env.ts` (`process.loadEnvFile` plus a `required()` check). Specs never read `process.env` directly.
- **No credentials or tokens in code**, not even practice ones. `.env` and `.env.*` are never committed or printed. `.env.example` holds keys only.
- `baseURL` comes from config. Use relative paths (`page.goto('/orders')`) and no hardcoded hosts or ports in tests.

## 8. API testing
- All calls go through `ApiClient` (a `Bearer` token, typed methods that return typed models).
- Each client method checks the status and throws a clear error: `Failed to create order: 400 Bad Request`.
- Cover the negative cases from `FEATURE-SPEC.md`: 400 validation, 401 with no token, 403 for the wrong role, 404 for an unknown id, plus the error body text.
- Hybrid pattern: create through the API, verify in the UI (or the other way round), then confirm the final state through the API.

## 9. Flakiness and debugging
- A test that fails in parallel but passes serially means a **race or shared state**, not a timing issue to patch. Find the cause.
- **Never** add retries, longer timeouts, `force: true` or weaker assertions just to make a test pass. If it's a real app bug, file `work/bugs/BUG-<n>.md` and mark the test `test.fixme('BUG-<n>')`.
- Keep `trace: 'on-first-retry'` and look at the trace before changing code.

## 10. Definition of Done (every change)
1. `npm run typecheck` is clean.
2. `npm run test-alone` (serial) is green.
3. `npm test` (parallel) is green.
4. There are no `any`, sleeps, `.only`, unused imports or commented-out code, and every new locator follows the priority rules.
5. Every approved plan case or acceptance check maps to a test (listed in `SDET-NOTES.md`).
6. No files are changed outside the role's lane, and there are no secrets.
7. The Reviewer says **Go**.

## 11. Reviewer checklist (copy into REVIEW.md)
- [ ] Structure: each file is in the right folder, and specs are thin
- [ ] Types: no `any`, shared types reused, `readJson<T>` used, explicit return types
- [ ] POM: locators in the constructor, good locator priority, no `expect` in pages, navigation waits
- [ ] Fixtures: used for setup, contexts closed, no logins in specs
- [ ] Assertions: web-first and meaningful, API status plus body checked
- [ ] No sleeps, no `waitForTimeout`, no retry or timeout padding
- [ ] Data: unique per test, parallel-safe, no global reset
- [ ] Config and secrets: everything through `helpers/env.ts`, no credentials in code
- [ ] All three runs (typecheck, serial, parallel) pass, with real output pasted
