/**
 * Audio Fixture Loader
 *
 * Loads and streams audio fixtures for testing voice agent pipelines.
 * Provides both sync and async loading patterns, with support for
 * real-time streaming simulation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AudioFixture {
  name: string;
  path: string;
  format: 'wav' | 'webm' | 'mp3';
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationMs: number;
  transcript?: string;
  metadata?: {
    speaker?: string;
    noiseLevel?: 'clean' | 'light' | 'medium' | 'heavy';
    accent?: string;
    language?: string;
    volume?: 'low' | 'normal' | 'high';
  };
}

export interface ConversationFixture {
  name: string;
  description: string;
  turns: ConversationTurn[];
  expectedBehavior: ExpectedBehavior;
}

export interface ConversationTurn {
  role: 'user' | 'agent';
  audioFile: string;
  transcript: string;
  delayBeforeMs?: number;
  isInterruption?: boolean;
  contextRequired?: string[];
}

export interface ExpectedBehavior {
  minTurns: number;
  contextMustBePreserved: string[];
  interruptionHandled?: boolean;
}

export interface StreamOptions {
  chunkDurationMs?: number;
  realtime?: boolean;
  startOffset?: number;
  endOffset?: number;
}

/**
 * Sleep utility for simulating real-time delays
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * AudioFixtureLoader provides methods to load and stream audio test fixtures.
 */
export class AudioFixtureLoader {
  private fixturesDir: string;
  private cache = new Map<string, ArrayBuffer>();
  private metadataCache = new Map<string, AudioFixture>();

  constructor(fixturesDir: string = 'test/fixtures/audio') {
    this.fixturesDir = fixturesDir;
  }

  /**
   * Load a single utterance fixture by name
   */
  async loadUtterance(name: string): Promise<AudioFixture> {
    // Check cache first
    if (this.metadataCache.has(name)) {
      return this.metadataCache.get(name)!;
    }

    const utterancePath = path.join(this.fixturesDir, 'utterances', `${name}.wav`);
    const transcriptPath = path.join(
      this.fixturesDir.replace('/audio', '/transcripts'),
      `${name}.json`
    );

    // Load transcript JSON if it exists
    let transcriptData: any = {};
    try {
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
      transcriptData = JSON.parse(transcriptContent);
    } catch {
      // Transcript file may not exist
    }

    // Get audio file stats
    const stats = await fs.stat(utterancePath);
    const format = path.extname(utterancePath).slice(1) as 'wav' | 'webm' | 'mp3';

    // Calculate duration (assuming 16kHz, 16-bit, mono WAV)
    const sampleRate = transcriptData.sampleRate || 16000;
    const bytesPerSample = (transcriptData.bitDepth || 16) / 8;
    const channels = transcriptData.channels || 1;
    const headerSize = 44; // Standard WAV header
    const audioBytes = stats.size - headerSize;
    const durationMs = (audioBytes / (sampleRate * bytesPerSample * channels)) * 1000;

    const fixture: AudioFixture = {
      name,
      path: utterancePath,
      format,
      sampleRate,
      channels,
      bitDepth: transcriptData.bitDepth || 16,
      durationMs,
      transcript: transcriptData.transcript,
      metadata: transcriptData.metadata,
    };

    this.metadataCache.set(name, fixture);
    return fixture;
  }

  /**
   * Load a conversation fixture by name
   */
  async loadConversation(name: string): Promise<ConversationFixture> {
    const manifestPath = path.join(
      this.fixturesDir,
      'conversations',
      name,
      'manifest.json'
    );

    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    // Resolve audio file paths to absolute paths
    manifest.turns = manifest.turns.map((turn: ConversationTurn) => ({
      ...turn,
      audioFile: path.join(this.fixturesDir, 'conversations', name, turn.audioFile),
    }));

    return manifest;
  }

  /**
   * Load all available utterance fixtures
   */
  async loadAllUtterances(): Promise<AudioFixture[]> {
    const utterancesDir = path.join(this.fixturesDir, 'utterances');
    const files = await fs.readdir(utterancesDir);
    const wavFiles = files.filter(f => f.endsWith('.wav'));

    const fixtures: AudioFixture[] = [];
    for (const file of wavFiles) {
      const name = path.basename(file, '.wav');
      fixtures.push(await this.loadUtterance(name));
    }

    return fixtures;
  }

