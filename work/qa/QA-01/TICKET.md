# QA-01: Make the hybrid orders spec parallel-safe and tidy the repo basics
**Written by:** Omer · **For:** SDET (Claude) · **Branch:** `qa/01-parallel-safe`

## Tasks
- Fix the login navigation race: `LoginPage.login()` must wait for `/orders` after clicking Sign in (`waitForURL`). Specs should `reload()` instead of calling `goto` while a navigation is still running.
- Make `tests/orders/hybrid-create.spec.ts` pass with both `npm run test-alone` and `npm test` (parallel), using unique data and no global reset.
- Remove unused imports in that spec. Fix the `ApiClient.me()` error message, which says "Failed to get order".
- `.gitignore`: add `.env.*` with `!.env.example`, `.auth/` and `.DS_Store`.

## Done when
- typecheck is clean, test-alone and parallel are green, SDET-NOTES.md is written, and the Reviewer says Go.
