/**
 * Audio Recorder
 *
 * Utility for recording new audio fixtures.
 * Supports browser-based recording and Node.js file-based recording.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface RecordingOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}

export interface FixtureMetadata {
  name: string;
  transcript: string;
  speaker?: string;
  noiseLevel?: 'clean' | 'light' | 'medium' | 'heavy';
  accent?: string;
  language?: string;
  recordedAt?: string;
  notes?: string;
}

/**
 * WAV file header utilities
 */
class WavUtils {
  /**
   * Create a WAV file header
   */
  static createHeader(
    dataLength: number,
    sampleRate: number = 16000,
    channels: number = 1,
    bitDepth: number = 16
  ): ArrayBuffer {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    return header;
  }

  /**
   * Write a string to a DataView
   */
  private static writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Convert Float32Array samples to Int16Array
   */
  static floatToInt16(samples: Float32Array): Int16Array {
    const output = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  /**
   * Create a complete WAV buffer from samples
   */
  static createWavBuffer(
    samples: Float32Array | Int16Array,
    sampleRate: number = 16000,
    channels: number = 1
  ): ArrayBuffer {
    // Convert to Int16 if needed
    const int16Samples = samples instanceof Float32Array
      ? this.floatToInt16(samples)
      : samples;

    const dataLength = int16Samples.length * 2;
    const header = this.createHeader(dataLength, sampleRate, channels, 16);

    // Combine header and data
    const wavBuffer = new ArrayBuffer(44 + dataLength);
    const wavView = new Uint8Array(wavBuffer);
    wavView.set(new Uint8Array(header), 0);
    wavView.set(new Uint8Array(int16Samples.buffer), 44);

    return wavBuffer;
  }
}

/**
 * FixtureRecorder provides utilities for creating new audio fixtures
 */
export class FixtureRecorder {
  private fixturesDir: string;

  constructor(fixturesDir: string = 'test/fixtures/audio') {
    this.fixturesDir = fixturesDir;
  }

  /**
   * Save audio samples as a WAV fixture file
   */
  async saveFixture(
    samples: Float32Array | Int16Array,
    metadata: FixtureMetadata,
    options: RecordingOptions = {}
  ): Promise<string> {
    const {
      sampleRate = 16000,
      channels = 1,
    } = options;

    // Create WAV buffer
    const wavBuffer = WavUtils.createWavBuffer(samples, sampleRate, channels);

    // Determine output path
    const outputDir = path.join(this.fixturesDir, 'utterances');
    const outputPath = path.join(outputDir, `${metadata.name}.wav`);

    // Ensure directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Write WAV file
    await fs.writeFile(outputPath, Buffer.from(wavBuffer));

    // Save metadata
    const metadataPath = path.join(
      this.fixturesDir.replace('/audio', '/transcripts'),
      `${metadata.name}.json`
    );
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });

    const fullMetadata = {
      name: metadata.name,
      transcript: metadata.transcript,
      sampleRate,
      channels,
      bitDepth: 16,
      format: 'wav',
      metadata: {
        speaker: metadata.speaker,
        noiseLevel: metadata.noiseLevel,
        accent: metadata.accent,
        language: metadata.language,
        recordedAt: metadata.recordedAt || new Date().toISOString(),
        notes: metadata.notes,
      },
    };

    await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

