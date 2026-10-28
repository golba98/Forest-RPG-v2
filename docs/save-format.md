# Save format

Settings use `forestrpg.v2.settings`; game slots use `forestrpg.v2.save.<slot>`, with `auto` as the default. V2 JSON contains world metadata and terrain, entities, the game clock, tutorial stage and selected deterministic runtime state. Export and import use the same JSON. Input is validated before replacing the active game, including size, terrain, entity identity and player stat bounds.

The legacy adapter accepts supported original `autosave_map` data, converts terrain, props and spawns, and preserves the original payload in `legacyExtras`. The first successful Continue of a legacy autosave writes a V2 autosave. Unsupported or corrupt data should be rejected rather than partially loaded.

Transient combat and pathfinding timers are not all serialized, so a reload does not promise frame-exact continuation of an ongoing fight. Browser storage can be cleared by the user or browser; export a save to retain a separate copy.
