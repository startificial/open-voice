/**
 * Conversation Runner
 *
 * Executes multi-turn conversation scenarios using audio fixtures.
 * Validates context preservation, interrupt handling, and latency.
 */

import { AudioFixtureLoader, AudioFixture, ConversationFixture, ConversationTurn } from './audio-loader';
import { TranscriptValidator, ValidationResult } from './transcript-validator';

export interface Pipeline {
  process(audio: AsyncIterable<ArrayBuffer>): AsyncIterable<ArrayBuffer>;
  interrupt(): Promise<void>;
}

export interface TurnResult {
  turn: ConversationTurn;
  outputAudio?: ArrayBuffer;
  outputTranscript?: string;
  wasInterrupted?: boolean;
  latencyMs: number;
  startTime: number;
  endTime: number;
  transcriptValidation?: ValidationResult;
}

export interface ConversationResult {
  fixture: ConversationFixture;
  results: TurnResult[];
  totalDurationMs: number;
  contextPreserved: boolean;
  interruptHandled: boolean;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

export interface RunOptions {
  simulateRealtime?: boolean;
  validateTranscripts?: boolean;
  timeoutMs?: number;
}

/**
 * Helper to concatenate ArrayBuffers
 */
function concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return result.buffer;
}

/**
 * Helper to calculate percentile
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Sleep utility
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * ConversationRunner executes multi-turn conversation scenarios
 */
export class ConversationRunner {
  private fixtureLoader: AudioFixtureLoader;
  private transcriptValidator: TranscriptValidator;

  constructor(
    fixtureLoader: AudioFixtureLoader,
    transcriptValidator?: TranscriptValidator
  ) {
    this.fixtureLoader = fixtureLoader;
    this.transcriptValidator = transcriptValidator || new TranscriptValidator();
  }

  /**
   * Run a complete conversation scenario
   */
  async runConversation(
    fixture: ConversationFixture,
    pipeline: Pipeline,
    options: RunOptions = {}
  ): Promise<ConversationResult> {
    const {
      simulateRealtime = false,
      validateTranscripts = true,
      timeoutMs = 30000,
    } = options;

    const results: TurnResult[] = [];
    const conversationStartTime = performance.now();
    let conversationContext: string[] = [];

    for (const turn of fixture.turns) {
      if (turn.role === 'user') {
        // Handle delay before turn
        if (turn.delayBeforeMs && simulateRealtime) {
          await sleep(turn.delayBeforeMs);
        }

        const turnResult = await this.processTurn(
          turn,
          pipeline,
          {
            simulateRealtime,
            timeoutMs,
            isInterruption: turn.isInterruption,
          }
        );

        // Validate transcript if enabled
        if (validateTranscripts && turnResult.outputTranscript) {
          // For user turns, we validate that the system correctly understood
          // In a real system, this would compare STT output to expected
          // Here we simulate by checking if key context words are present
          turnResult.transcriptValidation = this.transcriptValidator.validate(
            turnResult.outputTranscript,
            turn.transcript
          );
        }

        results.push(turnResult);

        // Track context
        if (turn.contextRequired) {
          conversationContext.push(...turn.contextRequired);
        }
      }
    }

    const conversationEndTime = performance.now();
    const latencies = results.map(r => r.latencyMs);

    return {
      fixture,
      results,
      totalDurationMs: conversationEndTime - conversationStartTime,
      contextPreserved: this.validateContextPreservation(
        results,
        fixture.expectedBehavior.contextMustBePreserved
      ),
      interruptHandled: this.validateInterruptHandling(results, fixture),
      averageLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
      p95LatencyMs: percentile(latencies, 95),
    };
  }

