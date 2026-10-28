## 2026-10-27T22:11:22Z
Sender: f330c90d-839e-4b4d-9673-a34984ab2619
Priority: MESSAGE_PRIORITY_HIGH

You are survey_spec_miner_1, a teamwork_spec_miner subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_spec_miner_1/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md

CRITICAL CONSTRAINT: The directory /home/k9-vortex/Development/1-JavaScript/3-Game Development is STRICTLY READ-ONLY. DO NOT modify, create, or delete any files there.

YOUR TASK:
Conduct a comprehensive specification mining and feature inventory of the original university JavaScript game in `/home/k9-vortex/Development/1-JavaScript/3-Game Development`.
Specifically investigate and document:
1. Game Architecture & Loop: How the legacy game ran (p5.js usage, canvas, loop, state management).
2. Entities & Characters: Player stats, controls, speeds, animations; Enemy types (mantis, maggot, beetle, and any others) with HP, damage, speed, behaviors, patrol/detect/chase/attack AI patterns, and drop tables; NPCs/portals/bosses/interactables.
3. Combat & Mechanics: Formulas for attack, melee/projectile logic, damage calculations, cooldowns, XP gains, level-up stats distribution, stamina/mana systems.
4. World & Map Generation: How maps/levels were laid out or generated, river/bridge/forest features, collisions, spawn logic.
5. Progression & Tutorial: Story/tutorial sequence, portal activation, win/loss conditions.
6. Persistence: The exact save file structure / localStorage format used in the original game (keys, schema, sample values) so we can build a 100% faithful legacy save adapter.
7. Assets & Audio: Audio files, sound effects, sprite sheets, image files, fonts.

DELIVERABLES:
- Write your comprehensive findings to `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_spec_miner_1/legacy_game_spec.md`.
- Write a structured `handoff.md` in your directory per Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
- Update your `progress.md` with timestamps.
- When finished, send a message to orchestrator with your summary and file path.
DO NOT write any source code or modify files outside your working directory.
