import { Container, Sprite, type Texture } from 'pixi.js';
import type { WorldBridge, WorldData } from '../types/world';
import { bridgeGeometry } from '../world/BridgeGeometry';
import { propDepth } from '../world/ObjectSemantics';
import { createBridgeView } from './BridgeView';
import { decorAlias, GROUND_PROPS } from './assetCatalog';
import type { WorldRect } from './chunkMath';
import { planForestTrees } from './forestTrees';
import { ResidencyCache } from './ResidencyCache';
import { tileArtGeometry, tileArtTexture } from './SpriteArt';
import { getWorldPropArt } from './terrainArt';
import type { TextureStore } from './TextureStore';
import { VEGETATION, vegetationFor, type VegetationFrame } from './vegetationArt';
import {
  expandRect,
  intersects,
  WorldBoundsIndex,
  type VisibilityRegions,
} from './WorldVisibility';

interface ObjectRecord {
  readonly key: string;
  readonly bounds: Readonly<WorldRect>;
  readonly order: number;
  readonly depth: number;
  readonly layer: string;
  readonly assetId: string;
  readonly texture?: Texture;
  readonly tint?: number;
  readonly propId?: import('../types/world').WorldObjectId;
  readonly hilltop?: boolean;
  readonly canopy?: boolean;
  readonly bridge?: WorldBridge;
}
interface ObjectView {
  readonly record: ObjectRecord;
  readonly sprites: Sprite[];
  readonly bounds: readonly Readonly<WorldRect>[];
  readonly ground?: Container;
}

