Describe the concrete change and any effect on existing gameplay.

- Integration target is current `main`; the complete target-to-head diff was reviewed.
- Existing local work and required character/world capabilities were preserved.
- `npm run check:player`, `npm run test:workflow`, typecheck, lint, unit tests, build and `npm run test:critical` passed.
- Intentional character, visual-baseline or critical-capability changes identify their reason and require the visual-baselines human approval gate.

Include validation results and relevant screenshots. After merging, verify the actual integration revision and fast-forward the local integration branch; a merged PR to another feature branch does not establish integration into `main`.
