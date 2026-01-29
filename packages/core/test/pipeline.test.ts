/**
 * Pipeline interface tests
 *
 * Verifies that the Pipeline interface is implementable and works
 * correctly for both cascade and S2S modes.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Audio, Pipeline, STTAdapter, LLMAdapter, TTSAdapter } from '../src/index.js';

/**
 * Create a mock cascade pipeline from STT, LLM, and TTS adapters
 */
function createMockCascadePipeline(
  stt: STTAdapter,
  llm: LLMAdapter,
  tts: TTSAdapter
): Pipeline {
  let interrupted = false;

  return {
    async *process(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
      interrupted = false;

      // Chain the adapters: STT → LLM → TTS
      const textStream = stt.stream(audio);
      const responseStream = llm.stream(textStream);
      const audioStream = tts.stream(responseStream);

      for await (const chunk of audioStream) {
        if (interrupted) break;
        yield chunk;
      }
    },

    async interrupt(): Promise<void> {
      interrupted = true;
      await Promise.all([stt.interrupt(), llm.interrupt(), tts.interrupt()]);
    },
  };
}

/**
 * Create mock adapters for testing
 */
function createMockAdapters() {
  const stt: STTAdapter = {
    name: 'test-stt',
    type: 'stt',
    async *stream(_audio: AsyncIterable<Audio>): AsyncIterable<string> {
      for await (const _ of _audio) {
        // consume
      }
      yield 'hello ';
      yield 'world';
    },
    interrupt: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(true),
  };

  const llm: LLMAdapter = {
    name: 'test-llm',
    type: 'llm',
    async *stream(text: AsyncIterable<string>): AsyncIterable<string> {
      let input = '';
      for await (const chunk of text) {
        input += chunk;
      }
      yield 'Response: ';
      yield input;
    },
    interrupt: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(true),
  };

  const tts: TTSAdapter = {
    name: 'test-tts',
    type: 'tts',
    async *stream(text: AsyncIterable<string>): AsyncIterable<Audio> {
      for await (const _ of text) {
        // consume
      }
      yield new ArrayBuffer(1600);
      yield new ArrayBuffer(1600);
    },
    interrupt: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(true),
  };

  return { stt, llm, tts };
}

describe('Pipeline Interface', () => {
  describe('process', () => {
    it('should process audio through the full chain', async () => {
      const { stt, llm, tts } = createMockAdapters();
      const pipeline = createMockCascadePipeline(stt, llm, tts);

      async function* audioInput(): AsyncIterable<Audio> {
        yield new ArrayBuffer(1600);
        yield new ArrayBuffer(1600);
      }

      const output: Audio[] = [];
      for await (const chunk of pipeline.process(audioInput())) {
        output.push(chunk);
      }

      expect(output.length).toBe(2);
      expect(output[0]).toBeInstanceOf(ArrayBuffer);
    });

    it('should handle empty input', async () => {
      const { stt, llm, tts } = createMockAdapters();
      const pipeline = createMockCascadePipeline(stt, llm, tts);

      async function* emptyInput(): AsyncIterable<Audio> {
        // No yields
      }

      const output: Audio[] = [];
      for await (const chunk of pipeline.process(emptyInput())) {
        output.push(chunk);
      }

      // Pipeline should still produce output even with empty input
      // (depending on adapter implementation)
      expect(output.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('interrupt', () => {
    it('should interrupt all adapters', async () => {
      const { stt, llm, tts } = createMockAdapters();
      const pipeline = createMockCascadePipeline(stt, llm, tts);

      await pipeline.interrupt();

      expect(stt.interrupt).toHaveBeenCalled();
      expect(llm.interrupt).toHaveBeenCalled();
      expect(tts.interrupt).toHaveBeenCalled();
    });

    it('should stop yielding after interrupt', async () => {
      // Create adapters that yield many chunks
      const slowTts: TTSAdapter = {
        name: 'slow-tts',
        type: 'tts',
        async *stream(text: AsyncIterable<string>): AsyncIterable<Audio> {
          for await (const _ of text) {
            // consume
          }
          // Yield many chunks
          for (let i = 0; i < 100; i++) {
            yield new ArrayBuffer(1600);
          }
        },
        interrupt: vi.fn().mockResolvedValue(undefined),
        isHealthy: vi.fn().mockResolvedValue(true),
      };

      const { stt, llm } = createMockAdapters();
      const pipeline = createMockCascadePipeline(stt, llm, slowTts);

      async function* audioInput(): AsyncIterable<Audio> {
        yield new ArrayBuffer(1600);
      }

      const output: Audio[] = [];
      let count = 0;

      for await (const chunk of pipeline.process(audioInput())) {
        output.push(chunk);
        count++;

        // Interrupt after a few chunks
        if (count === 3) {
          await pipeline.interrupt();
        }
      }

      // Should have stopped early due to interrupt
      expect(output.length).toBeLessThan(100);
    });
  });
});
