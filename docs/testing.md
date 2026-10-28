# Testing

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. The unit and integration suites use Vitest; Playwright exercises the production preview in Chromium and Firefox. Install the matching browsers with `npx playwright install chromium firefox` if needed. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome for the Chromium project.

The focused browser coverage includes menu/settings, onboarding, water and jumping, tutorial and regular portals, saves, localization, diagnostics and character progression. The broader inherited Tier 1/2 suite also exists; consult the latest execution results in the implementation status rather than assuming all legacy expectations pass. Browser screenshots are useful for finding visual defects but are not a substitute for interactive design review.
