# Canonical player and world recovery — November 9, 2026

## Finding and recovery baseline

The accumulated development was recoverable. At investigation start, the running checkout was local `main` at `a5cd38b6b78d05782346ea2a7d3ab7f0c3b381d1` (October 31). GitHub `main` was `046aa9e70d3d5933d4d481fbdad2135bb34682f5` (November 7), four integration commits ahead. The local branch had not advanced when the remote PRs merged.

The recovery fast-forwarded local `main` to the verified remote integration commit and created `recovery/canonical-player-worlds` there. This restores the actual accumulated implementation in the existing workspace. No replacement artwork or world system was created, and no whole historical file or PR was reverted. Subsequent changes add regression protection and explicit missing-player-art failure handling.

| Area                            | Historical evidence and resulting implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Best base character             | User-approved November 3 character in `docs/assets/source/player-face-continuity/approval.json`; complete implementation at `31e0a48`, saved again in `1a8ee54` and integration commit `046aa9e`. All **989** approved files match their recorded SHA-256 values and the local approved-character recovery bundle.                                                                                                                                                                                                   |
| Character disconnection         | [PR #19](https://github.com/golba98/Forest-RPG-v2/pull/19), integration `21d82c0`, added the approved artwork while nine approved runtime/data files were absent. The renderer/animation integration followed on feature branches through [#24](https://github.com/golba98/Forest-RPG-v2/pull/24) and [#25](https://github.com/golba98/Forest-RPG-v2/pull/25). They did not reach `main` through those PRs. [#28](https://github.com/golba98/Forest-RPG-v2/pull/28) finally integrated the complete saved workspace. |
| Latest local regression trigger | HEAD reflog: **November 7, 22:25:43 +02:00**, checkout from `pr/save-workspace-20261107` (`7dbb6df`) to local `main` (`a5cd38b`). The checked-out game consequently lacked the newer implementations even though GitHub already contained them. Similar stale-main checkouts appear November 2 at 02:38:06 and November 4 at 01:17:24.                                                                                                                                                                               |
| Multiple maps/worlds            | Named library added in `52cc31f`, incorporated into `31e0a48`; [#26](https://github.com/golba98/Forest-RPG-v2/pull/26) merged into `pr/world-biomes-20261104`, not `main`. Present and connected in `046aa9e`: Play → Your Worlds; create, select, resume, rename, delete, import/export and independent saves.                                                                                                                                                                                                      |
| Biomes and streaming            | Initial streaming `f02cdf3` / [#18](https://github.com/golba98/Forest-RPG-v2/pull/18); connected five-biome integration `7e6e3e6`, then `31e0a48` and `046aa9e`. Existing generator 16, signed chunk coordinates, biome geography/landing, streaming residency, elevation/terraces, rivers, bridges and persisted edits remain intact.                                                                                                                                                                               |
| Exploration interface           | Developer → Biomes, all five environments, pause → Change Biome, and return to menu are the historical implementation. Developer content browser `bb5776c` was included in `31e0a48`; [#27](https://github.com/golba98/Forest-RPG-v2/pull/27) merged into the world-library feature branch.                                                                                                                                                                                                                          |
| Earlier proven omission         | [#13](https://github.com/golba98/Forest-RPG-v2/pull/13) merged to `main` at October 31 16:21:28 UTC. [#14](https://github.com/golba98/Forest-RPG-v2/pull/14) merged woodland/treasure into that already-integrated feature branch at 16:21:32 UTC. Integration `218ce66` therefore omitted the woodland changes. [#16](https://github.com/golba98/Forest-RPG-v2/pull/16), integration `a5cd38b`, repaired the omission.                                                                                              |

## Exact character wiring and intermediate breakage

The approved player uses 56 directional strips: 12 idle frames; 16 each for walk, run and jump; and 18 for each of three punches. Cells are 64×64, anchored at (32,54). Fixed head details, breathing, pose transitions and the independent blink clock are preserved. The runtime chain is `PixiRenderer` → `EntityAnimator` / `PlayerMotion` → `PlayerCompositor` → `PlayerNativePresenter`, using approved native-pixel and face metadata.

The nine files missing from `21d82c0` and `f514acb`, relative to the final approval manifest, were:

- `src/animation/PlayerMotion.ts`
- `src/animation/PlayerBlink.ts`
- `src/animation/PlayerFace.ts`
- `src/animation/PlayerNativePresenter.ts`
- `src/animation/playerPixelMath.ts`
- `src/animation/playerNativePixels.json`
- `src/animation/playerFaceMetadata.json`
- `src/animation/playerFluidMetadata.json`
- `src/rendering/PlayerCompositor.ts`

The shared integration also needed `src/animation/AnimationDefs.ts`, `src/rendering/EntityAnimator.ts`, and `src/rendering/PixiRenderer.ts`. Saving the sprites separately left the older animation definitions active. PR #23 explicitly recorded the inherited mismatch: the new idle-north strip was 768 pixels wide while the older definition expected 384. This was incomplete runtime integration, rather than evidence that the approved pixels had been erased.

At `31e0a48`, `1a8ee54` and `046aa9e`, all 989 approved manifest entries match; at `21d82c0` and `f514acb`, nine are missing and the other 980 match. The current recovery preserves every approved byte. `046aa9e` has the same active source implementation as `31e0a48`; it additionally reintroduces seven historical playback/test files. Those are retained in this recovery because deleting historical material is unnecessary to reconnect the game.

## Why the regressions repeated

1. **A stale integration checkout was reused.** GitHub merging a PR does not move an existing local branch. Switching back to the October 31 local `main` repeatedly displayed the older player and finite world. The latest exact trigger is in HEAD reflog, rather than a new deletion commit.
2. **Stacked PR completion was confused with integration completion.** PRs #20–22 and #24–27 targeted feature branches. In the second stack, #23 reached `main` before #24–27 were merged into their respective parents. A green “merged” indicator did not mean those later features reached `main`.
3. **Assets and their consumers were split across independently merged changes.** PR #19 exposed new sheets before their matching runtime. A build could pass while the displayed character and frame layout were wrong.
4. **Local work needed explicit preservation.** The November 4 stash `f83a4db` and November 7 snapshot `1a8ee54` contain substantial saved work. PR #28 saved 1,321 changed/new files from the local workspace and resolved 62 conflicts using that snapshot. Its PR description says tests/browser checks were skipped at the user's request. This recovery supplies fresh validation rather than treating that snapshot as independently verified.
5. **GitHub had no gameplay merge gate.** There were no Actions workflows and no required status checks. Ruleset `25995348` required a review but allowed administrators to bypass it. Review alone did not check character appearance, menu reachability or save isolation.

There are historical parallel-agent branches and October 28 merges of partial agent work. The evidence does not establish that a parallel-agent collision caused the latest regression. Likewise, reflog reset entries alone do not prove permanent data loss. The approved implementation was found intact; no reconstruction was needed.

Stable patch-ID comparisons confirm the history rewrite: `549cd8a` and `3b11aba` contain the same player-animation patch, `2570033` and `7e6e3e6` the same world integration patch, and `60b3a2b` and `4d5573a` the same environment-art patch. Streaming commit `f02cdf3` has identical selected source/test/player-asset trees to integration `3067fe5`: that earlier child PR merged before its parent, so its content did reach `main`. PRs #1 and #11 were closed without merging; their historical refs remain preserved. No currently open PR contained a newer approved character.

## Preservation and boundaries

At investigation start there were no tracked local modifications and the only visible untracked top-level item was `archive/`. There was one active worktree and three stashes. Read-only investigation included all branch refs, reflogs, deletion history, unreachable objects, PR base/merge metadata, runtime imports and asset hashes.

Before changing branches, ignored `artifacts/canonical-recovery-20261109-120801/` received a verified Git bundle, original status and refs, full reflog, binary index/worktree patches, saved object inventory, checksum manifest and local-file archives. All 31,875 character archive files, including 891 files hidden by existing ignore rules, were preserved alongside the approved-character bundle and temporary notes. Twenty-one `refs/recovery/20261109-120801/…` references protect the starting HEAD, integration baseline, all three stashes and sixteen otherwise unreachable commits. Existing stashes and branches were not deleted.

The original reference project was not modified. No hard reset, destructive cleanup, force push, alternate project folder or extra worktree was used.

## Recovery changes and prevention

The new required-player-asset validator checks all directional sheet layouts at boot. A missing or incompatible player sheet now stops loading with an explicit error instead of silently selecting the texture loader's placeholder. Optional-art behavior is otherwise preserved. No save envelope, stored generator version, procedural output, terrain, player pixels or approved animation implementation was changed.

`npm run check:player` verifies the complete approval manifest. The browser appearance test checks the actual displayed pose, native dimensions, every opaque source pixel and full sprite-crop snapshots in all eight directions. Missing-art startup is tested in both browsers. Existing direction, animation, blink, biome, world-library, archive and compatibility suites are included in the mandatory gameplay configuration.

The PR diff guard compares the exact target commit with the proposed head, requires the integration target to be `main`, checks required paths, and uses both versions of the critical inventory plus the target's approved-file list. Character/baseline/protection changes and critical deletions require a human approval environment. Intentional reviewed renames and improvements can update the inventory; the protection does not forbid future development.

The workflow, owner rules, PR template and [safe integration guide](../safe-integration.md) establish full-diff review, current integration ancestry, preservation before branch changes, explicit approval for visual changes, and verification after merging. Exact hosted ruleset/environment payloads are prepared under ignored `artifacts/merge-protection/`. They remove administrator bypass and make the final gameplay check mandatory for everyone while preserving existing review requirements.

**Hosted enforcement is not active from these local files.** No push, new PR, hosted ruleset update or environment update is performed by this recovery. Publication and activation remain pending; the guide specifies the order and exact commands. The CI configuration is locally exercised where possible, but a GitHub-hosted workflow result requires publication.

## Validation

The starting October 31 checkout's passing tests do not establish the recovered game's correctness. Fresh validation of the recovered implementation is recorded separately:

| Check                        | Result                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit/integration suite  | **898 passed**, 94 files, `npm test -- --maxWorkers=2`.                                                                                                                                                                                                                   |
| Approved character integrity | All **989 files** match; no approved artwork or runtime implementation changed.                                                                                                                                                                                           |
| Typecheck                    | Application/tests and `tsconfig.node.json` pass.                                                                                                                                                                                                                          |
| Lint                         | No errors; 66 existing warnings.                                                                                                                                                                                                                                          |
| Production build             | Passes; existing bundle-size advisories remain.                                                                                                                                                                                                                           |
| Workflow guard tests         | All seven pass; the actual integration-to-staged-tree guard also requests approval for protection/baseline changes.                                                                                                                                                       |
| Workflow syntax              | `actionlint` v1.7.12 passes.                                                                                                                                                                                                                                              |
| CI-style rendering           | Six focused tests pass with `CI=1`, Xvfb, software WebGL, Chromium and Firefox: approved pixels/snapshots, missing-art startup, and independent same-seed world progress. Archive import also passed under software rendering.                                            |
| Full critical browser suite  | **150 passed** in 12.1 minutes across Chromium and Firefox, with no failures or skips. Covers all directions/combos/jump frames, blinking, world creation/switching/reload, five-biome exploration, signed-coordinate streaming, legacy saves, terrain, bridges and loot. |
| Documentation                | Changed prose formatted; relative links checked.                                                                                                                                                                                                                          |
| Archive preservation         | All **31,875** archived files rehashed against backup; zero changes.                                                                                                                                                                                                      |

The first critical-browser run exposed outdated test navigation to a removed root-menu import button. `biome-hills.spec.ts` now imports exploration archives through Developer, and `infinite-archive.spec.ts` uses the named-world library. All legacy terrain/edit and corrupt-archive assertions remain. The new same-seed isolation check asserts the persistent library identity; streamed checkpoint lineage IDs intentionally change on load because saves use copy-on-write forks.

Screenshots and recordings are under ignored `test-results/`, with command logs and historical evidence under `artifacts/canonical-recovery-20261109-120801/`. The world library and summit screenshots from all five biomes were visually inspected, alongside the approved character reference. Selected Chromium screenshots are also preserved under the backup directory’s `evidence/` folder. Browser appearance snapshots were first created only after native-pixel checks passed; subsequent hardware and software runs compare them without updating.

## Exact changed files

The workspace restoration itself is the fast-forward from `a5cd38b` to `046aa9e`; `git diff --name-status a5cd38b 046aa9e` lists all 1,950 affected paths. A local copy is `artifacts/canonical-recovery-20261109-120801/restored-paths.txt`. The complete approved-character path/hash inventory is the tracked `docs/assets/source/player-face-continuity/approval.json`.

The recovery branch adds or updates these files relative to `046aa9e`:

- Runtime: `src/rendering/TextureStore.ts`, `src/rendering/PlayerAssets.ts`.
- Tests: `tests/unit/rendering/PlayerAssets.test.ts`, `tests/e2e/player-appearance.spec.ts`, `tests/e2e/biome-hills.spec.ts`, `tests/e2e/infinite-archive.spec.ts`, `tests/e2e/world-library.spec.ts`.
- Visual evidence baselines: the 16 PNGs `tests/fixtures/player-appearance/{chromium,firefox}/{N,NE,E,SE,S,SW,W,NW}.png`.
- Commands/configuration: `package.json`, `playwright.config.ts`, `playwright.critical.config.ts`, `tsconfig.node.json`.
- PR/CI protection: `.github/workflows/gameplay.yml`, `.github/CODEOWNERS`, `.github/pull_request_template.md`.
- Protection scripts: `scripts/regression/approved-player.mjs`, `scripts/regression/critical-diff.mjs`, `scripts/regression/critical-diff.test.mjs`, `scripts/regression/critical-files.json`, `scripts/regression/prepare-merge-protection.mjs`.
- Maintained instructions/report: `AGENTS.md`, `docs/development/README.md`, `docs/testing.md`, `docs/development/safe-integration.md`, `docs/development/notes/2026-11-09-canonical-recovery.md`.

No unrelated assets or gameplay source files are removed. The root public README is unchanged. The branch is committed locally after validation; no PR is created and nothing is pushed. Hosted CI and mandatory merge enforcement remain pending publication and activation.
