# Gameplay systems

Movement is continuous and normalized in eight directions, with axis-separated collision, sprint stamina, jump and dash. Water and mud affect movement. The day cycle drives darkness and night ghosts.

Melee has a three-hit combo and a stronger third hit. Spin and bolts consume mana. Attacks cause feedback, damage and knockback; regular enemies can be crushed against obstacles. Mantis, ranged maggot, beetle boss and ghost have distinct behavior. Defeated enemies award XP and can drop potions. Stat points increase health, damage, mana or stamina.

The portal opens when coins are collected and non-ghost enemies have been defeated. The tutorial portal starts the first regular world; subsequent portals advance the world while retaining player progression and inventory. Potions and settings persist in saves. The debug terminal supports inspection and controlled testing commands; type `/help` in the terminal for its command list.

The combat and AI implementation is not a claim of complete behavioral parity with the original: timings, effects and edge cases still need full gameplay review.
