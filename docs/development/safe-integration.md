# Safe integration and gameplay protection

The canonical integration branch is `main`. The [recovery investigation](notes/2026-11-09-canonical-recovery.md) records why completed work repeatedly appeared to disappear.

## Start and preserve

In the existing repository, inspect `git status --short`, `git branch -avv`, `git worktree list`, and `git stash list`. Preserve unrelated modifications, untracked assets and recovery references before changing branches. Fetch with `git fetch origin`; inspect `git log --left-right --oneline main...origin/main` and outstanding development branches. Local `main` may be stale even immediately after a GitHub PR merged.

For a clean, non-diverged integration checkout, use `git switch main` followed by `git merge --ff-only origin/main`, then create the task branch. On divergence or uncommitted work, preserve and reconcile it instead of resetting. Do not delete stashes or recovery refs as routine cleanup.

Use this folder sequentially unless parallel worktrees have been explicitly authorized. Concurrent agents need independent worktrees and branches, agreed file ownership, and one integrator. Never switch a shared checkout underneath another agent. Worktree isolation does not remove the need to review overlapping changes.

## Review and integrate

Target current `main`. Stacked drafts are possible, but retarget and revalidate them against current `main` before integration. Merging a child PR into a branch whose PR already merged into `main` leaves that child's work outside the integration branch. Squash merges do not preserve ancestry, so compare content as well as commit graphs.

Review the full target-to-head diff, including removed files, asset aliases, initialization, registries and save loading. Restore individual features rather than reverting entire PRs or replacing large files with old copies. Preserve valid changes from both sides of conflicts; never use a blanket “ours” or “theirs” resolution as a substitute for review.

Run:

```sh
npm ci
npm run check:player
npm run test:workflow
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
npm run build
npm run test:critical
git diff --check
```

`scripts/regression/critical-files.json` identifies required runtime connections and critical deletion prefixes. The PR guard uses both the target and proposed inventory and the target's approved character manifest, so editing the proposed inventory alone cannot conceal a deletion or character change. Missing required paths fail; reviewed renames can update the inventory. Existing semantic and browser tests must still pass. New biomes and generator versions are allowed; historical saves and implemented biomes must remain supported.

After merging, inspect the actual resulting `origin/main` and its checks. Fast-forward local `main`; do not simply check out an older integration branch and assume it updated automatically. No reset, force-push or unrelated feature removal is implied by opening a PR.

## Approved visuals

The approved player lives in `docs/assets/source/player-face-continuity/` and the shipped player asset directory. `npm run check:player` checks all 989 manifest entries, including the runtime implementation. Browser tests compare opaque canvas pixels with approved native PNGs in all eight directions and compare the full sprite crops with tracked snapshots. Ordinary tests never regenerate artwork or baselines.

For an intentional improvement, obtain explicit human approval, update the approved sources and manifest together, review before/after evidence, then deliberately refresh the affected snapshots. Do not run historical art generators against production assets. An approved change can update the inventory and tests; the protection does not freeze the game's design forever.

The workflow routes character, baseline, protection changes and critical deletions through the `visual-baselines` environment. It first checks that the environment actually requires reviewer `golba98` and disables administrator bypass; an absent or unprotected environment fails closed. Approval is recorded for the PR head in the workflow run. Agents must never approve this gate on the user's behalf. Environment approval can be performed by the owner even when they opened the PR; the separate existing PR review rule remains in force.

## Publish the hosted merge gates

Workflow files in a local commit do not enforce GitHub merges. The recovery does not push or change hosted settings. Prepare the exact settings payloads with:

```sh
node scripts/regression/prepare-merge-protection.mjs
```

This reads the existing ruleset and writes ignored `artifacts/merge-protection/` payloads. It preserves existing deletion, non-fast-forward, linear-history, PR-review rules and other required checks, removes administrator bypass, and requires the GitHub Actions `critical-regressions` check against an up-to-date integration base. CODEOWNERS requests owner review; explicit approval of visual/protection changes is enforced by the human approval environment, including when the owner authored the PR.

After explicitly authorized publication, configure the human approval environment, run the workflow successfully, then activate the required check:

```sh
gh api --method PUT repos/golba98/Forest-RPG-v2/environments/visual-baselines --input artifacts/merge-protection/environment.json
gh api --method PUT repos/golba98/Forest-RPG-v2/rulesets/25995348 --input artifacts/merge-protection/ruleset.json
```

The first command belongs before any PR needing visual approval; the second belongs after a successful published workflow. With bypass removed, everyone must satisfy the existing independent PR review rule and required checks. Verify the saved settings through GitHub's read API. Never claim merge checks are mandatory until hosted configuration is active.

GitHub documents [required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) and [environment reviewers](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