    return outputPath;
  }

  /**
   * Save a conversation fixture
   */
  async saveConversation(
    name: string,
    description: string,
    turns: Array<{
      role: 'user' | 'agent';
      samples: Float32Array | Int16Array;
      transcript: string;
      delayBeforeMs?: number;
      isInterruption?: boolean;
      contextRequired?: string[];
    }>,
    expectedBehavior: {
      minTurns: number;
      contextMustBePreserved: string[];
      interruptionHandled?: boolean;
    },
    options: RecordingOptions = {}
  ): Promise<string> {
    const { sampleRate = 16000, channels = 1 } = options;

    const convDir = path.join(this.fixturesDir, 'conversations', name);
    await fs.mkdir(convDir, { recursive: true });

    const manifestTurns: any[] = [];

    // Save each turn's audio
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const audioFileName = `${String(i + 1).padStart(2, '0')}-${turn.role}-turn.wav`;

      // Create WAV buffer
      const wavBuffer = WavUtils.createWavBuffer(turn.samples, sampleRate, channels);

      // Write audio file
      const audioPath = path.join(convDir, audioFileName);
      await fs.writeFile(audioPath, Buffer.from(wavBuffer));

      manifestTurns.push({
        role: turn.role,
        audioFile: audioFileName,
        transcript: turn.transcript,
        ...(turn.delayBeforeMs !== undefined && { delayBeforeMs: turn.delayBeforeMs }),
        ...(turn.isInterruption !== undefined && { isInterruption: turn.isInterruption }),
        contextRequired: turn.contextRequired || [],
      });
    }

    // Save manifest
    const manifest = {
      name,
      description,
      turns: manifestTurns,
      expectedBehavior,
    };

    const manifestPath = path.join(convDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Also save to transcripts directory
    const transcriptsDir = this.fixturesDir.replace('/audio', '/transcripts/conversations');
    await fs.mkdir(transcriptsDir, { recursive: true });
    await fs.writeFile(
      path.join(transcriptsDir, `${name}.json`),
      JSON.stringify(manifest, null, 2)
    );

    return convDir;
  }

  /**
   * Generate silence audio samples
   */
  generateSilence(durationMs: number, sampleRate: number = 16000): Float32Array {
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    return new Float32Array(numSamples);
  }

  /**
   * Generate a tone for testing
   */
  generateTone(
    frequency: number,
    durationMs: number,
    sampleRate: number = 16000,
    amplitude: number = 0.5
  ): Float32Array {
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }

    return samples;
  }

  /**
   * Add noise to samples
   */
  addNoise(samples: Float32Array, noiseLevel: number = 0.1): Float32Array {
    const noisySamples = new Float32Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const noise = (Math.random() * 2 - 1) * noiseLevel;
      noisySamples[i] = Math.max(-1, Math.min(1, samples[i] + noise));
    }

    return noisySamples;
  }

  /**
   * Concatenate multiple sample arrays with optional silence gaps
   */
  concatenate(
    sampleArrays: Float32Array[],
    silenceBetweenMs: number = 0,
    sampleRate: number = 16000
  ): Float32Array {
    const silenceSamples = Math.floor((sampleRate * silenceBetweenMs) / 1000);
    const totalLength = sampleArrays.reduce(
      (sum, arr) => sum + arr.length,
      0
    ) + silenceSamples * (sampleArrays.length - 1);

    const result = new Float32Array(totalLength);
    let offset = 0;

    for (let i = 0; i < sampleArrays.length; i++) {
      result.set(sampleArrays[i], offset);
      offset += sampleArrays[i].length;

      if (i < sampleArrays.length - 1 && silenceBetweenMs > 0) {
        // Silence is already zeros
        offset += silenceSamples;
      }
    }

    return result;
  }
}

/**
 * Browser-based audio recorder (for use in browser environments)
 * Note: This class is designed for browser use and won't work in Node.js
 */
export class BrowserAudioRecorder {
  private mediaRecorder: any | null = null;
  private chunks: Blob[] = [];
  private stream: any | null = null;

  /**
   * Check if recording is supported
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia !== 'undefined';
  }

  /**
   * Start recording audio
   */
  async startRecording(options: RecordingOptions = {}): Promise<void> {
    if (!BrowserAudioRecorder.isSupported()) {
      throw new Error('Audio recording not supported in this environment');
    }

    const {
      sampleRate = 16000,
      noiseSuppression = false,
      echoCancellation = true,
      autoGainControl = true,
    } = options;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate,
        channelCount: 1,
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      },
    });

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (e: any) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100); // Collect in 100ms chunks
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.onerror = (e: any) => {
        this.cleanup();
        reject(e);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track: any) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }
}

export { WavUtils };
export default FixtureRecorder;
