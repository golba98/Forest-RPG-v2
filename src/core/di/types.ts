/**
 * Unique identifier for a service registered in the dependency injection container.
 * Carries a phantom type parameter `T` to guarantee compile-time type inference.
 */
export class ServiceToken<T> {
  // Phantom type declaration preventing structural equivalence collision
  declare readonly _serviceType: T;

  /**
   * @param name Human-readable name used in debug logs, error messages, and cycle detection.
   */
  constructor(public readonly name: string) {}

  public toString(): string {
    return `ServiceToken(${this.name})`;
  }
}

/**
 * Factory helper for creating typed service tokens.
 */
export function createServiceToken<T>(name: string): ServiceToken<T> {
  return new ServiceToken<T>(name);
}

/**
 * Service factory signature receiving the container for dependency resolution.
 */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/**
 * Lifecycle configuration options for a service registration.
 */
export interface ServiceOptions {
  /**
   * If true (default), the instance is created once and cached.
   * If false, the factory is called each time the token is resolved.
   */
  isSingleton?: boolean;
}

/**
 * Internal descriptor tracking service registration metadata.
 */
export interface ServiceDescriptor<T> {
  token: ServiceToken<T>;
  factory: ServiceFactory<T>;
  isSingleton: boolean;
  instance?: T;
}

/**
 * Contract for the dependency injection container.
 */
export interface IServiceContainer {
  /**
   * Registers a service token with a factory function.
   * @param token The ServiceToken
   * @param factory Factory function producing the service instance
   * @param isSingleton Whether the service is a singleton (default: true)
   */
  register<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    isSingleton?: boolean
  ): this;

  /**
   * Registers a pre-existing singleton instance directly.
   */
  registerInstance<T>(token: ServiceToken<T>, instance: T): this;

  /**
   * Resolves an instance for the requested token.
   * Throws an error if the token is unregistered or if a circular dependency is detected.
   */
  resolve<T>(token: ServiceToken<T>): T;

  /**
   * Checks whether the container (or any parent container) has registered the token.
   */
  has<T>(token: ServiceToken<T>): boolean;

  /**
   * Clears all registrations and cached singleton instances.
   */
  clear(): void;

  /**
   * Creates a child container that inherits registrations from this container.
   * Child registrations override parent registrations for the child scope.
   */
  createChild(): IServiceContainer;
}
