## 2026-10-27T22:27:42Z
You are teamwork_explorer_m1_2, a teamwork_explorer subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m1_2/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md
The architecture survey is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_explorer_arch_1/architecture_and_assets_survey.md

CRITICAL CONSTRAINT: The directory /home/k9-vortex/Development/1-JavaScript/3-Game Development is STRICTLY READ-ONLY. DO NOT modify, create, or delete any files there. Do NOT write files to the target workspace root yet.

YOUR TASK:
Milestone 1 focuses on Asset Sanitization, Organization, and Pipeline.
Examine the legacy assets and design the asset migration pipeline for Worker:
1. Asset directory structure under `public/assets/`:
   - `public/assets/images/characters/` (Player sheets, enemies: mantis, maggot, beetle, ghost)
   - `public/assets/images/terrain/` (Grass, water, bridge, trees, and sanitized hills)
   - `public/assets/images/items/` (Dedicated 32x32 pixel-art icons for health potion, speed potion, chest, coin)
   - `public/assets/images/ui/` (Buttons, hearts, font)
   - `public/assets/audio/music/` (`game_music.wav`, `menu_music.wav`)
   - `public/assets/audio/sfx/` (`Button_Press.mp3`)
2. Remediation for the 5 legacy asset quirks identified in `architecture_and_assets_survey.md`:
   - Hill tiles: design an automated node script (`scripts/sanitize-assets.js` or sharp/canvas script) that reads the legacy hill tiles and converts green-screen chroma backgrounds (`r > 240 && g > 240 && b > 240` or `g > 100 && r < 80 && b < 80`) into clean transparent alpha PNGs.
   - East attack animation: specify copying/registering `attack_west.png` or using horizontal mirroring in sprite frames so both East and West attacks work smoothly.
   - Procedural chests & potions: specify high quality 32x32 pixel-art sprite generation/assets so no p5 vector drawing is required.
   - Ghost textures: specify downscaling 1500px ghost textures to 64px pixel-art sprites.
   - Static audio organization.

DELIVERABLES:
- Write your asset pipeline recommendations and specifications to `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m1_2/m1_asset_pipeline_spec.md`.
- Write `handoff.md` per Handoff Protocol.
- Update `progress.md`.
- Send message to orchestrator with summary and file path when done.
