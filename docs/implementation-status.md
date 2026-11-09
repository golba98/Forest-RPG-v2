# Implementation status

New Normal Adventure and Biome Walk worlds stream signed-coordinate chunks on
demand, with all five biomes in one continuous world. Developer → Biomes provides
five safe starting locations, biome switching in the same world, coordinates,
seed, return-to-spawn and menu controls. Adventure retains combat, finite starting
objectives and portal progression. Biome Walk has separate persistent saves.

Generation runs in a worker; local simulation windows, render residency and source
caches are bounded. IndexedDB stores sparse chunk modifications and player
checkpoints rather than a complete map. Older streamed versions remain pinned;
finite generator-13 saves keep their map, and older finite saves use the existing
preserved-region conversion. See [world generation](world-generation.md#streamed-worlds)
and [save format](save-format.md#streamed-worlds-schema-3).

The approved 56-sheet player and original LPC forest presentation are retained.
Each biome has curated trees and understory; the coordinated [asset inventory](assets/replacements.md#coordinated-biome-library)
contains actual art, including the unused source variations. Bridges and rocks
retain their existing artwork. The current [gallery](world-generation.md#current-streamed-gallery)
shows real gameplay, not separate showcase maps.

Generator 16 adds nested high ground to all five biomes, with up to three raised
terraces in suitable forest/autumn/highland regions and two in meadow/wetlands.
Height-aware cliff masks, validated stone-step approaches and same-level object
placement share the collision model. Jumps retain their timing and may cross one
tier. Five relief packs supply three material variants per cliff/stair orientation.
Biome Walk preserves older exploration saves separately. Climate fields remain
procedural geography rather than a drainage simulation; these are constrained
top-down terraces, without overhangs or free-form 3D slopes. Numeric travel supports signed coordinates up to
±2,147,482,623, reserving a margin for viewport and feature queries; it has no
predefined rectangular map extent. Water and cliff outlines retain tile resolution.

Automated coverage spans simulation, persistence, rendering and production browser flows. Use the commands in [testing](testing.md) to validate the current checkout; historical test counts and reports describe earlier commits and are not current guarantees.

Visual quality, balance, accessibility, localization completeness and extended device/performance acceptance still require review. See [performance](performance.md) for measured observations and their limitations, and [deployment](deployment.md) for static-host setup.
