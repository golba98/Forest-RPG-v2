# Natural ledge contact and bottom HUD

Implemented on `codex/ledge-bottom-hud`, based on integrated commit `dd039ba`, in the sibling `18-Forest RPG v2-ledge-hud` worktree. the renderer's active changes in the primary workspace were left intact. No original university files were changed, and no merge, push or deployment was performed.

## Behavior

Walking now reaches the upper surface of a cliff-rim tile instead of stopping outside the entire tile. Collision follows the actual exposed lip and south face, including rounded outer and concave inner corners. Holding movement into the drop stops; tangential movement slides. There is no grounded pushback or teleport correction. Stairs and jumping retain deliberate traversal; ghosts retain phasing.

Player ground contact is a stable 0.44 × 0.20 tile foot rectangle aligned with the existing character ground-anchor metadata. Combat half-size is preserved. Occupancy, swept movement, landing, save restoration and debug bounds use the same footprint. Other entities retain their existing square shapes. Ground navigation consumes the same cliff geometry through clearance queries. Rim metadata identifies available upper standing surface rather than declaring the whole cell an impassable wall.

The HUD is centred above the bottom safe area: hearts left (ten per row, up to twenty), stamina right, mana below hearts, two potion readouts with existing 1/2 controls, level/coins beside the slots, and XP bar/figures underneath. Existing artwork is reused. Layout respects UI scale, uses a compact arrangement below 600px width, and accounts for asymmetric safe-area insets. The minimap and camera behavior are preserved.

See [the shared integration contract](ledge-hud-contract.md) for the renderer's renderer integration points. PixiRenderer changes are limited to HUD construction, layout and debug bounds; its visual systems were not rewritten.

## Verification

| Check | Result |
| --- | --- |
| TypeScript strict typecheck | PASS |
| ESLint | PASS, no warnings |
| Unit/integration tests | **320 passed**, 37 files |
| Targeted browser suite | **20 passed**, 0 failed, 0 skipped, Firefox and Chromium |
| Production build | PASS, existing Pixi chunk-size advisory remains |
| Diff whitespace checks | PASS |

Unit regressions include the four rim directions at 30/60/144 Hz, sustained contact, released-input stability, sprint sliding, frame spikes, corners, stairs, jumping, all 256 hill adjacency masks, and save/load at the lip. Existing arbitrary-angle collision and 100-seed generation regressions also pass. HUD layout checks cover 320×568, 1280×720, 1920×1080 and 3440×1440 at UI scales 0.8/1/1.2, plus asymmetric safe areas.

Browser command:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4182 npx playwright test \
  tests/e2e/ledge-hud.spec.ts tests/e2e/terrain-effects.spec.ts \
  tests/e2e/portal-flow.spec.ts tests/e2e/generated-world.spec.ts \
  tests/e2e/visual-rendering.spec.ts --workers=1
```

Browser fixtures are imported through the real save interface; movement uses actual keyboard input. The initial Chromium run exposed a fixture-focus race: the fading pause-menu button lost focus after the first keydown, clearing held input as designed. Settling focus on the game canvas before input fixed the test setup. No production input behavior was changed.

The full historical browser suite was not rerun for this focused follow-up; its previously documented failures are not claimed resolved. Validation used headless browsers and visual inspection of saved captures, not human headed playtesting. Original recordings and the user's reference screenshot were not overwritten.

## Review artifacts

- [Standing at the lip](ledge-hud-evidence/standing-at-lip.png)
- [Successful ledge movement recording](ledge-hud-evidence/ledge-contact.webm) — 2.56 seconds, VP9, 800×450
- [320×568](ledge-hud-evidence/hud-320x568.png)
- [1280×720](ledge-hud-evidence/hud-1280x720.png)
- [1920×1080](ledge-hud-evidence/hud-1920x1080.png)
- [3440×1440](ledge-hud-evidence/hud-3440x1440.png)
- [Browser result summary](ledge-hud-evidence/browser-summary.json)

All captures were inspected. To preview, run `npm run dev` from this worktree; production preview used `npm run preview -- --port 4182`.


## Main-project integration

The ledge and HUD fixes are now applied in the normal working project, `18-Forest RPG v2`, on `feat/forest-rpg-v2-foundation`. The original active renderer, minimap, effects, combat, and menu changes were preserved; only the HUD integration hooks were combined into the existing renderer. `npm run dev` in the normal folder serves the updated game.

Verified the user's running development server at **http://localhost:3000**. Integrated validation: strict typecheck and lint pass, **332 unit/integration tests pass**, production build passes, and **10 browser cases pass** across Firefox and Chromium (ledge/HUD, terrain traversal and portal progression). The HUD reports a bottom-centred screen-space rectangle and the simulation exposes the new physical foot rectangle. [Main-folder dev server capture](ledge-hud-evidence/main-folder-dev-server.png).
