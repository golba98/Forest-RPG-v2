# Approved player character

**Accepted by the user on November 3, 2026. Preserve this exact version.**

The active game uses these source frames and the 56 strips in `public/assets/images/characters/player/`. `approval.json` records SHA-256 checksums for the 912 frame slots, eight reference heads, exported strips, native definitions and animation implementation. The approved artwork and runtime remain outside Git ignore rules. Nothing about the character's pixels, palette, body structure, blinking or motion changed when it was saved and archived.

Each direction retains the exact first-idle head and open eyes at native integer offsets. Opaque eyelid patches animate independently of the body. Idle has one-pixel breathing; locomotion and combat preserve the accepted poses and fist occlusion. Frame counts remain 12 idle, 16 walk, 16 run, 16 jump and 18 per punch, in eight directions. Cells are 64×64 with foot reference (32,54).

`frames/` contains the approved native PNGs. `templates/` holds the eight heads. `face.json` contains pose offsets, fist overlays and eyelid patches. `native-pixels.json` is the lossless indexed representation. `manifest.json` retains pose hashes and the original correction record; `sheet-hashes.json` locks the 56 exports.

The blink sequence is open → partially closed (40 ms) → closed (60 ms) → partially open (60 ms) → open. A separate seeded cosmetic clock varies open intervals between 2.8 and 5.2 seconds. Pause, displayed impact holds and death freeze it; session replacement resets it. Action transitions preserve the fixed head and unblinked history. Gameplay dimensions, facing locks and combat timing are unchanged.

To restore/export the approved artwork losslessly:

```sh
node scripts/player-art/face-continuity/pack.mjs
```

The exporter checks all source hashes and every proposed output against `approval.json` before writing. It never silently updates the approval record. It needs no historical assets or archive folder.

Earlier character versions, draft generators, superseded tests, comparison tools and recordings are preserved locally under `archive/player-character/`, using their former repository-relative layout. That entire archive is explicitly Git-ignored and excluded from lint/formatting. It is not required to build, test or run the approved game. Old generators must not be run over the approved exports.

A separate recovery bundle and checksum are saved locally in `artifacts/player-approved/`. It contains the approved artwork, definitions and animation implementation. Those generated backup artifacts are ignored; the active source files remain available for normal version control. No commit or push was performed as part of saving this approval.

[Provenance](provenance.json) retains the original project identity references, inherited rights, image-generation prompts and source hashes. No new artwork or external character asset was introduced by saving this version. Historical source images themselves are in the ignored archive.

Start `npx vite --config scripts/player-study/recovery.vite.mjs` and open <http://localhost:4330/> for the approved character, with normal/quarter speed, pause, frame stepping, **Blink now**, all directions and playable actions. This viewer uses the same assets and presentation code as the game and does not depend on archived alternatives.
