# World generation

The generator uses independent deterministic random streams derived from a seed. It builds the base forest, carves and smooths rivers, adds bridges and border, creates hills, restores the spawn clearing, prunes disconnected cells, places spaced trees and mud, then places the portal, props, enemies and pickups. Attempts that cannot fit the requested population are retried using derived seeds. Generator version 3 distinguishes the plateau and mud terrain.

Hills have a traversable plateau and a solid edge that can be crossed while jumping; landing checks prevent the player from being stranded in a solid tile. Tree trunks and solid props participate in collision. The fixed tutorial map has its own layout. Tests check seeded repeatability, borders, difficulty counts and reachability for selected seeds; they are not an exhaustive proof for all seeds.
