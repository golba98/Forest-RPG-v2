import { Texture } from 'pixi.js';
import { BRIDGE_DECK_INSET, BRIDGE_RAIL_OUTSET, BRIDGE_TILE_PX } from '../world/BridgeGeometry';

type Orientation = 'horizontal' | 'vertical';
export type BridgeSection = 'start' | 'middle' | 'end';
const S = BRIDGE_TILE_PX;
const INSET = BRIDGE_DECK_INSET * S;
const EDGE = BRIDGE_RAIL_OUTSET * S;
export const BRIDGE_PALETTE = {
  outline: 0x352e26,
  beam: 0x514030,
  dark: 0x66503a,
  wood: 0x92704e,
  light: 0xb18d60,
  worn: 0x9d805b,
  grain: 0x795b40,
  nail: 0x494844,
  rope: 0xafa17a,
  moss: 0x596b3b,
  mossLight: 0x7a8547,
  dirt: 0x7b7048,
} as const;
export const bridgeAlias = (
  orientation: Orientation,
  section: BridgeSection,
  variant: number,
): string => `bridge_${orientation}_${section}_${variant}`;
export const bridgeRailAlias = (orientation: Orientation, section: BridgeSection): string =>
  `bridge_rail_${orientation}_${section}`;
export const bridgeShadowAlias = (orientation: Orientation): string =>
  `bridge_shadow_${orientation}`;
export const bridgeLandingAlias = (orientation: Orientation): string =>
  `bridge_landing_${orientation}`;

