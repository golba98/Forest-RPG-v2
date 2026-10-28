import { Assets, Rectangle, Texture, TextureSource } from 'pixi.js';
import {
  MANIFEST_BUNDLES,
  MANIFEST_URL,
  RENDERER_EXTRA_BUNDLE,
  rendererExtraAssets,
} from './assetCatalog';

export interface TextureStoreOptions {
  readonly manifestUrl?: string;
  readonly bundles?: readonly string[];
}

/** Size of the generated missing-art checker. */
const PLACEHOLDER_PX = 16;

// Assets is a process-wide singleton and may only be initialised once.
let assetsInitPromise: Promise<void> | null = null;

/**
 * Texture lookup with graceful fallbacks.
 *
 * Missing assets resolve to one shared magenta/black checker (warned once per
 * alias) so a missing image never crashes the game and is never mistaken for
 * real art (a plain white fallback looked like floating white artifacts). Sub-textures are cached
 * per (alias, frame) and share the parent's TextureSource.
 */
export class TextureStore {
  private readonly manifestUrl: string;
  private readonly bundles: readonly string[];

  private readonly cellFrames = new Map<string, Map<number, Texture>>();
  private readonly gridFrames = new Map<string, Map<number, Texture>>();
  private readonly rectFrames = new Map<string, Map<number, Texture>>();
  private readonly warned = new Set<string>();
  /** Sub-textures created here (they share, and must not destroy, the asset source). */
  private readonly owned = new Set<Texture>();
  private placeholder: Texture | null = null;
  private loaded = false;

