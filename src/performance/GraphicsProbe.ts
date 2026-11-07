/* eslint-disable prefer-rest-params, @typescript-eslint/no-this-alias -- Preserve the native GL receiver without allocating argument arrays. */
import { GlBatchAdaptor, Sprite } from 'pixi.js';
import type { PerformanceCollector } from './FrameProfiler';

/** Counts actual GL submissions. Timer queries are asynchronous, sampled and bounded. */
export class GraphicsProbe {
  private readonly restore: Array<() => void> = [];
  private gl: WebGL2RenderingContext | undefined;
  private timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private query: WebGLQuery | null = null;
  private readonly pending: { query: WebGLQuery; t: number }[] = [];
  private frame = 0;
  gpuSampling = false;
  terrainPass = false;
  readonly capabilities: { renderer?: string; webgl2: boolean; timerQueries: boolean } = {
    webgl2: false,
    timerQueries: false,
  };
  constructor(private readonly metrics: PerformanceCollector) {}
  attach(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.capabilities.webgl2 = typeof gl.createQuery === 'function';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.capabilities.renderer = String(
      gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    );
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.timer;
    this.capabilities.timerQueries = !!this.timer;
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
      'bindTexture',
      'bindFramebuffer',
      'texImage2D',
      'texSubImage2D',
      'texStorage2D',
      'compressedTexImage2D',
      'compressedTexSubImage2D',
    ]) {
      const record = gl as unknown as Record<string, unknown>,
        original = record[name];
      if (typeof original !== 'function') continue;
      const terrainCounter = this.metrics.id('terrain.gl.' + name);
      const probe = this;
      const counter = this.metrics.id('gl.' + name),
        m = this.metrics;
      const upload = name.includes('Image') || name === 'texStorage2D';
      const timing = m.id('upload.' + name);
      record[name] = function (this: unknown) {
        if (!m.active) return original.apply(this, arguments);
        m.count(counter);
        if (probe.terrainPass) m.count(terrainCounter);
        const token = upload ? m.begin(timing) : -1;
        try {
          return original.apply(this, arguments);
        } finally {
          m.end(token);
        }
      };
      this.restore.push(() => {
        record[name] = original;
      });
    }
  }
  attachBatches(): void {
    const record = GlBatchAdaptor.prototype as unknown as Record<string, unknown>,
      original = record.execute as (...args: unknown[]) => unknown;
    const probe = this,
      m = this.metrics,
      ids = ['batches', 'elements', 'sprites', 'textureSlots'].map((name) =>
        m.id('sampled.batch.' + name),
      );
    record.execute = function (
      this: unknown,
      pipe: unknown,
      batch: { elements: { renderable: unknown }[]; textures: { count: number } },
    ) {
      if (probe.query && m.active) {
        m.count(ids[0] ?? 0);
        m.count(ids[1] ?? 0, batch.elements.length);
        m.count(ids[3] ?? 0, batch.textures.count);
        let sprites = 0;
        for (const element of batch.elements) if (element.renderable instanceof Sprite) sprites++;
        m.count(ids[2] ?? 0, sprites);
      }
      return original.call(this, pipe, batch);
    };
    this.restore.push(() => {
      record.execute = original;
    });
  }
  beginFrame(): void {
    const gl = this.gl,
      timer = this.timer;
    if (!gl || !timer || !this.metrics.active || (!this.gpuSampling && this.pending.length === 0))
      return;
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      this.metrics.event('gpu.disjoint', performance.now(), 0, { discarded: this.pending.length });
      for (const p of this.pending) gl.deleteQuery(p.query);
      this.pending.length = 0;
    }
    while (
      this.pending[0] &&
      gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)
    ) {
      const p = this.pending.shift();
      if (!p) break;
      this.metrics.event(
        'gpu.frame',
        p.t,
        Number(gl.getQueryParameter(p.query, gl.QUERY_RESULT)) / 1e6,
      );
      gl.deleteQuery(p.query);
    }
    if (!this.gpuSampling || this.pending.length >= 16 || this.frame++ % 30 !== 0) return;
    this.query = gl.createQuery();
    if (this.query) {
      this.metrics.count(this.metrics.id('sampled.gpu.frames'));
      gl.beginQuery(timer.TIME_ELAPSED_EXT, this.query);
    }
  }
  endFrame(): void {
    if (!this.query || !this.gl || !this.timer) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.query, t: performance.now() });
    this.query = null;
  }
  dispose(): void {
    this.endFrame();
    for (const p of this.pending) this.gl?.deleteQuery(p.query);
    this.pending.length = 0;
    for (const restore of this.restore) restore();
    this.restore.length = 0;
  }
}
