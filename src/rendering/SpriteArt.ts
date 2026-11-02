import { Sprite, type Texture } from 'pixi.js';
import type { TileArtLayer } from './terrainArt';
import type { TextureStore } from './TextureStore';

export function tileArtTexture(layer: TileArtLayer, textures: TextureStore): Texture {
  const s = layer.source;
  return s.type === 'grid'
    ? textures.getGridFrame(layer.alias, s.col, s.row, s.cols, s.rows)
    : s.type === 'cell'
      ? textures.getFrame(layer.alias, s.frameX, s.frameY, s.frameW, s.frameH)
      : s.type === 'rect'
        ? textures.getRect(layer.alias, s.rect.x, s.rect.y, s.rect.w, s.rect.h)
        : textures.get(layer.alias);
}

/** Shared by descriptors and sprites so residency cannot change their transform. */
export function tileArtGeometry(layer: TileArtLayer, texture: Pick<Texture, 'width' | 'height'>) {
  const scale =
    layer.fit === 'fill'
      ? 1
      : Math.min(
          1,
          (32 * layer.maxWidthTiles) / texture.width,
          (32 * layer.maxHeightTiles) / texture.height,
        );
  const width = layer.fit === 'fill' ? 32 : texture.width * scale;
  const height = layer.fit === 'fill' ? 32 : texture.height * scale;
  const x = (32 - width) / 2 + layer.offsetX;
  const y = (layer.align === 'bottom' ? 32 - height : (32 - height) / 2) + layer.offsetY;
  return {
    x: Math.round(Math.min(Math.max(x, 0), 32 - width)),
    y: Math.round(Math.min(Math.max(y, Math.min(0, 32 - height)), 32 - height)),
    width,
    height,
  };
}

export function createTileSprite(layer: TileArtLayer, textures: TextureStore): Sprite {
  const texture = tileArtTexture(layer, textures);
  const geometry = tileArtGeometry(layer, texture);
  const sprite = new Sprite(texture);
  sprite.tint = layer.tint;
  sprite.position.set(geometry.x, geometry.y);
  sprite.width = geometry.width;
  sprite.height = geometry.height;
  return sprite;
}
