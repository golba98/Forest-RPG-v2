# Dispatch: teamwork_explorer_m2_iter2_3

## Task Objective
Investigate and design exact fix blueprints for Milestone 2 Iteration 2:
1. **SpatialHashGrid Entity Reference Updates & Ghost Leaks**:
   - Location: `src/core/spatial/SpatialHashGrid.ts:49-75` and `lines 246-259` (`_removeFromCells`)
   - Problem: In `SpatialHashGrid.update(entity)`, `this._entities.set(id, entity)` is never called. Moreover, `_removeFromCells` calls `cell.delete(entity)` using object reference equality. When an entity with the same `id` but a newly instantiated object reference is updated, `cell.delete` fails to remove the old reference from the old cells, leaving ghost entities and creating memory leaks.
   - Goal: Design the exact mechanism ensuring:
     - `this._entities.set(id, entity)` is always updated.
     - `_removeFromCells` retrieves the previous entity instance associated with `id` from `this._entities` and removes that previous instance from old cells.
     - Design unit tests in `tests/unit/core/SpatialHashGrid.test.ts` verifying that updating with a new object reference removes the old instance and leaves no ghost entities.
2. **ServiceContainer Hierarchical Parent Singleton Isolation**:
   - Location: `src/core/di/ServiceContainer.ts:83-91`
   - Problem: When `child.resolve(parentToken)` is called for an uninitialized parent singleton, `descriptor.factory(this)` runs with `this = child`. If the parent singleton depends on a token overridden in the child, the child override is resolved and the tainted instance is cached onto the parent descriptor (`descriptor.instance = createdInstance`), polluting the parent container.
   - Goal: Design the exact resolution mechanism so that parent singletons are resolved using the parent container context (or declaring container context) rather than the child container, preventing child override pollution of parent singletons.
   - Design unit tests in `tests/unit/core/ServiceContainer.test.ts` verifying that child overrides do not pollute parent singletons.

## Deliverables
Write your full 5-section report and TypeScript blueprints to:
`/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_3/m2_spatial_di_fix_spec.md`
and `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_3/handoff.md`.
