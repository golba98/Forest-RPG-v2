import { PERF_BUILD, profileEvent } from '../performance/FrameProfiler';
/** Cooperative preparation; callers publish only after all slices finish. */
export class CancelledWork extends Error {}
export async function prepareInSlices(
  work: Iterator<unknown>,
  valid: () => boolean = () => true,
): Promise<void> {
  for (;;) {
    if (!valid()) throw new CancelledWork('World preparation superseded');
    const start = performance.now();
    const until = start + 2;
    do {
      if (work.next().done) {
        if (PERF_BUILD) profileEvent('transition.slice', start, performance.now() - start);
        return;
      }
    } while (performance.now() < until);
    if (PERF_BUILD) profileEvent('transition.slice', start, performance.now() - start);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
