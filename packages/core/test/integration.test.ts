/**
 * Integration tests with M0 audio fixtures
 *
 * Tests that mock adapters can consume real audio from the test fixtures.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Audio, STTAdapter, LLMAdapter, TTSAdapter } from '../src/index.js';

// Path to fixtures relative to project root
const FIXTURES_DIR = path.resolve(__dirname, '../../../test/fixtures');
const AUDIO_DIR = path.join(FIXTURES_DIR, 'audio/utterances');
const UTTERANCES_DIR = path.join(FIXTURES_DIR, 'utterances');

interface AudioFixture {
  name: string;
  path: string;
  buffer: ArrayBuffer;
  transcript?: string;
}

/**
 * Simplified fixture loader for tests
 */
async function loadFixture(name: string): Promise<AudioFixture | null> {
  // Try multiple possible paths
  const possiblePaths = [
    path.join(AUDIO_DIR, `${name}.wav`),
    path.join(UTTERANCES_DIR, `${name}.wav`),
  ];

  for (const audioPath of possiblePaths) {
    try {
      const buffer = await fs.readFile(audioPath);
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );

      // Try to load transcript
      let transcript: string | undefined;
      const transcriptPath = audioPath.replace('.wav', '.json');
      try {
        const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
        const data = JSON.parse(transcriptContent);
        transcript = data.transcript;
      } catch {
        // Transcript may not exist
      }

      return {
        name,
        path: audioPath,
        buffer: arrayBuffer,
        transcript,
      };
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Stream audio in chunks
 */
async function* streamAudio(
  buffer: ArrayBuffer,
  chunkSize: number = 3200
): AsyncIterable<Audio> {
  // Skip WAV header (44 bytes)
  const headerSize = 44;
  const audioData = buffer.slice(headerSize);

  for (let offset = 0; offset < audioData.byteLength; offset += chunkSize) {
    yield audioData.slice(offset, Math.min(offset + chunkSize, audioData.byteLength));
  }
}

/**
 * Mock STT that counts chunks and returns a canned response
 */
function createCountingSTTAdapter(): STTAdapter & { chunkCount: number } {
  const adapter = {
    name: 'counting-stt',
    type: 'stt' as const,
    chunkCount: 0,

    async *stream(input: AsyncIterable<Audio>): AsyncIterable<string> {
      adapter.chunkCount = 0;
      let totalBytes = 0;

      for await (const chunk of input) {
        adapter.chunkCount++;
        totalBytes += chunk.byteLength;
      }

      // Yield a response based on data received
      yield `Received ${adapter.chunkCount} chunks, `;
      yield `${totalBytes} bytes total`;
    },

    async interrupt(): Promise<void> {},
    async isHealthy(): Promise<boolean> {
      return true;
    },
  };

  return adapter;
}

/**
 * Mock LLM that echoes and transforms input
 */
function createEchoLLMAdapter(): LLMAdapter {
  return {
    name: 'echo-llm',
    type: 'llm',

    async *stream(input: AsyncIterable<string>): AsyncIterable<string> {
      let fullInput = '';
      for await (const chunk of input) {
        fullInput += chunk;
      }
      yield `LLM received: "${fullInput}"`;
    },

    async interrupt(): Promise<void> {},
    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Mock TTS that produces silent audio proportional to text length
 */
function createSilentTTSAdapter(): TTSAdapter {
  return {
    name: 'silent-tts',
    type: 'tts',

    async *stream(input: AsyncIterable<string>): AsyncIterable<Audio> {
      let fullText = '';
      for await (const chunk of input) {
        fullText += chunk;
      }

      // Produce ~100ms of audio per 10 characters
      const chunkCount = Math.max(1, Math.ceil(fullText.length / 10));
      for (let i = 0; i < chunkCount; i++) {
        yield new ArrayBuffer(1600); // 100ms at 16kHz, 16-bit mono
      }
    },

    async interrupt(): Promise<void> {},
    async isHealthy(): Promise<boolean> {
      return true;
    },
  };
}

describe('M0 Fixture Integration', () => {
  let helloWorldFixture: AudioFixture | null;

  beforeAll(async () => {
    helloWorldFixture = await loadFixture('hello-world');
  });

  describe('Fixture Loading', () => {
    it('should load hello-world fixture', () => {
      expect(helloWorldFixture).not.toBeNull();
      expect(helloWorldFixture!.buffer.byteLength).toBeGreaterThan(44); // More than just header
    });

    it('should have audio data in the buffer', () => {
      expect(helloWorldFixture).not.toBeNull();
      const buffer = helloWorldFixture!.buffer;

      // Check for WAV header signature "RIFF"
      const view = new DataView(buffer);
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');
    });
  });

  describe('STT Adapter with Real Audio', () => {
    it('should process audio chunks from fixture', async () => {
      expect(helloWorldFixture).not.toBeNull();

      const stt = createCountingSTTAdapter();
      const audioStream = streamAudio(helloWorldFixture!.buffer);

      const output: string[] = [];
      for await (const text of stt.stream(audioStream)) {
        output.push(text);
      }

      expect(output.length).toBeGreaterThan(0);
      expect(stt.chunkCount).toBeGreaterThan(0);
    });

    it('should handle different chunk sizes', async () => {
      expect(helloWorldFixture).not.toBeNull();

      const stt = createCountingSTTAdapter();

      // Small chunks (100ms equivalent)
      const smallChunkStream = streamAudio(helloWorldFixture!.buffer, 1600);
      for await (const _ of stt.stream(smallChunkStream)) {
        // consume
      }
      const smallChunkCount = stt.chunkCount;

      // Large chunks (500ms equivalent)
      const largeChunkStream = streamAudio(helloWorldFixture!.buffer, 8000);
      for await (const _ of stt.stream(largeChunkStream)) {
        // consume
      }
      const largeChunkCount = stt.chunkCount;

      expect(smallChunkCount).toBeGreaterThan(largeChunkCount);
    });
  });

  describe('Full Pipeline with Real Audio', () => {
    it('should chain STT → LLM → TTS with real audio input', async () => {
      expect(helloWorldFixture).not.toBeNull();

      const stt = createCountingSTTAdapter();
      const llm = createEchoLLMAdapter();
      const tts = createSilentTTSAdapter();

      // Chain: audio → STT → LLM → TTS → audio
      async function* chain(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
        yield* tts.stream(llm.stream(stt.stream(audio)));
      }

      const audioStream = streamAudio(helloWorldFixture!.buffer);
      const output: Audio[] = [];

      for await (const chunk of chain(audioStream)) {
        output.push(chunk);
      }

      expect(output.length).toBeGreaterThan(0);
      expect(output[0]).toBeInstanceOf(ArrayBuffer);
      expect(stt.chunkCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small audio input', async () => {
      const stt = createCountingSTTAdapter();

      async function* tinyAudio(): AsyncIterable<Audio> {
        yield new ArrayBuffer(100); // Very small chunk
      }

      const output: string[] = [];
      for await (const text of stt.stream(tinyAudio())) {
        output.push(text);
      }

      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle empty audio stream', async () => {
      const stt = createCountingSTTAdapter();

      async function* emptyAudio(): AsyncIterable<Audio> {
        // No yields
      }

      const output: string[] = [];
      for await (const text of stt.stream(emptyAudio())) {
        output.push(text);
      }

      expect(stt.chunkCount).toBe(0);
    });
  });
});