type Pixel = (x: number, y: number, color: number, alpha?: number) => void;
function texture(width: number, height: number, draw: (px: Pixel) => void): Texture {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (ctx)
    draw((x, y, color, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    });
  const out = Texture.from(el);
  out.source.scaleMode = 'nearest';
  return out;
}
function hash(a: number, b: number): number {
  let h = Math.imul(a + 17, 0x45d9f3b) ^ Math.imul(b + 47, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function deck(orientation: Orientation, section: BridgeSection, variant: number): Texture {
  const horizontal = orientation === 'horizontal',
    P = BRIDGE_PALETTE;
  return texture(horizontal ? S : S * 2, horizontal ? S * 2 : S, (px) => {
    const put = (a: number, b: number, c: number, alpha = 1) =>
      horizontal ? px(a, b, c, alpha) : px(b, a, c, alpha);
    // Broken, compacted earth on the bank. Transparent fringes retain the grass beneath.
    if (section !== 'middle') {
      for (let a = 0; a < S; a++)
        for (let b = 0; b < S * 2; b++)
          if ((b < INSET || b >= S * 2 - INSET) && hash(a + variant * S, b) % 5 < 3)
            put(a, b, P.dirt, 0.45);
    }
    for (let a = 0; a < S; a++)
      for (let b = EDGE; b < S * 2 - EDGE; b++) {
        const beam = b < INSET || b >= S * 2 - INSET;
        if (beam) {
          // North/west face receives light in both orientations; no rotated lighting.
          put(a, b, b === EDGE ? P.worn : b >= S * 2 - INSET ? P.outline : P.beam);
          continue;
        }
        const plank = Math.floor(a / 8),
          local = a % 8,
          h = hash(plank + variant * 4, 9);
        const base = [P.wood, P.worn, P.wood, P.light][h % 4] ?? P.wood;
        let color: number = base;
        if (local === 7) color = P.outline;
        else if (local === 6) color = P.dark;
        else if (local === 0) color = P.light;
        else if (b === INSET) color = horizontal ? P.light : P.worn;
        else if (b === S * 2 - INSET - 1) color = P.dark;
        else if (hash(Math.floor(b / 5) + variant, plank) % 4 === 0 && local === 3) color = P.grain;
        put(a, b, color);
        // Restrained nail heads just inside the beams.
        if ((b === INSET + 3 || b === S * 2 - INSET - 4) && local === 2) {
          put(a, b, P.nail);
          put(a, b - 1, P.worn);
        }
        if ((b < INSET + 3 || b > S * 2 - INSET - 4) && hash(a + variant * 11, b) % 13 === 0)
          put(a, b, b % 2 ? P.moss : P.mossLight);
      }
    // Heavy bank sill runs across the end; middle pieces remain uninterrupted.
    if (section !== 'middle') {
      const end = section === 'start' ? 0 : S - 4;
      for (let a = end; a < end + 4; a++)
        for (let b = EDGE; b < S * 2 - EDGE; b++)
          put(a, b, a === end ? P.light : a === end + 3 ? P.outline : P.beam);
    }
  });
}

function rail(orientation: Orientation, section: BridgeSection): Texture {
  const P = BRIDGE_PALETTE;
  const start = section === 'start' ? 16 : 0,
    end = section === 'end' ? 16 : S - 1;
  if (orientation === 'horizontal')
    return texture(S, 20, (px) => {
      for (let x = start; x <= end; x++) {
        const y = 8 + Math.round(2 * Math.sin((Math.PI * ((x + 16) % S)) / S));
        px(x, y + 1, P.beam);
        px(x, y, P.rope);
      }
      // Post base at (16, 16); texture lifts the rail above its ground collider.
      for (let y = 3; y <= 16; y++)
        for (let x = 14; x <= 18; x++)
          px(x, y, x === 14 ? P.light : x === 18 || y === 16 ? P.outline : P.beam);
      for (let x = 14; x <= 18; x++) px(x, 2, P.worn);
      px(15, 4, P.light);
      px(15, 14, P.moss);
    });
  return texture(12, 44, (px) => {
    for (let a = start; a <= end; a++) {
      const x = 4 + Math.round(1.5 * Math.sin((Math.PI * ((a + 16) % S)) / S));
      px(x + 1, a + 5, P.beam);
      px(x, a + 4, P.rope);
    }
    // World-ground post is at y=16. Its drawn top is twelve pixels higher.
    for (let y = 4; y <= 16; y++)
      for (let x = 2; x <= 6; x++)
        px(x, y + 12, x === 2 ? P.light : x === 6 || y === 16 ? P.outline : P.beam);
    for (let x = 1; x <= 7; x++) {
      px(x, 14, P.light);
      px(x, 15, P.worn);
    }
    px(3, 17, P.light);
    px(3, 26, P.moss);
  });
}

/** Native-resolution code-drawn art, owned by TextureStore like the existing water textures. */
export function createBridgeTextures(): Map<string, Texture> {
  const out = new Map<string, Texture>();
  for (const orientation of ['horizontal', 'vertical'] as const) {
    const horizontal = orientation === 'horizontal';
    out.set(
      bridgeLandingAlias(orientation),
      texture(horizontal ? S : S * 2, horizontal ? S * 2 : S, (px) => {
        for (let a = 0; a < S; a++)
          for (let b = 3; b < S * 2 - 3; b++) {
            const edge = ((a - 16) / 16) ** 2 + ((b - 32) / 29) ** 2;
            const h = hash(a, b);
            if (edge > 1 || h % 7 === 0 || (edge > 0.65 && h % 3 !== 0)) continue;
            const color = h % 5 === 0 ? BRIDGE_PALETTE.worn : BRIDGE_PALETTE.dirt;
            if (horizontal) px(a, b, color, 0.35);
            else px(b, a, color, 0.35);
          }
      }),
    );
    for (const section of ['start', 'middle', 'end'] as const) {
      for (let variant = 0; variant < 4; variant++)
        out.set(bridgeAlias(orientation, section, variant), deck(orientation, section, variant));
      out.set(bridgeRailAlias(orientation, section), rail(orientation, section));
    }
    out.set(
      bridgeShadowAlias(orientation),
      texture(horizontal ? S : S * 2, horizontal ? S * 2 : S, (px) => {
        for (let a = 0; a < S; a++)
          for (let b = EDGE; b < S * 2 - EDGE; b++) {
            const alpha = b < INSET || b >= S * 2 - INSET ? 0.12 : 0.27;
            if (horizontal) px(a, b, 0x152f30, alpha);
            else px(b, a, 0x152f30, alpha);
          }
      }),
    );
  }
  return out;
}
