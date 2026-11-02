import { PERF_BUILD } from '../../performance/FrameProfiler';
import { ForestGenerator } from './ForestGenerator';
import type { InfiniteDescriptor } from './types';
import type { ChunkAddress } from './coordinates';
interface Request {
  id: number;
  descriptor: InfiniteDescriptor;
  address: ChunkAddress;
  profile?: boolean;
  dispatched?: number;
}
let generator: ForestGenerator | undefined;
function normal(data: Request): void {
  const { id, descriptor, address } = data;
  try {
    if (generator?.descriptor.id !== descriptor.id) generator = new ForestGenerator(descriptor);
    const chunk = generator.generate(address);
    self.postMessage({ id, chunk }, { transfer: [chunk.tiles.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
}
if (PERF_BUILD) {
  self.onmessage = (event: MessageEvent<Request>) => {
    const { id, descriptor, address, dispatched, profile } = event.data;
    if (!profile) { normal(event.data); return; }
    const received = performance.now();
    try {
      if (generator?.descriptor.id !== descriptor.id) generator = new ForestGenerator(descriptor);
      const constructed = performance.now();
      const chunk = generator.generate(address);
      const finished = performance.now();
      self.postMessage({ id, chunk, metrics: {
        address, dispatched, received: performance.timeOrigin + received,
        constructed: performance.timeOrigin + constructed, finished: performance.timeOrigin + finished,
        posted: performance.timeOrigin + performance.now(), executeMs: finished - constructed,
        constructMs: constructed - received, inboundMs: performance.timeOrigin + received - (dispatched ?? 0),
        bytes: chunk.tiles.byteLength, props: chunk.props.length,
      } }, { transfer: [chunk.tiles.buffer] });
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  };
} else {
  self.onmessage = (event: MessageEvent<Request>) => normal(event.data);
}
