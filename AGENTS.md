# Workspace instructions

Work in the existing repository folder. Read [development documentation](docs/development/README.md) for commands, architecture, and validation.

Do not create sibling copies, alternate project folders, or Git worktrees, including nested worktrees, unless the user explicitly requests one. Use branches in this folder when needed.

## Documentation

- Keep the root README focused on public readers: the game, setup, controls, and credits. Keep model instructions, task reports, diagnostics, and workspace details out of it.
- Keep only `README.md` and `AGENTS.md` as root Markdown files.
- Put temporary plans, drafts, and handoffs in ignored `docs/tmp/`. Keep one note per task; see the [note guidance](docs/development/notes/README.md).
- Keep maintained documentation tracked. Do not ignore Markdown globally or recreate coordination folders such as `.agents/teamwork/`.
- Put durable architecture, gameplay, testing, and hosting information in the existing technical guides. Browser captures belong in ignored `test-results/`; standalone captures and profiles belong in ignored `artifacts/`. Keep curated documentation images in `docs/images/` and attribution with the relevant assets.
- Remove obsolete task notes once their useful information has been incorporated into maintained documentation.

## Validation

Run typecheck, lint, relevant tests, and the production build for code changes. Include browser checks for gameplay or rendering changes. For documentation changes, check formatting, commands, and relative links. Preserve gameplay, assets, and unrelated working changes during cleanup.

## Git and critical gameplay protection

- Follow the [safe integration workflow](docs/development/safe-integration.md). Inspect status, branches, stashes and worktrees before editing. Fetch and verify current `origin/main`; never assume local `main` contains completed local or remote work.
- Preserve local changes and recovery references before switching branches. Do not reset, force-push, delete branches, apply blanket conflict resolutions or simplify unrelated gameplay to prepare a PR.
- Integrate into current `main`. A PR merged into a feature branch, especially after that branch's main PR merged, is not integrated. Retarget stacked work and review the complete final diff; compare saved snapshots by content after squash/rebase.
- The November 3 approved player is canonical. Run `npm run check:player`; do not regenerate its artwork, update approval hashes or visual baselines without explicit human approval. Retain the existing world library, five biomes, streamed generation and save compatibility.
- Run `npm run test:workflow` and `npm run test:critical` in addition to the checks above before merging gameplay changes. Never skip a failing check or update a baseline just to make CI pass.
- Work sequentially in this folder by default. Concurrent agents may use isolated worktrees only when explicitly authorized; each needs a separate branch and agreed file ownership. Never share a mutable checkout or reset another agent's work. A single integrator resolves overlaps and verifies the combined game.
- After merging, verify the actual merged tree and critical checks, then fast-forward local `main` with `git merge --ff-only origin/main`. Stop and reconcile divergence instead of resetting. Opening a PR authorizes no unrelated removal or replacement.

## Silent automated browsers

All automated browser tests, captures, and profiling runs must stay silent on the user's speakers and headphones, including headed runs and ad hoc agent scripts. Use Chromium `--mute-audio` and Firefox `firefoxUserPrefs: { 'media.volume_scale': '0.0' }` (or the equivalent Selenium preference). Keep browser-specific launch options when overriding shared configuration. Tests that need to measure real audio must run through an isolated null sink and must never fall back to a physical output. Do not remove these protections or enable audible test playback without an explicit user request.
