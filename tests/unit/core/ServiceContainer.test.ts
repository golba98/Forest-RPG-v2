import { describe, it, expect } from 'vitest';
import { ServiceContainer } from '@/core/di/ServiceContainer';
import { createServiceToken } from '@/core/di/types';

describe('ServiceContainer Core Unit Tests', () => {
  interface ILogger {
    log(msg: string): string;
  }
  interface IDatabase {
    getData(): string;
  }

  const LOGGER_TOKEN = createServiceToken<ILogger>('Logger');
  const DB_TOKEN = createServiceToken<IDatabase>('Database');

  it('registers and resolves a singleton service (same reference returned)', () => {
    const container = new ServiceContainer();
    let factoryCount = 0;

    container.register(
      LOGGER_TOKEN,
      () => {
        factoryCount++;
        return { log: (msg) => `[LOG] ${msg}` };
      },
      true
    );

    const logger1 = container.resolve(LOGGER_TOKEN);
    const logger2 = container.resolve(LOGGER_TOKEN);

    expect(factoryCount).toBe(1);
    expect(logger1).toBe(logger2);
    expect(logger1.log('hello')).toBe('[LOG] hello');
  });

  it('registers and resolves a transient service (new instance each resolve)', () => {
    const container = new ServiceContainer();
    let instanceCount = 0;

    const TRANSIENT_TOKEN = createServiceToken<{ id: number }>('TransientItem');
    container.register(TRANSIENT_TOKEN, () => ({ id: ++instanceCount }), false);

    const item1 = container.resolve(TRANSIENT_TOKEN);
    const item2 = container.resolve(TRANSIENT_TOKEN);

    expect(item1.id).toBe(1);
    expect(item2.id).toBe(2);
    expect(item1).not.toBe(item2);
  });

  it('registers pre-existing instance via registerInstance()', () => {
    const container = new ServiceContainer();
    const existing = { log: (msg: string) => `pre: ${msg}` };

    container.registerInstance(LOGGER_TOKEN, existing);
    expect(container.has(LOGGER_TOKEN)).toBe(true);

    const resolved = container.resolve(LOGGER_TOKEN);
    expect(resolved).toBe(existing);
  });

  it('resolves nested dependencies across services', () => {
    const container = new ServiceContainer();

    container.register(LOGGER_TOKEN, () => ({
      log: (msg) => `logged: ${msg}`,
    }));

    container.register(DB_TOKEN, (c) => {
      const logger = c.resolve(LOGGER_TOKEN);
      return {
        getData: () => logger.log('db_data'),
      };
    });

    const db = container.resolve(DB_TOKEN);
    expect(db.getData()).toBe('logged: db_data');
  });

  it('throws descriptive error when resolving an unregistered token', () => {
    const container = new ServiceContainer();
    const UNREGISTERED = createServiceToken<string>('UnregisteredService');

    expect(() => container.resolve(UNREGISTERED)).toThrowError(
      '[ServiceContainer] Service not registered: "UnregisteredService"'
    );
  });

  it('detects direct and indirect circular dependencies', () => {
    const container = new ServiceContainer();

    interface IServiceA {
      a: () => void;
    }
    interface IServiceB {
      b: () => void;
    }
    interface IServiceC {
      c: () => void;
    }

    const TOKEN_A = createServiceToken<IServiceA>('ServiceA');
    const TOKEN_B = createServiceToken<IServiceB>('ServiceB');
    const TOKEN_C = createServiceToken<IServiceC>('ServiceC');

    // Cycle: A -> B -> C -> A
    container.register(TOKEN_A, (c) => {
      c.resolve(TOKEN_B);
      return { a: () => {} };
    });
    container.register(TOKEN_B, (c) => {
      c.resolve(TOKEN_C);
      return { b: () => {} };
    });
    container.register(TOKEN_C, (c) => {
      c.resolve(TOKEN_A);
      return { c: () => {} };
    });

    expect(() => container.resolve(TOKEN_A)).toThrowError(
      /Circular dependency detected: ServiceA -> ServiceB -> ServiceC -> ServiceA/
    );
  });

  it('supports hierarchical child containers with scoped overrides', () => {
    const parent = new ServiceContainer();
    parent.register(LOGGER_TOKEN, () => ({ log: (msg) => `parent: ${msg}` }));

    const child = parent.createChild();
    // Child resolves parent service if not registered in child
    expect(child.resolve(LOGGER_TOKEN).log('test')).toBe('parent: test');

    // Child can override with scoped service
    child.register(LOGGER_TOKEN, () => ({ log: (msg) => `child: ${msg}` }));
    expect(child.resolve(LOGGER_TOKEN).log('test')).toBe('child: test');
    // Parent remains unaffected
    expect(parent.resolve(LOGGER_TOKEN).log('test')).toBe('parent: test');
  });

  it('builds parent singletons in the parent scope even when a child resolves them first', () => {
    const SERVICE_TOKEN = createServiceToken<{ logger: ILogger }>('UsesLogger');
    const parent = new ServiceContainer();
    parent.register(LOGGER_TOKEN, () => ({ log: (msg) => `parent: ${msg}` }));
    parent.register(SERVICE_TOKEN, (c) => ({ logger: c.resolve(LOGGER_TOKEN) }));

    const child = parent.createChild();
    child.register(LOGGER_TOKEN, () => ({ log: (msg) => `child: ${msg}` }));

    const fromChild = child.resolve(SERVICE_TOKEN);
    expect(fromChild.logger.log('test')).toBe('parent: test');
    expect(parent.resolve(SERVICE_TOKEN)).toBe(fromChild);
  });

  it('clear() empties registrations and instance caches', () => {
    const container = new ServiceContainer();
    container.register(LOGGER_TOKEN, () => ({ log: (m) => m }));

    expect(container.has(LOGGER_TOKEN)).toBe(true);
    container.clear();
    expect(container.has(LOGGER_TOKEN)).toBe(false);
  });
});
