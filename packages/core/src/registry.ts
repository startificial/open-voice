/**
 * Adapter registry for managing and discovering adapters.
 * @module registry
 */

import type { Adapter } from './adapter.js';

/**
 * Information about a registered adapter.
 */
export interface AdapterInfo {
  /** Human-readable name of the adapter */
  name: string;
  /** Type of adapter (stt, llm, tts, s2s) */
  type: string;
  /** Whether the adapter is currently healthy */
  healthy: boolean;
}

/**
 * Registry for managing adapter instances.
 *
 * The registry provides adapter discovery and health-aware selection.
 * It allows registering multiple adapters of each type and selecting
 * the best available one based on health status.
 *
 * @example
 * ```typescript
 * const registry: AdapterRegistry = createRegistry();
 *
 * registry.register(whisperAdapter);
 * registry.register(deepgramAdapter);
 *
 * // Get best healthy STT adapter
 * const stt = await registry.getBest<Audio, string>('stt');
 * ```
 */
export interface AdapterRegistry {
  /**
   * Register an adapter with the registry.
   *
   * @typeParam I - Input type of the adapter
   * @typeParam O - Output type of the adapter
   * @param adapter - The adapter instance to register
   */
  register<I, O>(adapter: Adapter<I, O>): void;

  /**
   * Get a specific adapter by type and name.
   *
   * @typeParam I - Expected input type
   * @typeParam O - Expected output type
   * @param type - The adapter type (stt, llm, tts, s2s)
   * @param name - The adapter name
   * @returns The adapter instance
   * @throws If no adapter matches the type and name
   */
  get<I, O>(type: string, name: string): Adapter<I, O>;

  /**
   * Get the best available adapter of a given type.
   *
   * Selects based on health status and priority. Returns the
   * first healthy adapter of the requested type.
   *
   * @typeParam I - Expected input type
   * @typeParam O - Expected output type
   * @param type - The adapter type (stt, llm, tts, s2s)
   * @returns The best available adapter
   * @throws If no healthy adapter is available
   */
  getBest<I, O>(type: string): Promise<Adapter<I, O>>;

  /**
   * List all registered adapters, optionally filtered by type.
   *
   * @param type - Optional type filter
   * @returns Array of adapter info objects
   */
  list(type?: string): AdapterInfo[];
}
