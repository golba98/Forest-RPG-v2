# Testing

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. The unit and integration suites use Vitest; Playwright exercises the production preview in Chromium and Firefox. Install the matching browsers with `npx playwright install chromium firefox` if needed. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome for the Chromium project.

The focused browser coverage includes menu/settings, onboarding, water and jumping, tutorial and regular portals, saves, localization, diagnostics and character progression. The broader inherited Tier 1/2 suite also exists; consult the latest execution results in the implementation status rather than assuming all legacy expectations pass. Browser screenshots are useful for finding visual defects but are not a substitute for interactive design review.

Visual rendering checks live in `tests/e2e/visual-rendering.spec.ts` (renderer counters through `window.__RENDER_DEBUG__`: no placeholder textures, portal state sequence, transition, regeneration, resize, overlay) and `tests/e2e/visual-capture.spec.ts`, which writes deterministic before/after captures: `VISUAL_PHASE=before|after npx playwright test tests/e2e/visual-capture.spec.ts --project=chromium` (see `docs/qa/visual-recording-review.md`).
