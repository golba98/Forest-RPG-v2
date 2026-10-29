# Workspace instructions

Work in the existing repository folder. Read [development documentation](docs/development/README.md) for commands, architecture, and validation.

Do not create sibling copies, alternate project folders, or Git worktrees, including nested worktrees, unless the user explicitly requests one. Use branches in this folder when needed.

## Documentation

- Keep the root README focused on public readers: the game, setup, controls, and credits. Keep model instructions, task reports, diagnostics, and workspace details out of it.
- Keep only `README.md` and `AGENTS.md` as root Markdown files.
- When a task needs a written plan or handoff, use `docs/development/notes/<descriptive-task-name>.md`. Update one note per task instead of creating separate briefing, dispatch, progress, and handoff files. Follow the [note format](docs/development/notes/README.md).
- Keep development notes tracked in Git. Do not add ignore rules for notes or Markdown, or recreate coordination folders such as `.agents/teamwork/`.
- Put durable architecture, gameplay, testing, and hosting information in the existing technical guides. Keep QA evidence under `docs/qa/` and attribution with the relevant assets.
- Remove obsolete task notes once their useful information has been incorporated into maintained documentation.

## Validation

Run typecheck, lint, relevant tests, and the production build for code changes. Include browser checks for gameplay or rendering changes. For documentation changes, check formatting, commands, and relative links. Preserve gameplay, assets, and unrelated working changes during cleanup.