/** Equal-depth reinsertion uses catalog order, independent of chunk visitation. */
export class WorldDepthLayer extends Container {
  readonly order = new WeakMap<Container, number>();
  override sortChildren = (): void => {
    if (!this.sortDirty) return;
    this.sortDirty = false;
    this.children.sort(
      (a, b) =>
        a.zIndex - b.zIndex ||
        (this.order.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (this.order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  };
}

/** Disposable views over existing placements. Removing a view never removes its record. */
export class WorldObjects {
  readonly catalog = new WorldBoundsIndex<ObjectRecord>();
  private readonly residents = new ResidencyCache<ObjectView>((view) => {
    for (const sprite of view.sprites) sprite.destroy();
    view.ground?.destroy({ children: true });
  });
  private readonly candidates = new Set<ObjectRecord>();
  private required = new Set<string>();
  private previousRequired = new Set<string>();
  private order = 0;

  constructor(
    private readonly textures: TextureStore,
    private readonly actors: WorldDepthLayer,
    private readonly ground: Container,
    private readonly bridges: Container,
    private readonly tag: (sprite: Sprite, asset: string, layer: string) => Sprite,
    private readonly warm: (texture: Texture) => void = () => {},
  ) {}

  setWorld(world: WorldData): void {
    this.clear();
    for (const bridge of world.bridges ?? []) {
      const b = bridgeGeometry(bridge).footprint;
      const bounds = expandRect(
        {
          x: b.minX * 32,
          y: b.minY * 32,
          width: (b.maxX - b.minX) * 32,
          height: (b.maxY - b.minY) * 32,
        },
        64,
      );
      this.catalog.add({
        key: `bridge:${bridge.id}`,
        bounds,
        bridge,
        order: this.order++,
        depth: 0,
        assetId: 'procedural:bridge-rail',
        layer: 'actors/bridge',
      });
    }
    for (const tree of planForestTrees(world)) {
      this.vegetation(
        `forest:${tree.x},${tree.y}`,
        tree.x,
        tree.y,
        (tree.y + 1) * 32,
        VEGETATION.compact,
        'actors/forest',
      );
    }
    for (const prop of world.props) {
      const key = `prop:${prop.id}`,
        depth = propDepth(prop) * 32;
      const layer = GROUND_PROPS.has(prop.kind) ? 'ground/prop' : 'actors/prop';
      const vegetation = vegetationFor(prop, world);
      if (vegetation)
        this.vegetation(
          key,
          prop.tileX,
          prop.tileY,
          depth,
          vegetation,
          layer,
          prop.id,
          prop.kind === 'tree',
        );
      else {
        const art = getWorldPropArt(prop),
          texture = tileArtTexture(art, this.textures);
        const geometry = tileArtGeometry(art, texture);
        this.catalog.add({
          key,
          bounds: { ...geometry, x: geometry.x + prop.tileX * 32, y: geometry.y + prop.tileY * 32 },
          order: this.order++,
          texture,
          tint: art.tint,
          depth,
          assetId: decorAlias(prop.kind),
          layer,
          propId: prop.id,
          hilltop: !!prop.hilltop,
        });
      }
    }
  }

  private vegetation(
    key: string,
    x: number,
    y: number,
    depth: number,
    frame: VegetationFrame,
    layer: string,
    propId?: import('../types/world').WorldObjectId,
    canopy = false,
  ): void {
    const r = frame.rect;
    this.catalog.add({
      key,
      order: this.order++,
      depth,
      layer,
      assetId: frame.atlas,
      canopy,
      bounds: {
        x: x * 32 + 16 - frame.root[0],
        y: y * 32 + 32 - frame.root[1],
        width: r.w,
        height: r.h,
      },
      texture: this.textures.getRect(frame.atlas, r.x, r.y, r.w, r.h),
      ...(propId === undefined ? {} : { propId }),
    });
  }

  update(regions: VisibilityRegions, now: number, player?: { x: number; y: number }): void {
    const last = this.previousRequired;
    this.previousRequired = this.required;
    this.required = last;
    this.required.clear();
    for (const record of this.catalog.query(regions.preparation, this.candidates)) {
      this.required.add(record.key);
      if (!this.residents.entries.has(record.key)) this.create(record, now);
      if (!this.previousRequired.has(record.key)) {
        const view = this.residents.entries.get(record.key)?.value;
        for (const sprite of view?.sprites ?? []) this.warm(sprite.texture);
        for (const child of view?.ground?.children ?? [])
          if (child instanceof Sprite) this.warm(child.texture);
      }
    }
    // The number of lightweight views is bounded by the retention region and grace period.
    // Under dense scenes, retain at most one additional preparation set (with a 512-view floor).
    this.residents.prune(
      this.required,
      regions.retention,
      now,
      Math.max(512, this.required.size * 2),
    );
    for (const { value: view } of this.residents.entries.values()) {
      if (view.ground) view.ground.visible = intersects(view.record.bounds, regions.visible);
      for (const [i, sprite] of view.sprites.entries()) {
        sprite.visible = intersects(view.bounds[i] ?? view.record.bounds, regions.visible);
        const b = view.record.bounds;
        sprite.alpha =
          view.record.canopy &&
          player &&
          player.x > b.x - 8 &&
          player.x < b.x + b.width + 8 &&
          player.y > b.y &&
          player.y < view.record.depth - 12
            ? 0.45
            : 1;
      }
    }
  }

  private create(record: ObjectRecord, now: number): void {
    let view: ObjectView;
    if (record.bridge) {
      const bridge = createBridgeView(record.bridge, this.textures);
      this.bridges.addChild(bridge.ground);
      for (const [i, rail] of bridge.rails.entries()) {
        this.tag(rail, record.assetId, record.layer);
        this.actors.order.set(rail, record.order + i / 100);
        this.actors.addChild(rail);
      }
      view = {
        record,
        sprites: bridge.rails,
        ground: bridge.ground,
        bounds: bridge.rails.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
      };
    } else {
      const sprite = this.tag(new Sprite(record.texture), record.assetId, record.layer);
      sprite.position.set(record.bounds.x, record.bounds.y);
      sprite.width = record.bounds.width;
      sprite.height = record.bounds.height;
      sprite.tint = record.tint ?? 0xffffff;
      sprite.zIndex = record.depth;
      this.actors.order.set(sprite, record.order);
      (record.layer === 'ground/prop' ? this.ground : this.actors).addChild(sprite);
      view = { record, sprites: [sprite], bounds: [record.bounds] };
    }
    this.residents.set(record.key, view, record.bounds, 1, now);
    // Ground details retain the saved catalog order after arbitrary eviction/recreation.
    this.ground.children.sort(
      (a, b) => (this.actors.order.get(a) ?? 0) - (this.actors.order.get(b) ?? 0),
    );
  }

  removeProp(id: import('../types/world').WorldObjectId): void {
    const key = `prop:${id}`;
    this.catalog.remove(key);
    this.residents.delete(key);
  }

  get info() {
    let propViews = 0,
      forestTrees = 0,
      bridgeRailSprites = 0;
    for (const { value } of this.residents.entries.values()) {
      if (value.record.propId !== undefined) propViews++;
      if (value.record.layer === 'actors/forest') forestTrees++;
      if (value.record.bridge) bridgeRailSprites += value.sprites.length;
    }
    return {
      propViews,
      forestTrees,
      bridgeRailSprites,
      residentObjects: this.residents.entries.size,
      worldObjects: this.catalog.records.size,
    };
  }

  /** Diagnostic snapshots are built only on request, never in the render hot path. */
  get debugRecords() {
    return [...this.catalog.records.values()].map((r) => ({
      key: r.key,
      ...(r.propId === undefined ? {} : { id: r.propId }),
      hilltop: !!r.hilltop,
      x: r.bounds.x,
      y: r.bounds.y,
      width: r.bounds.width,
      height: r.bounds.height,
      depth: r.depth,
      assetId: r.assetId,
      resident: this.residents.entries.has(r.key),
      visible: this.residents.entries.get(r.key)?.value.sprites.some((s) => s.visible) ?? false,
    }));
  }

  clear(): void {
    this.residents.clear();
    this.catalog.clear();
    this.candidates.clear();
    this.required.clear();
    this.previousRequired.clear();
    this.order = 0;
  }
}