  /**
   * Load all available conversation fixtures
   */
  async loadAllConversations(): Promise<ConversationFixture[]> {
    const conversationsDir = path.join(this.fixturesDir, 'conversations');
    const dirs = await fs.readdir(conversationsDir, { withFileTypes: true });
    const conversationDirs = dirs.filter(d => d.isDirectory()).map(d => d.name);

    const fixtures: ConversationFixture[] = [];
    for (const dir of conversationDirs) {
      fixtures.push(await this.loadConversation(dir));
    }

    return fixtures;
  }

  /**
   * Load audio buffer from file
   */
  async loadBuffer(filePath: string): Promise<ArrayBuffer> {
    // Check cache
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const buffer = await fs.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    this.cache.set(filePath, arrayBuffer);
    return arrayBuffer;
  }

  /**
   * Stream audio in chunks, simulating real-time input
   */
  async *streamAudio(
    fixture: AudioFixture,
    options: StreamOptions = {}
  ): AsyncIterable<ArrayBuffer> {
    const {
      chunkDurationMs = 100,
      realtime = false,
      startOffset = 0,
      endOffset,
    } = options;

    const buffer = await this.loadBuffer(fixture.path);

    // Skip WAV header (44 bytes)
    const headerSize = 44;
    const audioData = buffer.slice(headerSize);

    // Calculate bytes per chunk
    const bytesPerMs = (fixture.sampleRate * (fixture.bitDepth / 8) * fixture.channels) / 1000;
    const chunkSize = Math.floor(bytesPerMs * chunkDurationMs);

    // Calculate start and end positions
    const startByte = Math.floor(startOffset * bytesPerMs);
    const endByte = endOffset !== undefined
      ? Math.floor(endOffset * bytesPerMs)
      : audioData.byteLength;

    // Stream chunks
    for (let offset = startByte; offset < endByte; offset += chunkSize) {
      const chunk = audioData.slice(offset, Math.min(offset + chunkSize, endByte));

      if (realtime) {
        await sleep(chunkDurationMs);
      }

      yield chunk;
    }
  }

  /**
   * Get total duration of audio file in milliseconds
   */
  async getDuration(fixture: AudioFixture): Promise<number> {
    const buffer = await this.loadBuffer(fixture.path);
    const headerSize = 44;
    const audioBytes = buffer.byteLength - headerSize;
    return (audioBytes / (fixture.sampleRate * (fixture.bitDepth / 8) * fixture.channels)) * 1000;
  }

  /**
   * Clear caches to free memory
   */
  clearCache(): void {
    this.cache.clear();
    this.metadataCache.clear();
  }

  /**
   * Load edge case fixture by name
   */
  async loadEdgeCase(name: string): Promise<AudioFixture> {
    const edgeCasePath = path.join(this.fixturesDir, 'edge-cases', `${name}.wav`);
    const transcriptPath = path.join(
      this.fixturesDir.replace('/audio', '/transcripts'),
      `${name}.json`
    );

    let transcriptData: any = {};
    try {
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
      transcriptData = JSON.parse(transcriptContent);
    } catch {
      // Transcript may not exist
    }

    const stats = await fs.stat(edgeCasePath);
    const sampleRate = transcriptData.sampleRate || 16000;
    const bytesPerSample = (transcriptData.bitDepth || 16) / 8;
    const channels = transcriptData.channels || 1;
    const headerSize = 44;
    const audioBytes = stats.size - headerSize;
    const durationMs = (audioBytes / (sampleRate * bytesPerSample * channels)) * 1000;

    return {
      name,
      path: edgeCasePath,
      format: 'wav',
      sampleRate,
      channels,
      bitDepth: transcriptData.bitDepth || 16,
      durationMs,
      transcript: transcriptData.transcript,
      metadata: transcriptData.metadata,
    };
  }
}

export default AudioFixtureLoader;
