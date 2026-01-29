/**
 * Adapter interfaces for voice pipeline components.
 * @module adapter
 */

import type { Audio } from './types.js';

/**
 * Generic adapter interface for pipeline components.
 *
 * Adapters transform streaming input of type TInput into streaming output of type TOutput.
 * This enables composition of STT → LLM → TTS pipelines where output types match input types.
 *
 * @typeParam TInput - The input data type (e.g., Audio for STT, string for LLM)
 * @typeParam TOutput - The output data type (e.g., string for STT, Audio for TTS)
 *
 * @example
 * ```typescript
 * // Chain adapters together
 * async function* chain(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
 *   yield* ttsAdapter.stream(llmAdapter.stream(sttAdapter.stream(audio)));
 * }
 * ```
 */
export interface Adapter<TInput, TOutput> {
  /** Human-readable name of the adapter (e.g., 'whisper', 'gpt-4') */
  readonly name: string;

  /** The type of adapter for registry classification */
  readonly type: 'stt' | 'llm' | 'tts' | 's2s';

  /**
   * Process streaming input and yield streaming output.
   *
   * @param input - Async iterable of input chunks
   * @returns Async iterable of output chunks
   */
  stream(input: AsyncIterable<TInput>): AsyncIterable<TOutput>;

  /**
   * Interrupt any in-progress processing.
   * Used when the user interrupts the assistant mid-response.
   */
  interrupt(): Promise<void>;

  /**
   * Check if the adapter is healthy and ready to process requests.
   *
   * @returns true if the adapter can accept requests
   */
  isHealthy(): Promise<boolean>;
}

/**
 * Speech-to-text adapter: converts audio streams to text streams.
 */
export type STTAdapter = Adapter<Audio, string>;

/**
 * Language model adapter: converts text streams to text streams.
 */
export type LLMAdapter = Adapter<string, string>;

/**
 * Text-to-speech adapter: converts text streams to audio streams.
 */
export type TTSAdapter = Adapter<string, Audio>;

/**
 * Speech-to-speech adapter: converts audio streams directly to audio streams.
 * Used for end-to-end models like OpenAI Realtime API.
 */
export type S2SAdapter = Adapter<Audio, Audio>;
