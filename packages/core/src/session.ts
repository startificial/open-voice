/**
 * Voice session interface for conversation orchestration.
 * @module session
 */

import type { Audio, Message, Metrics, Status } from './types.js';
import type { Pipeline } from './pipeline.js';

/**
 * Options for creating a voice session.
 */
export interface VoiceSessionOptions {
  /** The pipeline to use for audio processing */
  pipeline: Pipeline;

  /**
   * Callback invoked when the session status changes.
   *
   * @param status - The new session status
   */
  onStatusChange?: (status: Status) => void;

  /**
   * Callback invoked when new metrics are available.
   *
   * @param metrics - The latency and performance metrics
   */
  onMetrics?: (metrics: Metrics) => void;
}

/**
 * Voice session interface for managing conversations.
 *
 * A voice session orchestrates the conversation flow, maintaining
 * message history and coordinating the pipeline. It handles
 * turn-taking, interruptions, and provides metrics.
 *
 * @example
 * ```typescript
 * const session: IVoiceSession = createSession({
 *   pipeline,
 *   onStatusChange: (status) => ui.updateStatus(status),
 *   onMetrics: (metrics) => analytics.log(metrics),
 * });
 *
 * // Stream a user turn
 * for await (const response of session.converse(userAudio)) {
 *   speaker.play(response);
 * }
 *
 * // User interrupts
 * await session.interrupt();
 *
 * // Access conversation history
 * const history = session.getHistory();
 * ```
 */
export interface IVoiceSession {
  /**
   * Process a user audio turn and yield assistant audio response.
   *
   * Takes streaming audio input and returns streaming audio output.
   * Updates conversation history with both user and assistant messages.
   *
   * @param audio - Async iterable of user audio chunks
   * @returns Async iterable of assistant audio response chunks
   */
  converse(audio: AsyncIterable<Audio>): AsyncIterable<Audio>;

  /**
   * Interrupt the current response.
   *
   * Stops the pipeline and prepares for a new user turn.
   * The partial assistant response may still be added to history.
   */
  interrupt(): Promise<void>;

  /**
   * Get the full conversation history.
   *
   * @returns Array of messages in chronological order
   */
  getHistory(): Message[];
}
