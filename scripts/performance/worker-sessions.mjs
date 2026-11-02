/** Browser-level CDP bridge for dedicated workers (Playwright's page CDP session is separate). */
export class WorkerSessions {
  constructor(cdp) {
    this.cdp = cdp;
    this.sequence = 0;
    this.pending = new Map();
    this.attached = new Map();
    this.listener = (event) => {
      const message = JSON.parse(event.message),
        key = event.sessionId + ':' + message.id,
        waiter = this.pending.get(key);
      if (!waiter) return;
      this.pending.delete(key);
      clearTimeout(waiter.timeout);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    };
    cdp.on('Target.receivedMessageFromTarget', this.listener);
  }
  async sessions() {
    const targets = (await this.cdp.send('Target.getTargets')).targetInfos.filter(
      (t) => t.type === 'worker' && t.url.includes('generation.worker'),
    );
    const live = new Set(targets.map((t) => t.targetId));
    for (const id of this.attached.keys()) if (!live.has(id)) this.attached.delete(id);
    const result = [];
    for (const target of targets) {
      if (!this.attached.has(target.targetId)) {
        const value = await this.cdp.send('Target.attachToTarget', {
          targetId: target.targetId,
          flatten: false,
        });
        this.attached.set(target.targetId, value.sessionId);
      }
      result.push({
        targetId: target.targetId,
        url: target.url,
        sessionId: this.attached.get(target.targetId),
      });
    }
    return result;
  }
  async send(sessionId, method, params = {}) {
    if (this.pending.size >= 16) throw new Error('Worker CDP pending bound exceeded');
    const id = ++this.sequence,
      key = sessionId + ':' + id;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('Worker CDP timeout: ' + method));
      }, 5000);
      this.pending.set(key, { resolve, reject, timeout });
    });
    try {
      await this.cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      });
    } catch (error) {
      const waiter = this.pending.get(key);
      if (waiter) {
        clearTimeout(waiter.timeout);
        this.pending.delete(key);
        waiter.reject(error);
      }
    }
    return result;
  }
  async heaps(gc = false) {
    const values = [];
    for (const session of await this.sessions()) {
      if (gc) await this.send(session.sessionId, 'HeapProfiler.collectGarbage');
      values.push({ ...session, heap: await this.send(session.sessionId, 'Runtime.getHeapUsage') });
    }
    return values;
  }
  dispose() {
    this.cdp.off('Target.receivedMessageFromTarget', this.listener);
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Worker bridge disposed'));
    }
    this.pending.clear();
    this.attached.clear();
  }
}
