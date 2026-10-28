import { Container, Sprite } from 'pixi.js';
import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import type { WorldBridge } from '../types/world';
import { BRIDGE_TILE_PX, bridgeGeometry } from '../world/BridgeGeometry';
import {
  bridgeAlias,
  bridgeLandingAlias,
  bridgeRailAlias,
  bridgeShadowAlias,
  type BridgeSection,
} from './bridgeArt';
import type { TextureStore } from './TextureStore';

/** Flat structure and individually sorted rail pieces share the simulation's geometry. */
export function createBridgeView(
  bridge: WorldBridge,
  textures: TextureStore,
): { ground: Container; rails: Sprite[] } {
  const ground = new Container(),
    rails: Sprite[] = [],
    S = BRIDGE_TILE_PX;
  const horizontal = bridge.orientation === 'horizontal';
  const geometry = bridgeGeometry(bridge);
  const length = bridge.span + 2;
  for (const along of [-0.5, length - 0.5]) {
    const landing = new Sprite(textures.get(bridgeLandingAlias(bridge.orientation)));
    landing.position.set(
      (bridge.x + (horizontal ? along : 0)) * S,
      (bridge.y + (horizontal ? 0 : along)) * S,
    );
    ground.addChild(landing);
  }
  // All shadows precede all planks, avoiding shadows painted across section joins.
  for (let i = 0; i < length; i++) {
    const shadow = new Sprite(textures.get(bridgeShadowAlias(bridge.orientation)));
    shadow.position.set(
      (bridge.x + (horizontal ? i : 0)) * S + 3,
      (bridge.y + (horizontal ? 0 : i)) * S + 4,
    );
    ground.addChild(shadow);
  }
  for (let i = 0; i < length; i++) {
    const section: BridgeSection = i === 0 ? 'start' : i === length - 1 ? 'end' : 'middle';
    const variant = (bridge.variant + i * 3) % 4;
    const deck = new Sprite(textures.get(bridgeAlias(bridge.orientation, section, variant)));
    deck.position.set((bridge.x + (horizontal ? i : 0)) * S, (bridge.y + (horizontal ? 0 : i)) * S);
    ground.addChild(deck);
    for (const rail of geometry.rails) {
      const sprite = new Sprite(textures.get(bridgeRailAlias(bridge.orientation, section)));
      const cross = horizontal ? (rail.minY + rail.maxY) / 2 : (rail.minX + rail.maxX) / 2;
      const along = (horizontal ? bridge.x : bridge.y) + i;
      if (horizontal) sprite.position.set(along * S, Math.round(cross * S) - 16);
      else sprite.position.set(Math.round(cross * S) - 4, along * S - 12);
      // Actors sort by their pre-foot-offset anchor, including when airborne.
      const groundY = horizontal ? Math.round(cross * S) : (along + 0.5) * S;
      sprite.zIndex = groundY - CHARACTER_FOOT_OFFSET_PX;
      rails.push(sprite);
    }
  }
  return { ground, rails };
}
