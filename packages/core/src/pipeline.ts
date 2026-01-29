/**
 * Pipeline interface for composing adapters.
 * @module pipeline
 */

import type { Audio } from './types.js';

/**
 * Pipeline that processes audio through a chain of adapters.
 *
 * A pipeline encapsulates the STT → LLM → TTS flow (cascade mode)
 * or a single S2S adapter, providing a unified interface for
 * voice-to-voice processing.
 *
 * @example
 * ```typescript
 * const pipeline: Pipeline = createCascadePipeline(stt, llm, tts);
 *
 * for await (const audioChunk of pipeline.process(inputAudio)) {
 *   speaker.play(audioChunk);
 * }
 * ```
 */
export interface Pipeline {
  /**
   * Process input audio and yield output audio.
   *
   * Takes streaming audio input (user speech) and yields streaming
   * audio output (assistant speech).
   *
   * @param audio - Async iterable of input audio chunks
   * @returns Async iterable of output audio chunks
   */
  process(audio: AsyncIterable<Audio>): AsyncIterable<Audio>;

  /**
   * Interrupt any in-progress processing.
   *
   * When the user interrupts (starts speaking while the assistant
   * is responding), call this to stop all adapters and prepare
   * for new input.
   */
  interrupt(): Promise<void>;
}
