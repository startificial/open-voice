/**
 * @open-voice/core
 *
 * Core interfaces and types for the open-voice voice agent framework.
 *
 * @packageDocumentation
 */

// Types
export type { Audio, Message, Status, Metrics, Config } from './types.js';

// Adapter interfaces
export type {
  Adapter,
  STTAdapter,
  LLMAdapter,
  TTSAdapter,
  S2SAdapter,
} from './adapter.js';

// Pipeline interface
export type { Pipeline } from './pipeline.js';

// Registry interfaces
export type { AdapterRegistry, AdapterInfo } from './registry.js';

// Session interfaces
export type { VoiceSessionOptions, IVoiceSession } from './session.js';