  constructor(options: TextureStoreOptions = {}) {
    this.manifestUrl = options.manifestUrl ?? MANIFEST_URL;
    this.bundles = options.bundles ?? MANIFEST_BUNDLES;
    // Pixel art: every texture created from here on samples nearest-neighbour.
    TextureSource.defaultOptions.scaleMode = 'nearest';
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  /** Initialises Assets with the manifest and loads all renderer bundles. */
  public async load(onProgress?: (progress: number) => void): Promise<void> {
    try {
      await this.initAssets();
      this.registerExtras();
      const bundles = this.bundles.filter((name) => Assets.resolver.hasBundle(name));
      for (const name of this.bundles) {
        if (!bundles.includes(name)) this.warnOnce(`bundle:${name}`, `[TextureStore] bundle "${name}" not in manifest`);
      }
      if (Assets.resolver.hasBundle(RENDERER_EXTRA_BUNDLE)) bundles.push(RENDERER_EXTRA_BUNDLE);
      await Assets.loadBundle(bundles, onProgress);
    } catch (error) {
      // Degrade to placeholders rather than blocking the game on asset errors.
      console.error('[TextureStore] asset loading failed; using placeholders', error);
    }
    this.loaded = true;
    onProgress?.(1);
  }

  public has(alias: string): boolean {
    return Assets.cache.has(alias) && Assets.cache.get(alias) instanceof Texture;
  }

  /** The loaded texture, or the shared placeholder if missing. */
  public get(alias: string): Texture {
    if (Assets.cache.has(alias)) {
      const asset: unknown = Assets.cache.get(alias);
      if (asset instanceof Texture) return asset;
    }
    this.warnOnce(alias, `[TextureStore] missing texture "${alias}", using placeholder`);
    return this.getPlaceholder();
  }

  /**
   * Fixed-size cell: rect (frameX·frameW, frameY·frameH, frameW, frameH) in
   * source pixels, clipped to the texture. Cached; allocation-free on hits.
   */
  public getFrame(alias: string, frameX: number, frameY: number, frameW: number, frameH: number): Texture {
    // Packs 4 non-negative integers (each < 4096) into one exact double key.
    const key = frameX + frameY * 0x1000 + frameW * 0x1000000 + frameH * 0x1000000000;
    let byAlias = this.cellFrames.get(alias);
    const hit = byAlias?.get(key);
    if (hit) return hit;

    const base = this.get(alias);
    if (base === this.placeholder) return base;
    const frame = this.clipFrame(base, frameX * frameW, frameY * frameH, frameW, frameH, alias);
    if (!byAlias) {
      byAlias = new Map();
      this.cellFrames.set(alias, byAlias);
    }
    byAlias.set(key, frame);
    return frame;
  }

  /** Cell (col, row) of the texture split into an equal cols × rows grid (each < 256). */
  public getGridFrame(alias: string, col: number, row: number, cols: number, rows: number): Texture {
    const key = col + row * 0x100 + cols * 0x10000 + rows * 0x1000000;
    let byAlias = this.gridFrames.get(alias);
    const hit = byAlias?.get(key);
    if (hit) return hit;

    const base = this.get(alias);
    if (base === this.placeholder) return base;
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const w = Math.floor(base.frame.width / safeCols);
    const h = Math.floor(base.frame.height / safeRows);
    const frame =
      safeCols === 1 && safeRows === 1 ? base : this.clipFrame(base, col * w, row * h, w, h, alias);
    if (!byAlias) {
      byAlias = new Map();
      this.gridFrames.set(alias, byAlias);
    }
    byAlias.set(key, frame);
    return frame;
  }

  /** Explicit source rectangle in texture pixels (padded atlases). Cached. */
  public getRect(alias: string, x: number, y: number, w: number, h: number): Texture {
    const key = x + y * 0x1000 + w * 0x1000000 + h * 0x1000000000;
    let byAlias = this.rectFrames.get(alias);
    const hit = byAlias?.get(key);
    if (hit) return hit;

    const base = this.get(alias);
    if (base === this.placeholder) return base;
    const frame = this.clipFrame(base, x, y, w, h, alias);
    if (!byAlias) {
      byAlias = new Map();
      this.rectFrames.set(alias, byAlias);
    }
    byAlias.set(key, frame);
    return frame;
  }

  /** True when `texture` is the missing-art placeholder. */
  public isPlaceholder(texture: Texture): boolean {
    return texture === this.placeholder;
  }

  public getPlaceholder(): Texture {
    if (!this.placeholder) this.placeholder = createPlaceholderTexture();
    return this.placeholder;
  }

  /** Frees sub-textures and the placeholder. Loaded assets stay in the Assets cache. */
  public destroy(): void {
    for (const texture of this.owned) texture.destroy(false);
    this.owned.clear();
    this.cellFrames.clear();
    this.gridFrames.clear();
    this.rectFrames.clear();
    if (this.placeholder && this.placeholder !== Texture.EMPTY) this.placeholder.destroy(true);
    this.placeholder = null;
  }

  private async initAssets(): Promise<void> {
    if (!assetsInitPromise) {
      assetsInitPromise = Assets.init({
        manifest: this.manifestUrl,
        loadOptions: {
          strategy: 'skip',
          onError: (error: Error, url: unknown) =>
            console.warn(`[TextureStore] failed to load ${String(url)}:`, error.message),
        },
      });
    }
    await assetsInitPromise;
  }

  private registerExtras(): void {
    if (Assets.resolver.hasBundle(RENDERER_EXTRA_BUNDLE)) return;
    const missing = rendererExtraAssets().filter((asset) => !Assets.resolver.hasKey(asset.alias));
    if (missing.length > 0) Assets.addBundle(RENDERER_EXTRA_BUNDLE, missing);
  }

  private clipFrame(base: Texture, x: number, y: number, w: number, h: number, alias: string): Texture {
    const src = base.frame;
    const left = Math.max(0, Math.min(src.width, x));
    const top = Math.max(0, Math.min(src.height, y));
    const right = Math.max(left, Math.min(src.width, x + w));
    const bottom = Math.max(top, Math.min(src.height, y + h));
    if (right - left <= 0 || bottom - top <= 0) {
      this.warnOnce(`${alias}@${x},${y}`, `[TextureStore] frame (${x},${y},${w}x${h}) outside "${alias}"`);
      return this.getPlaceholder();
    }
    const texture = new Texture({
      source: base.source,
      frame: new Rectangle(src.x + left, src.y + top, right - left, bottom - top),
    });
    this.owned.add(texture);
    return texture;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }
}

function createPlaceholderTexture(): Texture {
  if (typeof document === 'undefined') return Texture.EMPTY;
  const canvas = document.createElement('canvas');
  canvas.width = PLACEHOLDER_PX;
  canvas.height = PLACEHOLDER_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;
  const half = PLACEHOLDER_PX / 2;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = (x + y) % 2 === 0 ? '#ff00ff' : '#000000';
    ctx.fillRect(x * half, y * half, half, half);
  }
  return Texture.from(canvas);
}
