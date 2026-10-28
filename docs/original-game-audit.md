# Original game audit

The original project is the reference for assets, controls, generation, gameplay and migration. V2 preserves its tile identity and uses its map and settings fixtures in adapter tests. The original project is read-only: do not install dependencies, build, or modify it as part of V2 development.

V2 intentionally uses continuous eight-direction movement instead of tile hops. In the original input ordering E was consumed by melee before the bolt could fire, so V2 places the bolt on R. World generation retains the original stages but spaces tree trunks for traversal and adds plateau and mud tiles. These decisions mean identical seeds do not promise identical maps across engines.
