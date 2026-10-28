import type {
  ServiceToken,
  ServiceFactory,
  ServiceDescriptor,
  IServiceContainer,
} from './types';

/**
 * Lightweight, zero-dependency Inversion of Control container.
 * Features:
 * - Lazy instantiation of singletons
 * - Transient factory support
 * - Circular dependency detection with cycle graph error messages
 * - Parent-child hierarchical scoping
 */
export class ServiceContainer implements IServiceContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly descriptors: Map<ServiceToken<any>, ServiceDescriptor<any>> = new Map();

  // Stack of tokens currently being resolved (used for cycle detection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly resolutionStack: Array<ServiceToken<any>> = [];

  constructor(private readonly parent?: ServiceContainer) {}

  /**
   * Registers a service token with a factory function.
   */
  public register<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    isSingleton: boolean = true
  ): this {
    this.descriptors.set(token, {
      token,
      factory,
      isSingleton,
    });
    return this;
  }

  /**
   * Convenience method to register a pre-existing singleton instance.
   */
  public registerInstance<T>(token: ServiceToken<T>, instance: T): this {
    this.descriptors.set(token, {
      token,
      factory: () => instance,
      isSingleton: true,
      instance,
    });
    return this;
  }

  /**
   * Resolves an instance for the requested token.
   */
  public resolve<T>(token: ServiceToken<T>): T {
    // 1. Circular dependency detection
    if (this.resolutionStack.includes(token)) {
      const cyclePath = [...this.resolutionStack, token]
        .map((t) => t.name)
        .join(' -> ');
      throw new Error(
        `[ServiceContainer] Circular dependency detected: ${cyclePath}`
      );
    }

    // 2. Find descriptor locally; otherwise delegate to the parent so its services
    //    are built in the parent scope (child overrides must not leak into them)
    const descriptor = this.descriptors.get(token) as ServiceDescriptor<T> | undefined;
    if (!descriptor && this.parent) {
      return this.parent.resolve(token);
    }
    if (!descriptor) {
      throw new Error(
        `[ServiceContainer] Service not registered: "${token.name}". Ensure it is registered before resolving.`
      );
    }

    // 3. Return cached singleton instance if available
    if (descriptor.isSingleton && descriptor.instance !== undefined) {
      return descriptor.instance;
    }

    // 4. Instantiate via factory with cycle tracking
    this.resolutionStack.push(token);
    try {
      const createdInstance = descriptor.factory(this);

      if (descriptor.isSingleton) {
        descriptor.instance = createdInstance;
      }

      return createdInstance;
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Checks whether the token exists in this container or its parents.
   */
  public has<T>(token: ServiceToken<T>): boolean {
    return this.descriptors.has(token) || (this.parent?.has(token) ?? false);
  }

  /**
   * Clears all local registrations and cached instances.
   */
  public clear(): void {
    this.descriptors.clear();
    this.resolutionStack.length = 0;
  }

  /**
   * Creates a scoped child container inheriting parent services.
   */
  public createChild(): ServiceContainer {
    return new ServiceContainer(this);
  }
}