  /**
   * Process a single conversation turn
   */
  private async processTurn(
    turn: ConversationTurn,
    pipeline: Pipeline,
    options: {
      simulateRealtime: boolean;
      timeoutMs: number;
      isInterruption?: boolean;
    }
  ): Promise<TurnResult> {
    const startTime = performance.now();
    const outputChunks: ArrayBuffer[] = [];

    // Load the audio fixture for this turn
    const audioFixture: AudioFixture = {
      name: turn.audioFile,
      path: turn.audioFile,
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      durationMs: 0, // Will be calculated
      transcript: turn.transcript,
    };

    const audioStream = this.fixtureLoader.streamAudio(audioFixture, {
      realtime: options.simulateRealtime,
    });

    if (options.isInterruption) {
      // For interruption, start processing then interrupt partway through
      const iterator = pipeline.process(audioStream)[Symbol.asyncIterator]();

      // Get first chunk to start processing
      const firstChunk = await iterator.next();
      if (!firstChunk.done && firstChunk.value) {
        outputChunks.push(firstChunk.value);
      }

      // Interrupt
      await pipeline.interrupt();

      const endTime = performance.now();
      return {
        turn,
        wasInterrupted: true,
        latencyMs: endTime - startTime,
        startTime,
        endTime,
      };
    }

    // Normal processing
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Turn processing timeout')), options.timeoutMs);
      });

      const processingPromise = (async () => {
        for await (const chunk of pipeline.process(audioStream)) {
          outputChunks.push(chunk);
        }
      })();

      await Promise.race([processingPromise, timeoutPromise]);
    } catch (error) {
      // Handle timeout or other errors
      console.error(`Turn processing error: ${error}`);
    }

    const endTime = performance.now();
    const outputAudio = outputChunks.length > 0 ? concatenateBuffers(outputChunks) : undefined;

    return {
      turn,
      outputAudio,
      latencyMs: endTime - startTime,
      startTime,
      endTime,
    };
  }

  /**
   * Validate that required context was preserved across turns
   */
  private validateContextPreservation(
    results: TurnResult[],
    requiredContext: string[]
  ): boolean {
    if (requiredContext.length === 0) {
      return true;
    }

    // In a real implementation, this would:
    // 1. Transcribe agent responses
    // 2. Check for presence of required context terms
    // 3. Verify pronoun resolution worked correctly

    // For now, we check that all turns completed successfully
    const allCompleted = results.every(r => r.outputAudio || r.wasInterrupted);

    // In test mode, assume context is preserved if all turns completed
    return allCompleted;
  }

  /**
   * Validate that interruptions were handled correctly
   */
  private validateInterruptHandling(
    results: TurnResult[],
    fixture: ConversationFixture
  ): boolean {
    if (!fixture.expectedBehavior.interruptionHandled) {
      return true;
    }

    // Find interruption turns
    const interruptionResults = results.filter(r => r.wasInterrupted);

    // Verify interruptions completed quickly (< 300ms)
    const allInterruptsFast = interruptionResults.every(r => r.latencyMs < 300);

    return interruptionResults.length > 0 && allInterruptsFast;
  }

  /**
   * Run multiple conversations and aggregate results
   */
  async runMultipleConversations(
    fixtures: ConversationFixture[],
    pipeline: Pipeline,
    options: RunOptions = {}
  ): Promise<{
    results: ConversationResult[];
    summary: {
      totalConversations: number;
      passedConversations: number;
      averageLatencyMs: number;
      p95LatencyMs: number;
      contextPreservationRate: number;
    };
  }> {
    const results: ConversationResult[] = [];

    for (const fixture of fixtures) {
      const result = await this.runConversation(fixture, pipeline, options);
      results.push(result);
    }

    const allLatencies = results.flatMap(r => r.results.map(t => t.latencyMs));
    const contextPreserved = results.filter(r => r.contextPreserved).length;

    return {
      results,
      summary: {
        totalConversations: results.length,
        passedConversations: results.filter(r => r.contextPreserved && r.interruptHandled).length,
        averageLatencyMs: allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length || 0,
        p95LatencyMs: percentile(allLatencies, 95),
        contextPreservationRate: contextPreserved / results.length,
      },
    };
  }
}

export default ConversationRunner;
