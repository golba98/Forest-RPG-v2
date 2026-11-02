import type { PerformanceCollector } from './FrameProfiler';
import { encodeBatch } from './BinaryTelemetry';
export class TelemetryPipe {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly pending = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private destination = '';
  private failed = 0;
  private pressure = 0;
  constructor(private readonly metrics: PerformanceCollector) {}
  start(url: string): void {
    if (this.timer) throw new Error('Telemetry transport already active');
    const target = new URL(url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
      throw new Error('Telemetry requires a loopback receiver');
    this.destination = url;
    this.failed = this.pressure = 0;
    this.timer = setInterval(() => {
      if (this.metrics.active) this.send();
    }, 1000);
  }
  private send(): void {
    if (this.pending.size >= 2) {
      this.pressure++;
      return;
    }
    const start = performance.now(),
      body = encodeBatch(this.metrics.drain());
    this.metrics.event('profiler.transport.encode', start, performance.now() - start, {
      bytes: body.byteLength,
    });
    const controller = new AbortController();
    this.controllers.add(controller);
    const request = fetch(this.destination, {
      method: 'POST',
      body,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Telemetry HTTP ' + response.status);
      })
      .catch(() => {
        this.failed++;
      })
      .finally(() => {
        this.pending.delete(request);
        this.controllers.delete(controller);
      });
    this.pending.add(request);
  }
  async flush(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await Promise.all(this.pending);
    this.send();
    await Promise.all(this.pending);
  }
  snapshot() {
    return { pending: this.pending.size, failed: this.failed, backpressure: this.pressure };
  }
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const controller of this.controllers) controller.abort();
  }
}
