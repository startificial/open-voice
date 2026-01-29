/**
 * Adapter interface tests
 *
 * Verifies that the Adapter interface is implementable and that
 * the type aliases compose correctly for STT → LLM → TTS chains.
 */

import { describe, it, expect } from 'vitest';
import type {
  Audio,
  Adapter,
  STTAdapter,
  LLMAdapter,
  TTSAdapter,
  S2SAdapter,
} from '../src/index.js';

/**
 * Mock STT adapter that returns canned transcripts
 */
function createMockSTTAdapter(transcript: string): STTAdapter {
  return {
    name: 'mock-stt',
    type: 'stt',

    async *stream(_input: AsyncIterable<Audio>): AsyncIterable<string> {
      // Consume input (simulates processing)
      for await (const _ of _input) {
        // Process audio chunk
      }
      // Yield transcript in chunks
      const words = transcript.split(' ');
      for (const word of words) {
        yield word + ' ';
      }
    },

    async interrupt(): Promise<void> {
      // No-op for mock
    },

    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Mock LLM adapter that returns canned responses
 */
function createMockLLMAdapter(response: string): LLMAdapter {
  return {
    name: 'mock-llm',
    type: 'llm',

    async *stream(input: AsyncIterable<string>): AsyncIterable<string> {
      // Consume input (collect transcript)
      let transcript = '';
      for await (const chunk of input) {
        transcript += chunk;
      }

      // Yield response in chunks
      const words = response.split(' ');
      for (const word of words) {
        yield word + ' ';
      }
    },

    async interrupt(): Promise<void> {
      // No-op for mock
    },

    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Mock TTS adapter that returns silent audio
 */
function createMockTTSAdapter(): TTSAdapter {
  return {
    name: 'mock-tts',
    type: 'tts',

    async *stream(input: AsyncIterable<string>): AsyncIterable<Audio> {
      // Consume input (collect text)
      let text = '';
      for await (const chunk of input) {
        text += chunk;
      }

      // Yield "audio" chunks (silent audio for testing)
      const chunkCount = Math.ceil(text.length / 10);
      for (let i = 0; i < chunkCount; i++) {
        yield new ArrayBuffer(1600); // 100ms of 16-bit 16kHz mono audio
      }
    },

    async interrupt(): Promise<void> {
      // No-op for mock
    },

    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Mock S2S adapter for end-to-end testing
 */
function createMockS2SAdapter(): S2SAdapter {
  return {
    name: 'mock-s2s',
    type: 's2s',

    async *stream(input: AsyncIterable<Audio>): AsyncIterable<Audio> {
      // Consume input
      let totalBytes = 0;
      for await (const chunk of input) {
        totalBytes += chunk.byteLength;
      }

      // Yield proportional "response" audio
      const responseChunks = Math.max(1, Math.ceil(totalBytes / 3200));
      for (let i = 0; i < responseChunks; i++) {
        yield new ArrayBuffer(1600);
      }
    },

    async interrupt(): Promise<void> {
      // No-op for mock
    },

    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

describe('Adapter Interface', () => {
  describe('STTAdapter', () => {
    it('should process audio and yield text', async () => {
      const stt = createMockSTTAdapter('hello world');

      async function* audioInput(): AsyncIterable<Audio> {
        yield new ArrayBuffer(1600);
        yield new ArrayBuffer(1600);
      }

      const chunks: string[] = [];
      for await (const chunk of stt.stream(audioInput())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').trim()).toBe('hello world');
    });

    it('should report healthy status', async () => {
      const stt = createMockSTTAdapter('test');
      expect(await stt.isHealthy()).toBe(true);
    });

    it('should have correct type property', () => {
      const stt = createMockSTTAdapter('test');
      expect(stt.type).toBe('stt');
    });
  });

  describe('LLMAdapter', () => {
    it('should process text and yield text', async () => {
      const llm = createMockLLMAdapter('I am a helpful assistant');

      async function* textInput(): AsyncIterable<string> {
        yield 'hello ';
        yield 'world';
      }

      const chunks: string[] = [];
      for await (const chunk of llm.stream(textInput())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').trim()).toBe('I am a helpful assistant');
    });

    it('should have correct type property', () => {
      const llm = createMockLLMAdapter('test');
      expect(llm.type).toBe('llm');
    });
  });

  describe('TTSAdapter', () => {
    it('should process text and yield audio', async () => {
      const tts = createMockTTSAdapter();

      async function* textInput(): AsyncIterable<string> {
        yield 'Hello, ';
        yield 'how are you?';
      }

      const chunks: Audio[] = [];
      for await (const chunk of tts.stream(textInput())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toBeInstanceOf(ArrayBuffer);
    });

    it('should have correct type property', () => {
      const tts = createMockTTSAdapter();
      expect(tts.type).toBe('tts');
    });
  });

  describe('S2SAdapter', () => {
    it('should process audio and yield audio', async () => {
      const s2s = createMockS2SAdapter();

      async function* audioInput(): AsyncIterable<Audio> {
        yield new ArrayBuffer(3200);
        yield new ArrayBuffer(3200);
      }

      const chunks: Audio[] = [];
      for await (const chunk of s2s.stream(audioInput())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toBeInstanceOf(ArrayBuffer);
    });

    it('should have correct type property', () => {
      const s2s = createMockS2SAdapter();
      expect(s2s.type).toBe('s2s');
    });
  });

  describe('Type Composition', () => {
    it('should compose STT → LLM → TTS correctly', async () => {
      const stt = createMockSTTAdapter('hello');
      const llm = createMockLLMAdapter('hi there');
      const tts = createMockTTSAdapter();

      // This chain must type-check correctly
      async function* chain(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
        yield* tts.stream(llm.stream(stt.stream(audio)));
      }

      async function* audioInput(): AsyncIterable<Audio> {
        yield new ArrayBuffer(1600);
      }

      const chunks: Audio[] = [];
      for await (const chunk of chain(audioInput())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toBeInstanceOf(ArrayBuffer);
    });
  });
});
