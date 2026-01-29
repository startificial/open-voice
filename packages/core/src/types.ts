/**
 * Core types shared across all voice agent components.
 * @module types
 */

/**
 * Represents raw audio data as an ArrayBuffer.
 * Used for streaming audio through the pipeline.
 */
export type Audio = ArrayBuffer;

/**
 * Represents a message in the conversation history.
 */
export interface Message {
  /** The role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** The text content of the message */
  content: string;
  /** Unix timestamp in milliseconds when the message was created */
  timestamp: number;
}

/**
 * Status of the voice session state machine.
 */
export type Status =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

/**
 * Latency and performance metrics for observability.
 */
export interface Metrics {
  /** Total end-to-end latency in milliseconds */
  latency: number;
  /** Speech-to-text component latency in milliseconds */
  sttLatency?: number;
  /** LLM component latency in milliseconds */
  llmLatency?: number;
  /** Text-to-speech component latency in milliseconds */
  ttsLatency?: number;
}

/**
 * Configuration for the voice agent pipeline.
 */
export interface Config {
  /**
   * Pipeline mode:
   * - 'cascade': Uses separate STT → LLM → TTS adapters
   * - 's2s': Uses a single speech-to-speech adapter
   */
  mode: 'cascade' | 's2s';

  /** Optional endpoint URL for API connections */
  endpoint?: string;

  /** Provider names for each adapter type */
  providers?: {
    /** Speech-to-text provider (e.g., 'whisper', 'deepgram') */
    stt?: string;
    /** LLM provider (e.g., 'openai', 'anthropic') */
    llm?: string;
    /** Text-to-speech provider (e.g., 'elevenlabs', 'playht') */
    tts?: string;
    /** Speech-to-speech provider (e.g., 'openai-realtime') */
    s2s?: string;
  };

  /** Agent configuration */
  agent?: {
    /** System prompt for the LLM */
    systemPrompt?: string;
    /** Voice ID for TTS provider */
    voice?: string;
    /** Persona configuration for S2S mode */
    persona?: {
      voice: string;
      rolePrompt: string;
    };
  };
}

/**
 * Error codes for the WebSocket protocol.
 * Used in error messages sent between client and server.
 */
export type ErrorCode =
  | 'NO_SESSION'
  | 'INVALID_MESSAGE'
  | 'INVALID_CONFIG'
  | 'ADAPTER_NOT_FOUND'
  | 'ADAPTER_UNHEALTHY'
  | 'PROCESSING_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_LOST'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED';

/**
 * Error message structure for the WebSocket protocol.
 */
export interface ProtocolError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Optional additional details */
  details?: Record<string, unknown>;
}

/**
 * WebSocket protocol message types from client to server.
 */
export type ClientMessage =
  | { type: 'audio'; data: ArrayBuffer }
  | { type: 'config'; config: Partial<Config> }
  | { type: 'interrupt' };

/**
 * WebSocket protocol message types from server to client.
 */
export type ServerMessage =
  | { type: 'audio'; data: ArrayBuffer }
  | { type: 'transcript'; role: 'user' | 'agent'; text: string }
  | { type: 'status'; status: Status }
  | { type: 'metrics'; metrics: Metrics }
  | { type: 'error'; error: ProtocolError };
