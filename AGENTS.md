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
