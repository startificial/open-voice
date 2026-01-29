/**
 * Voice Agent Test Harness
 *
 * Comprehensive testing utilities for voice agent pipelines.
 * Provides audio loading, streaming, validation, and comparison tools.
 */

// Audio Fixture Loading
export {
  AudioFixtureLoader,
  type AudioFixture,
  type ConversationFixture,
  type ConversationTurn,
  type ExpectedBehavior,
  type StreamOptions,
} from './audio-loader';

// Transcript Validation
export {
  TranscriptValidator,
  type ValidationOptions,
  type ValidationResult,
  type Difference,
} from './transcript-validator';

// Conversation Runner
export {
  ConversationRunner,
  type Pipeline,
  type TurnResult,
  type ConversationResult,
  type RunOptions,
} from './conversation-runner';

// Latency Measurement
export {
  LatencyMeasurer,
  type LatencyMetrics,
  type ComponentMetrics,
  type LatencyMark,
  type LatencyReport,
  type StatsSummary,
} from './latency-measurer';

// Audio Comparison
export {
  AudioComparator,
  type ComparisonResult,
  type ComparisonOptions,
} from './audio-comparator';

// Audio Recording
export {
  FixtureRecorder,
  BrowserAudioRecorder,
  WavUtils,
  type RecordingOptions,
  type FixtureMetadata,
} from './audio-recorder';

/**
 * Create a fully configured test harness
 */
export function createTestHarness(options: {
  fixturesDir?: string;
} = {}) {
  const { fixturesDir = 'test/fixtures/audio' } = options;

  const fixtureLoader = new AudioFixtureLoader(fixturesDir);
  const transcriptValidator = new TranscriptValidator();
  const conversationRunner = new ConversationRunner(fixtureLoader, transcriptValidator);
  const latencyMeasurer = new LatencyMeasurer();
  const audioComparator = new AudioComparator();
  const fixtureRecorder = new FixtureRecorder(fixturesDir);

  return {
    fixtureLoader,
    transcriptValidator,
    conversationRunner,
    latencyMeasurer,
    audioComparator,
    fixtureRecorder,
  };
}

// Re-export for convenience
import { AudioFixtureLoader } from './audio-loader';
import { TranscriptValidator } from './transcript-validator';
import { ConversationRunner } from './conversation-runner';
import { LatencyMeasurer } from './latency-measurer';
import { AudioComparator } from './audio-comparator';
import { FixtureRecorder, BrowserAudioRecorder, WavUtils } from './audio-recorder';
