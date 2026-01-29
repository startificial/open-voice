# Voice Agent Architecture: Senior Engineer's Implementation Breakdown

## Dependency Graph Overview

```
M0: Test Audio Fixtures
       │
       ▼
M1: Core Interfaces
       │
       ├──────────────────┬─────────────────┐
       ▼                  ▼                 ▼
M2: First Adapters   M3: Pipelines    M4: Registry
       │                  │                 │
       └──────────────────┼─────────────────┘
                          ▼
                    M5: VoiceSession
                          │
                          ▼
                    M6: WebSocket Server
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
M7: useVoiceAgent   M8: UI Components   M9: Additional Adapters
       │                  │
       └──────────────────┘
                          ▼
                    M10: Integration & Deployment
```

---

## Milestone 0: Test Audio Fixtures & Harness

**What we're building:** A comprehensive library of real audio files and tooling for deterministic, repeatable testing across all milestones.

**Why this comes first:** Every subsequent milestone needs realistic audio input for meaningful tests. Mock audio streams that generate silence or synthetic waveforms won't catch real-world issues like background noise handling, varying speech patterns, or codec edge cases. Building this foundation first means:
- Adapters can be tested against known inputs with expected outputs
- Pipeline tests can verify actual audio flows correctly through the chain
- E2E tests can simulate real conversations with follow-ups
- Regression testing becomes possible when providers change behavior

**Files:**
```
test/
├── fixtures/
│   ├── audio/
│   │   ├── utterances/           # Single speech segments
│   │   │   ├── hello-world.wav   # Simple, clear speech
│   │   │   ├── hello-world.webm  # Same content, different codec
│   │   │   ├── quick-question.wav
│   │   │   ├── long-explanation.wav
│   │   │   ├── whispered.wav     # Edge case: low volume
│   │   │   ├── noisy-background.wav
│   │   │   ├── accented-speech.wav
│   │   │   └── multiple-speakers.wav
│   │   │
│   │   ├── conversations/        # Multi-turn sequences
│   │   │   ├── greeting-flow/
│   │   │   │   ├── manifest.json
│   │   │   │   ├── 01-user-hello.wav
│   │   │   │   ├── 02-agent-response.wav  # Expected TTS output reference
│   │   │   │   ├── 03-user-followup.wav
│   │   │   │   └── 04-agent-response.wav
│   │   │   │
│   │   │   ├── customer-service/
│   │   │   │   ├── manifest.json
│   │   │   │   ├── 01-user-complaint.wav
│   │   │   │   ├── 02-user-provides-details.wav
│   │   │   │   └── 03-user-confirms.wav
│   │   │   │
│   │   │   ├── interruption-flow/
│   │   │   │   ├── manifest.json
│   │   │   │   ├── 01-user-starts.wav
│   │   │   │   ├── 02-user-interrupts-midway.wav  # Tests interrupt handling
│   │   │   │   └── 03-user-continues.wav
│   │   │   │
│   │   │   └── context-dependent/
│   │   │       ├── manifest.json
│   │   │       ├── 01-user-sets-context.wav      # "I'm planning a trip to Paris"
│   │   │       ├── 02-user-followup.wav          # "What's the weather like there?"
│   │   │       └── 03-user-another-followup.wav  # "And good restaurants?"
│   │   │
│   │   └── edge-cases/
│   │       ├── silence-3s.wav
│   │       ├── silence-then-speech.wav
│   │       ├── speech-then-silence.wav
│   │       ├── very-short-utterance.wav    # "Yes"
│   │       ├── very-long-utterance.wav     # 60+ seconds
│   │       ├── non-english-spanish.wav
│   │       └── numbers-and-spelling.wav    # "My number is 555-1234"
│   │
│   └── transcripts/              # Ground truth for STT validation
│       ├── hello-world.json
│       ├── quick-question.json
│       └── conversations/
│           └── greeting-flow.json
│
├── harness/
│   ├── audio-loader.ts           # Load and stream fixtures
│   ├── audio-recorder.ts         # Capture new fixtures
│   ├── conversation-runner.ts    # Execute multi-turn scenarios
│   ├── transcript-validator.ts   # Compare STT output to ground truth
│   ├── latency-measurer.ts       # Precise timing instrumentation
│   └── audio-comparator.ts       # Compare TTS output similarity
│
└── generators/
    ├── synthetic-audio.ts        # Generate test patterns
    └── noise-injector.ts         # Add background noise to clean audio
```

**Implementation approach:**

```typescript
// test/harness/audio-loader.ts
export interface AudioFixture {
  name: string;
  path: string;
  format: 'wav' | 'webm' | 'mp3';
  sampleRate: number;
  durationMs: number;
  transcript?: string;  // Ground truth if available
  metadata?: {
    speaker?: string;
    noiseLevel?: 'clean' | 'light' | 'heavy';
    accent?: string;
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
  delayBeforeMs?: number;  // Simulate natural pauses
  isInterruption?: boolean;
  contextRequired?: string[];  // What context from prior turns is needed
}

export interface ExpectedBehavior {
  minTurns: number;
  contextMustBePreserved: string[];  // Key info that must persist
  interruptionHandled?: boolean;
}

export class AudioFixtureLoader {
  private fixturesDir: string;
  private cache = new Map<string, ArrayBuffer>();

  constructor(fixturesDir: string = 'test/fixtures/audio') {
    this.fixturesDir = fixturesDir;
  }

  async loadUtterance(name: string): Promise<AudioFixture> {
    const manifest = await this.loadManifest(`utterances/${name}`);
    return {
      ...manifest,
      path: path.join(this.fixturesDir, 'utterances', manifest.filename),
    };
  }

  async loadConversation(name: string): Promise<ConversationFixture> {
    const manifestPath = path.join(
      this.fixturesDir, 
      'conversations', 
      name, 
      'manifest.json'
    );
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    
    // Resolve all audio file paths
    manifest.turns = manifest.turns.map((turn: ConversationTurn) => ({
      ...turn,
      audioFile: path.join(this.fixturesDir, 'conversations', name, turn.audioFile),
    }));
    
    return manifest;
  }

  // Stream audio in chunks, simulating real-time input
  async *streamAudio(
    fixture: AudioFixture, 
    options: StreamOptions = {}
  ): AsyncIterable<ArrayBuffer> {
    const { 
      chunkDurationMs = 100,  // 100ms chunks typical for real-time
      realtime = false,       // If true, actually wait between chunks
    } = options;
    
    const buffer = await this.loadBuffer(fixture.path);
    const bytesPerMs = (fixture.sampleRate * 2) / 1000;  // 16-bit audio
    const chunkSize = Math.floor(bytesPerMs * chunkDurationMs);
    
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      const chunk = buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength));
      
      if (realtime) {
        await sleep(chunkDurationMs);
      }
      
      yield chunk;
    }
  }
}

// test/harness/conversation-runner.ts
export class ConversationRunner {
  constructor(
    private fixtureLoader: AudioFixtureLoader,
    private pipeline: Pipeline,
  ) {}

  async runConversation(
    fixture: ConversationFixture,
    options: RunOptions = {}
  ): Promise<ConversationResult> {
    const results: TurnResult[] = [];
    let conversationContext: any = {};

    for (const turn of fixture.turns) {
      if (turn.role === 'user') {
        const audioStream = this.fixtureLoader.streamAudio(
          { path: turn.audioFile } as AudioFixture,
          { realtime: options.simulateRealtime }
        );

        if (turn.delayBeforeMs) {
          await sleep(turn.delayBeforeMs);
        }

        const startTime = performance.now();
        const outputChunks: ArrayBuffer[] = [];
        
        if (turn.isInterruption) {
          // Start processing, then interrupt partway through
          const iterator = this.pipeline.process(audioStream)[Symbol.asyncIterator]();
          await iterator.next();  // Get first chunk
          await this.pipeline.interrupt();
          results.push({
            turn,
            wasInterrupted: true,
            latencyMs: performance.now() - startTime,
          });
        } else {
          for await (const chunk of this.pipeline.process(audioStream)) {
            outputChunks.push(chunk);
          }
          
          results.push({
            turn,
            outputAudio: concatenateBuffers(outputChunks),
            latencyMs: performance.now() - startTime,
          });
        }
      }
    }

    return {
      fixture,
      results,
      contextPreserved: this.validateContextPreservation(
        results, 
        fixture.expectedBehavior.contextMustBePreserved
      ),
    };
  }

  private validateContextPreservation(
    results: TurnResult[], 
    requiredContext: string[]
  ): boolean {
    // Analyze agent responses to verify context was maintained
    // This would involve STT on agent output + checking for key terms
    return true; // Simplified
  }
}

// test/harness/transcript-validator.ts
export class TranscriptValidator {
  // Compare STT output against ground truth
  validate(
    actual: string, 
    expected: string, 
    options: ValidationOptions = {}
  ): ValidationResult {
    const { 
      wordErrorRateThreshold = 0.1,  // Allow 10% WER
      allowSynonyms = true,
      caseSensitive = false,
    } = options;

    const actualNormalized = this.normalize(actual, caseSensitive);
    const expectedNormalized = this.normalize(expected, caseSensitive);
    
    const wer = this.calculateWordErrorRate(actualNormalized, expectedNormalized);
    
    return {
      pass: wer <= wordErrorRateThreshold,
      wordErrorRate: wer,
      actual: actualNormalized,
      expected: expectedNormalized,
      differences: this.findDifferences(actualNormalized, expectedNormalized),
    };
  }

  private calculateWordErrorRate(actual: string, expected: string): number {
    const actualWords = actual.split(/\s+/);
    const expectedWords = expected.split(/\s+/);
    
    // Levenshtein distance at word level
    const distance = this.levenshteinDistance(actualWords, expectedWords);
    return distance / expectedWords.length;
  }
}
```

**Conversation manifest format:**

```json
// test/fixtures/audio/conversations/context-dependent/manifest.json
{
  "name": "context-dependent",
  "description": "Tests that agent maintains context across turns for pronoun resolution and implicit references",
  "turns": [
    {
      "role": "user",
      "audioFile": "01-user-sets-context.wav",
      "transcript": "I'm planning a trip to Paris next month",
      "contextRequired": []
    },
    {
      "role": "agent",
      "transcript": "Paris is wonderful in [month]. What aspects of your trip can I help with?",
      "contextRequired": ["Paris", "next month"]
    },
    {
      "role": "user",
      "audioFile": "02-user-followup.wav",
      "transcript": "What's the weather like there?",
      "delayBeforeMs": 500,
      "contextRequired": ["Paris"]
    },
    {
      "role": "agent",
      "transcript": "In [month], Paris typically...",
      "contextRequired": ["Paris", "month from turn 1"]
    },
    {
      "role": "user",
      "audioFile": "03-user-another-followup.wav",
      "transcript": "And good restaurants?",
      "delayBeforeMs": 300,
      "contextRequired": ["Paris"]
    }
  ],
  "expectedBehavior": {
    "minTurns": 5,
    "contextMustBePreserved": ["Paris", "trip planning", "time of visit"],
    "interruptionHandled": false
  }
}
```

**Recording new fixtures:**

```typescript
// test/harness/audio-recorder.ts
export class FixtureRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async startRecording(options: RecordingOptions = {}): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: options.sampleRate ?? 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: options.noiseSupression ?? false,  // Sometimes want raw
      } 
    });
    
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };
    
    this.mediaRecorder.start(100);  // Collect in 100ms chunks
  }

  async stopAndSave(outputPath: string, metadata: FixtureMetadata): Promise<void> {
    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        
        // Convert to WAV for consistency
        const wavBuffer = await this.convertToWav(blob);
        await fs.writeFile(outputPath, Buffer.from(wavBuffer));
        
        // Save metadata alongside
        const metadataPath = outputPath.replace(/\.\w+$/, '.json');
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        
        resolve();
      };
      
      this.mediaRecorder!.stop();
    });
  }
}

// CLI tool for recording fixtures
// npx ts-node test/generators/record-fixture.ts --name "greeting" --transcript "Hello, how are you?"
```

**Completion criteria:**
- [ ] Minimum 10 single utterance fixtures covering: clear speech, noisy, accented, short, long
- [ ] Minimum 3 multi-turn conversation fixtures covering: basic flow, context preservation, interruption
- [ ] Ground truth transcripts for all utterances
- [ ] Audio loader streams chunks at configurable rates
- [ ] Conversation runner executes multi-turn scenarios
- [ ] Transcript validator computes word error rate
- [ ] Recording tool allows easy creation of new fixtures
- [ ] All fixtures in consistent format (16kHz, 16-bit, mono WAV)
- [ ] Documentation on how to create new fixtures

**Verification:**

```typescript
describe('Audio Fixtures', () => {
  const loader = new AudioFixtureLoader();

  it('loads and streams utterance fixtures', async () => {
    const fixture = await loader.loadUtterance('hello-world');
    
    expect(fixture.durationMs).toBeGreaterThan(500);
    expect(fixture.transcript).toBe('Hello world');
    
    const chunks: ArrayBuffer[] = [];
    for await (const chunk of loader.streamAudio(fixture)) {
      chunks.push(chunk);
    }
    
    const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it('loads conversation with context dependencies', async () => {
    const conversation = await loader.loadConversation('context-dependent');
    
    expect(conversation.turns.length).toBeGreaterThanOrEqual(3);
    expect(conversation.turns[1].contextRequired).toContain('Paris');
    expect(conversation.expectedBehavior.contextMustBePreserved).toContain('Paris');
  });
});

describe('Transcript Validator', () => {
  const validator = new TranscriptValidator();

  it('passes for exact match', () => {
    const result = validator.validate('hello world', 'Hello World');
    expect(result.pass).toBe(true);
    expect(result.wordErrorRate).toBe(0);
  });

  it('calculates WER correctly', () => {
    const result = validator.validate(
      'hello there world',  // actual: "there" is wrong
      'hello beautiful world'
    );
    expect(result.wordErrorRate).toBeCloseTo(0.33, 1);  // 1/3 words wrong
  });
});
```

---

## Milestone 1: Core Interfaces (`packages/core/`)

**What we're building:** The foundational type contracts everything else depends on.

**Dependencies:** M0 (Test fixtures for validation)

**Files:**
- `adapter.ts` — The `Adapter<TInput, TOutput>` interface
- `pipeline.ts` — The `Pipeline` interface (no implementations yet)
- `session.ts` — `VoiceSession` interface/abstract class
- `registry.ts` — `AdapterRegistry` interface
- `types.ts` — Shared types (`Audio`, `Message`, `Metrics`, `Status`, `Config`)

**Implementation approach:**

```typescript
// Start with the most constrained interface first
// adapter.ts
export interface Adapter<TInput, TOutput> {
  readonly name: string;
  readonly type: 'stt' | 'llm' | 'tts' | 's2s';
  
  stream(input: AsyncIterable<TInput>): AsyncIterable<TOutput>;
  interrupt(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

// Define type aliases for clarity
export type STTAdapter = Adapter<Audio, string>;
export type LLMAdapter = Adapter<string, string>;
export type TTSAdapter = Adapter<string, Audio>;
export type S2SAdapter = Adapter<Audio, Audio>;
```

**Why build this first:** Every other component depends on these contracts. Getting them wrong means cascading refactors. Spend time here validating that the generics work for all planned use cases.

**Completion criteria:**
- [ ] All interfaces compile with strict TypeScript
- [ ] Generic constraints allow STT→LLM→TTS chaining (types align)
- [ ] `AsyncIterable` patterns work for both streaming and batch scenarios
- [ ] Unit tests verify interface contracts with mock implementations
- [ ] **Audio fixture integration:** Mock adapters can consume real audio streams from M0
- [ ] Documentation comments explain expected behavior for each method

**Verification test:**

```typescript
// If this compiles and type-checks, interfaces are correct
const mockSTT: STTAdapter = { /* ... */ };
const mockLLM: LLMAdapter = { /* ... */ };
const mockTTS: TTSAdapter = { /* ... */ };

// This composition must type-check
async function* chain(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
  yield* mockTTS.stream(mockLLM.stream(mockSTT.stream(audio)));
}

// Verify with real audio fixtures
describe('Interface contracts with real audio', () => {
  const loader = new AudioFixtureLoader();

  it('STTAdapter consumes real audio stream', async () => {
    const fixture = await loader.loadUtterance('hello-world');
    const mockSTT = new MockSTT();
    
    const transcripts: string[] = [];
    for await (const text of mockSTT.stream(loader.streamAudio(fixture))) {
      transcripts.push(text);
    }
    
    expect(transcripts.length).toBeGreaterThan(0);
  });
});
```

---

## Milestone 2: First Working Adapters (One Per Type)

**What we're building:** Minimal viable adapters to prove the interface works with real providers.

**Dependencies:** M0 (Test fixtures), M1 (Core Interfaces)

**Files:**
- `adapters/stt/deepgram.ts` — Cloud STT (most common, well-documented API)
- `adapters/llm/openai.ts` — Cloud LLM (streaming well-supported)
- `adapters/tts/elevenlabs.ts` — Cloud TTS (streaming supported)
- `adapters/stt/mock.ts`, `adapters/llm/mock.ts`, `adapters/tts/mock.ts` — For testing

**Implementation approach:**

```typescript
// adapters/stt/deepgram.ts
export class DeepgramSTT implements STTAdapter {
  readonly name = 'deepgram';
  readonly type = 'stt' as const;
  
  private ws: WebSocket | null = null;
  private abortController: AbortController | null = null;

  constructor(private apiKey: string, private options?: DeepgramOptions) {}

  async *stream(input: AsyncIterable<Audio>): AsyncIterable<string> {
    this.abortController = new AbortController();
    this.ws = await this.connect();
    
    try {
      // Forward audio chunks to Deepgram
      const transcripts = this.createTranscriptIterator();
      
      for await (const chunk of input) {
        if (this.abortController.signal.aborted) break;
        this.ws.send(chunk);
      }
      
      yield* transcripts;
    } finally {
      this.cleanup();
    }
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort();
    this.cleanup();
  }

  async isHealthy(): Promise<boolean> {
    // Lightweight API ping
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${this.apiKey}` }
    });
    return response.ok;
  }
}
```

**Why this order:** Start with cloud providers because they're easier to test (no local setup), have good documentation, and let us validate the streaming patterns before adding complexity.

**Audio fixture integration for adapter testing:**

```typescript
describe('DeepgramSTT with real audio', () => {
  const loader = new AudioFixtureLoader();
  const validator = new TranscriptValidator();
  let stt: DeepgramSTT;

  beforeAll(() => {
    stt = new DeepgramSTT(process.env.DEEPGRAM_KEY!);
  });

  it('transcribes clear speech accurately', async () => {
    const fixture = await loader.loadUtterance('hello-world');
    
    const transcripts: string[] = [];
    for await (const text of stt.stream(loader.streamAudio(fixture))) {
      transcripts.push(text);
    }
    
    const result = validator.validate(
      transcripts.join(' '),
      fixture.transcript!
    );
    
    expect(result.pass).toBe(true);
    expect(result.wordErrorRate).toBeLessThan(0.1);
  });

  it('handles noisy audio gracefully', async () => {
    const fixture = await loader.loadUtterance('noisy-background');
    
    const transcripts: string[] = [];
    for await (const text of stt.stream(loader.streamAudio(fixture))) {
      transcripts.push(text);
    }
    
    // Allow higher WER for noisy audio
    const result = validator.validate(
      transcripts.join(' '),
      fixture.transcript!,
      { wordErrorRateThreshold: 0.25 }
    );
    
    expect(result.pass).toBe(true);
  });

  it('handles very short utterances', async () => {
    const fixture = await loader.loadUtterance('very-short-utterance');  // "Yes"
    
    const transcripts: string[] = [];
    for await (const text of stt.stream(loader.streamAudio(fixture))) {
      transcripts.push(text);
    }
    
    expect(transcripts.join(' ').toLowerCase()).toContain('yes');
  });

  it('interrupt stops processing long audio', async () => {
    const fixture = await loader.loadUtterance('very-long-utterance');
    
    const iterator = stt.stream(loader.streamAudio(fixture))[Symbol.asyncIterator]();
    await iterator.next();  // Start streaming
    
    const start = Date.now();
    await stt.interrupt();
    
    // Should complete quickly, not process entire 60+ second stream
    const remaining = await collectRemaining(iterator);
    expect(Date.now() - start).toBeLessThan(200);
  });
});
```

**Completion criteria:**
- [ ] Each adapter connects to its provider successfully
- [ ] Streaming works end-to-end (audio in → text out for STT, etc.)
- [ ] `interrupt()` cancels in-flight requests within 100ms
- [ ] `isHealthy()` returns accurate status
- [ ] Error handling covers: network failures, auth errors, rate limits
- [ ] Mock adapters provide deterministic behavior for testing
- [ ] **Real audio validation:** STT achieves <10% WER on clean fixtures, <25% on noisy
- [ ] **Edge case coverage:** Tested with short, long, silent, and accented audio

---

## Milestone 3: Pipeline Implementations

**What we're building:** The two pipeline types that compose adapters.

**Dependencies:** M0 (Test fixtures), M1 (Core Interfaces), M2 (Working Adapters)

**Files:**
- `core/pipeline.ts` — Add concrete implementations
- `pipelines/cascade.ts` — `CascadePipeline`
- `pipelines/s2s.ts` — `S2SPipeline`

**Implementation approach:**

```typescript
// pipelines/cascade.ts
export class CascadePipeline implements Pipeline {
  constructor(
    private stt: STTAdapter,
    private llm: LLMAdapter,
    private tts: TTSAdapter
  ) {}

  async *process(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
    // Chain the three adapters
    // Key insight: each adapter's output feeds the next's input
    const transcripts = this.stt.stream(audio);
    const responses = this.llm.stream(transcripts);
    yield* this.tts.stream(responses);
  }

  async interrupt(): Promise<void> {
    // Interrupt all three in parallel
    await Promise.all([
      this.stt.interrupt(),
      this.llm.interrupt(),
      this.tts.interrupt()
    ]);
  }
}
```

**Critical design decision:** The cascade pipeline's streaming behavior needs careful thought. Do we wait for complete STT output before starting LLM? Or stream partial transcripts? I'd start with complete utterances (simpler) and add partial streaming as an optimization later.

**Pipeline testing with real audio conversations:**

```typescript
describe('CascadePipeline with real conversations', () => {
  const loader = new AudioFixtureLoader();
  const runner = new ConversationRunner(loader);
  let pipeline: CascadePipeline;

  beforeAll(() => {
    pipeline = new CascadePipeline(
      new DeepgramSTT(process.env.DEEPGRAM_KEY!),
      new OpenAILLM(process.env.OPENAI_KEY!),
      new ElevenLabsTTS(process.env.ELEVENLABS_KEY!)
    );
  });

  it('processes single utterance end-to-end', async () => {
    const fixture = await loader.loadUtterance('quick-question');
    
    const outputChunks: ArrayBuffer[] = [];
    const startTime = performance.now();
    
    for await (const chunk of pipeline.process(loader.streamAudio(fixture))) {
      outputChunks.push(chunk);
    }
    
    const latencyMs = performance.now() - startTime;
    const totalAudioBytes = outputChunks.reduce((sum, c) => sum + c.byteLength, 0);
    
    expect(totalAudioBytes).toBeGreaterThan(0);  // Got audio output
    expect(latencyMs).toBeLessThan(5000);  // Reasonable response time
  });

  it('handles multi-turn conversation with context', async () => {
    const conversation = await loader.loadConversation('context-dependent');
    const result = await runner.runConversation(conversation, { pipeline });
    
    expect(result.results.length).toBe(conversation.turns.filter(t => t.role === 'user').length);
    expect(result.contextPreserved).toBe(true);
    
    // Verify follow-up responses reference prior context
    // "What's the weather like there?" should get Paris weather, not generic response
  });

  it('handles interruption correctly', async () => {
    const conversation = await loader.loadConversation('interruption-flow');
    const result = await runner.runConversation(conversation, { pipeline });
    
    const interruptedTurn = result.results.find(r => r.wasInterrupted);
    expect(interruptedTurn).toBeDefined();
    expect(interruptedTurn!.latencyMs).toBeLessThan(300);  // Fast interrupt
  });

  it('measures latency across conversation turns', async () => {
    const conversation = await loader.loadConversation('greeting-flow');
    const result = await runner.runConversation(conversation, { pipeline });
    
    const latencies = result.results.map(r => r.latencyMs);
    const p95Latency = percentile(latencies, 95);
    
    expect(p95Latency).toBeLessThan(800);  // Meet cascade cloud target
  });
});

describe('CascadePipeline with mocks', () => {
  it('chains three adapters correctly', async () => {
    const pipeline = new CascadePipeline(
      new MockSTT(['hello']),
      new MockLLM(['Hi there!']),
      new MockTTS()
    );
    
    const loader = new AudioFixtureLoader();
    const fixture = await loader.loadUtterance('hello-world');
    
    const output = await collect(pipeline.process(loader.streamAudio(fixture)));
    expect(output.length).toBeGreaterThan(0);
    expect(output[0]).toBeInstanceOf(ArrayBuffer);
  });
});
```

**Completion criteria:**
- [ ] CascadePipeline chains three adapters correctly
- [ ] S2SPipeline wraps single adapter correctly
- [ ] Both implement identical `Pipeline` interface
- [ ] `interrupt()` stops all in-flight processing
- [ ] Backpressure handled correctly (slow TTS doesn't cause memory buildup)
- [ ] Errors propagate correctly through the chain
- [ ] **Multi-turn validation:** Context preserved across conversation turns
- [ ] **Interruption handling:** Tested with interruption-flow fixture
- [ ] **Latency benchmarks:** Measured with real audio, meeting targets

---

## Milestone 4: Adapter Registry

**What we're building:** Central registration and discovery for adapters.

**Dependencies:** M1 (Core Interfaces), M2 (Adapters to register)

**Files:**
- `core/registry.ts` — Full implementation

**Implementation approach:**

```typescript
// core/registry.ts
export class AdapterRegistry {
  private adapters = new Map<string, Map<string, Adapter<unknown, unknown>>>();

  register<I, O>(adapter: Adapter<I, O>): void {
    if (!this.adapters.has(adapter.type)) {
      this.adapters.set(adapter.type, new Map());
    }
    this.adapters.get(adapter.type)!.set(adapter.name, adapter);
  }

  get<I, O>(type: string, name: string): Adapter<I, O> {
    const typeMap = this.adapters.get(type);
    if (!typeMap) throw new Error(`No adapters registered for type: ${type}`);
    
    const adapter = typeMap.get(name);
    if (!adapter) throw new Error(`Adapter not found: ${type}/${name}`);
    
    return adapter as Adapter<I, O>;
  }

  async getBest<I, O>(type: string): Promise<Adapter<I, O>> {
    const typeMap = this.adapters.get(type);
    if (!typeMap || typeMap.size === 0) {
      throw new Error(`No adapters registered for type: ${type}`);
    }

    // Check health of all adapters in parallel
    const healthChecks = await Promise.all(
      Array.from(typeMap.entries()).map(async ([name, adapter]) => ({
        name,
        adapter,
        healthy: await adapter.isHealthy().catch(() => false)
      }))
    );

    const healthy = healthChecks.find(h => h.healthy);
    if (!healthy) throw new Error(`No healthy adapters for type: ${type}`);
    
    return healthy.adapter as Adapter<I, O>;
  }
  
  list(type?: string): AdapterInfo[] {
    // For debugging and UI display
  }
}
```

**Completion criteria:**
- [ ] Registration works for all adapter types
- [ ] `get()` retrieves specific adapters by type and name
- [ ] `getBest()` returns healthiest adapter (with health checks)
- [ ] Graceful error messages for missing adapters
- [ ] Thread-safe for concurrent access (if applicable)
- [ ] `list()` provides introspection for debugging

**Verification tests:**

```typescript
describe('AdapterRegistry', () => {
  it('registers and retrieves adapters', () => {
    const registry = new AdapterRegistry();
    const stt = new MockSTT();
    
    registry.register(stt);
    expect(registry.get('stt', 'mock')).toBe(stt);
  });

  it('getBest returns healthy adapter', async () => {
    const registry = new AdapterRegistry();
    const unhealthy = new MockSTT({ healthy: false });
    const healthy = new MockSTT({ healthy: true, name: 'healthy-mock' });
    
    registry.register(unhealthy);
    registry.register(healthy);
    
    const best = await registry.getBest('stt');
    expect(best.name).toBe('healthy-mock');
  });
});
```

---

## Milestone 5: VoiceSession

**What we're building:** The conversation orchestrator that ties pipelines together.

**Dependencies:** M0 (Conversation fixtures), M3 (Pipelines), M4 (Registry)

**Files:**
- `core/session.ts` — Full implementation

**Implementation approach:**

```typescript
// core/session.ts
export class VoiceSession {
  private currentConversation: AsyncGenerator<Audio> | null = null;
  private conversationHistory: Message[] = [];

  constructor(
    private pipeline: Pipeline,
    private options?: SessionOptions
  ) {}

  async *converse(audio: AsyncIterable<Audio>): AsyncIterable<Audio> {
    // Track current conversation for interruption
    const conversation = this.pipeline.process(audio);
    this.currentConversation = conversation as AsyncGenerator<Audio>;
    
    try {
      for await (const output of conversation) {
        yield output;
      }
    } finally {
      this.currentConversation = null;
    }
  }

  async interrupt(): Promise<void> {
    if (this.currentConversation) {
      await this.pipeline.interrupt();
      this.currentConversation = null;
    }
  }

  // Factory method using registry
  static create(registry: AdapterRegistry, config: Config): VoiceSession {
    const pipeline = config.mode === 's2s'
      ? new S2SPipeline(registry.get('s2s', config.providers?.s2s ?? 'personaplex'))
      : new CascadePipeline(
          registry.get('stt', config.providers?.stt ?? registry.getBest('stt')),
          registry.get('llm', config.providers?.llm ?? registry.getBest('llm')),
          registry.get('tts', config.providers?.tts ?? registry.getBest('tts'))
        );
    
    return new VoiceSession(pipeline);
  }
}
```

**Session testing with conversation fixtures:**

```typescript
describe('VoiceSession', () => {
  const loader = new AudioFixtureLoader();

  it('maintains context across multiple converse calls', async () => {
    const registry = createTestRegistry();
    const session = VoiceSession.create(registry, { mode: 'cascade' });
    
    const conversation = await loader.loadConversation('context-dependent');
    const userTurns = conversation.turns.filter(t => t.role === 'user');
    
    const responses: ArrayBuffer[][] = [];
    
    for (const turn of userTurns) {
      const audioStream = loader.streamAudio({ path: turn.audioFile } as AudioFixture);
      const output: ArrayBuffer[] = [];
      
      for await (const chunk of session.converse(audioStream)) {
        output.push(chunk);
      }
      
      responses.push(output);
    }
    
    // All turns should produce responses
    expect(responses.every(r => r.length > 0)).toBe(true);
  });

  it('handles rapid sequential turns', async () => {
    const session = VoiceSession.create(createTestRegistry(), {});
    const conversation = await loader.loadConversation('greeting-flow');
    
    // Simulate rapid back-and-forth
    for (const turn of conversation.turns.filter(t => t.role === 'user')) {
      const audioStream = loader.streamAudio(
        { path: turn.audioFile } as AudioFixture,
        { realtime: false }  // Fast as possible
      );
      
      await collect(session.converse(audioStream));
    }
    
    // Should complete without errors
  });
});
```

**Completion criteria:**
- [ ] `converse()` processes audio through pipeline
- [ ] `interrupt()` stops current conversation
- [ ] Factory method creates correct pipeline type based on config
- [ ] Handles concurrent conversation attempts gracefully
- [ ] Emits events for state changes (optional, for metrics)
- [ ] **Multi-turn sessions:** Maintains context across calls with real conversation fixtures

---

## Milestone 6: WebSocket Server

**What we're building:** The middleware that connects clients to sessions.

**Dependencies:** M0 (Fixtures for integration tests), M4 (Registry), M5 (VoiceSession)

**Files:**
- `server/index.ts` — Main server
- `server/connection.ts` — Per-connection handler
- `server/protocol.ts` — Message types and parsing

**Implementation approach:**

```typescript
// server/index.ts
export class VoiceServer {
  private wss: WebSocketServer;
  private connections = new Map<string, ConnectionHandler>();

  constructor(private options: { registry: AdapterRegistry; port?: number }) {
    this.wss = new WebSocketServer({ port: options.port ?? 3000 });
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket): void {
    const handler = new ConnectionHandler(ws, this.options.registry);
    this.connections.set(handler.id, handler);
    
    ws.on('close', () => {
      handler.cleanup();
      this.connections.delete(handler.id);
    });
  }
}

// server/connection.ts
class ConnectionHandler {
  readonly id = crypto.randomUUID();
  private session: VoiceSession | null = null;
  private audioBuffer: Audio[] = [];

  constructor(
    private ws: WebSocket,
    private registry: AdapterRegistry
  ) {
    ws.on('message', this.handleMessage.bind(this));
  }

  private async handleMessage(data: Buffer): Promise<void> {
    const message = parseMessage(data);
    
    switch (message.type) {
      case 'config':
        this.session = VoiceSession.create(this.registry, message.config);
        this.sendStatus('ready');
        break;
        
      case 'audio':
        if (!this.session) {
          this.sendError('NO_SESSION', 'Send config first');
          return;
        }
        await this.processAudio(message.data);
        break;
        
      case 'interrupt':
        await this.session?.interrupt();
        this.sendStatus('interrupted');
        break;
    }
  }

  private async processAudio(audio: Audio): Promise<void> {
    this.sendStatus('processing');
    
    const audioStream = this.createAudioStream(audio);
    
    for await (const outputAudio of this.session!.converse(audioStream)) {
      this.send({ type: 'audio', data: outputAudio });
    }
    
    this.sendStatus('idle');
  }
}
```

**Server integration tests with real audio:**

```typescript
describe('VoiceServer integration', () => {
  const loader = new AudioFixtureLoader();
  let server: VoiceServer;
  let serverUrl: string;

  beforeAll(async () => {
    const registry = new AdapterRegistry();
    registry.register(new DeepgramSTT(process.env.DEEPGRAM_KEY!));
    registry.register(new OpenAILLM(process.env.OPENAI_KEY!));
    registry.register(new ElevenLabsTTS(process.env.ELEVENLABS_KEY!));
    
    server = new VoiceServer({ registry, port: 0 });
    serverUrl = `ws://localhost:${server.port}`;
  });

  it('processes real audio through WebSocket', async () => {
    const ws = new WebSocket(serverUrl);
    const fixture = await loader.loadUtterance('hello-world');
    
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'config', config: {} }));
    
    const statusMsg = await waitForMessage(ws, 'status');
    expect(statusMsg.status).toBe('ready');
    
    // Send real audio chunks
    for await (const chunk of loader.streamAudio(fixture, { realtime: true })) {
      ws.send(createAudioMessage(chunk));
    }
    
    // Collect response audio
    const responseChunks = await collectMessagesUntil(ws, 'status', 'idle');
    const audioMessages = responseChunks.filter(m => m.type === 'audio');
    
    expect(audioMessages.length).toBeGreaterThan(0);
  });

  it('handles multi-turn conversation over WebSocket', async () => {
    const ws = new WebSocket(serverUrl);
    const conversation = await loader.loadConversation('context-dependent');
    
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'config', config: {} }));
    await waitForMessage(ws, 'status');
    
    const transcriptMessages: any[] = [];
    
    for (const turn of conversation.turns.filter(t => t.role === 'user')) {
      // Send user audio
      const fixture = { path: turn.audioFile } as AudioFixture;
      for await (const chunk of loader.streamAudio(fixture)) {
        ws.send(createAudioMessage(chunk));
      }
      
      // Wait for response
      const messages = await collectMessagesUntil(ws, 'status', 'idle');
      transcriptMessages.push(...messages.filter(m => m.type === 'transcript'));
      
      // Small delay between turns
      if (turn.delayBeforeMs) {
        await sleep(turn.delayBeforeMs);
      }
    }
    
    // Verify we got transcripts for each turn
    expect(transcriptMessages.length).toBeGreaterThanOrEqual(conversation.turns.length);
  });

  it('interrupt stops audio mid-stream', async () => {
    const ws = new WebSocket(serverUrl);
    const fixture = await loader.loadUtterance('very-long-utterance');
    
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'config', config: {} }));
    await waitForMessage(ws, 'status');
    
    // Start sending audio
    const audioIterator = loader.streamAudio(fixture, { realtime: true })[Symbol.asyncIterator]();
    
    // Send a few chunks
    for (let i = 0; i < 5; i++) {
      const { value } = await audioIterator.next();
      ws.send(createAudioMessage(value));
    }
    
    // Interrupt
    const startInterrupt = performance.now();
    ws.send(JSON.stringify({ type: 'interrupt' }));
    
    const interruptedMsg = await waitForMessage(ws, 'status');
    const interruptLatency = performance.now() - startInterrupt;
    
    expect(interruptedMsg.status).toBe('interrupted');
    expect(interruptLatency).toBeLessThan(300);
  });
});
```

**Completion criteria:**
- [ ] WebSocket server accepts connections
- [ ] Protocol messages parse correctly
- [ ] Session created from config message
- [ ] Audio streams through session correctly
- [ ] Interrupt message stops processing
- [ ] Status updates sent to client
- [ ] Error handling for malformed messages
- [ ] Connection cleanup on disconnect
- [ ] Metrics collection (latency measurements)
- [ ] **Real audio E2E:** Single utterance processes correctly
- [ ] **Multi-turn E2E:** Full conversation fixture works over WebSocket
- [ ] **Interrupt E2E:** Interruption stops processing quickly

---

## Milestone 7: Client Hook (`useVoiceAgent`)

**What we're building:** The React hook that encapsulates all client-side logic.

**Dependencies:** M6 (Server to connect to)

**Files:**
- `ui/hooks/use-voice-agent.ts`
- `ui/hooks/use-audio-capture.ts` (internal helper)
- `ui/hooks/use-websocket.ts` (internal helper)

**Implementation approach:**

```typescript
// ui/hooks/use-voice-agent.ts
export function useVoiceAgent(config: Config) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ latency: 0 });
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async () => {
    wsRef.current = new WebSocket(config.endpoint);
    
    wsRef.current.onopen = () => {
      wsRef.current!.send(JSON.stringify({ type: 'config', config }));
      setStatus('connected');
    };
    
    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    };
  }, [config]);

  const startListening = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    
    // Set up audio processing
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      const audioData = e.inputBuffer.getChannelData(0);
      wsRef.current?.send(audioData.buffer);
    };
    
    source.connect(processor);
    processor.connect(audioContextRef.current.destination);
    
    setStatus('listening');
  }, []);

  const interrupt = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'interrupt' }));
  }, []);

  // ... stopListening, disconnect, handleServerMessage, playAudio

  return {
    status,
    transcript,
    metrics,
    connect,
    disconnect,
    startListening,
    stopListening,
    interrupt,
  };
}
```

**Client testing with audio fixture injection:**

```typescript
// For testing, we need to mock getUserMedia to return our test audio
describe('useVoiceAgent', () => {
  const loader = new AudioFixtureLoader();

  it('connects and updates status', async () => {
    const { result } = renderHook(() => 
      useVoiceAgent({ endpoint: mockServerUrl })
    );
    
    expect(result.current.status).toBe('idle');
    
    await act(async () => {
      result.current.connect();
    });
    
    await waitFor(() => {
      expect(result.current.status).toBe('connected');
    });
  });

  it('sends real audio when listening', async () => {
    const fixture = await loader.loadUtterance('hello-world');
    
    // Mock getUserMedia to return our test audio as a stream
    const mockStream = await createMockMediaStreamFromFixture(fixture, loader);
    vi.spyOn(navigator.mediaDevices, 'getUserMedia')
      .mockResolvedValue(mockStream);
    
    const sentAudio: ArrayBuffer[] = [];
    const mockWs = createMockWebSocket({
      onSend: (data) => {
        if (data instanceof ArrayBuffer) {
          sentAudio.push(data);
        }
      }
    });
    
    const { result } = renderHook(() => 
      useVoiceAgent({ endpoint: 'wss://test' })
    );
    
    await act(async () => {
      result.current.connect();
      result.current.startListening();
    });
    
    // Wait for audio to be sent
    await waitFor(() => {
      expect(sentAudio.length).toBeGreaterThan(0);
    });
    
    // Verify we sent actual audio data
    const totalBytes = sentAudio.reduce((sum, b) => sum + b.byteLength, 0);
    expect(totalBytes).toBeGreaterThan(1000);
  });

  it('accumulates transcript from multi-turn conversation', async () => {
    const conversation = await loader.loadConversation('greeting-flow');
    
    const { result } = renderHook(() => 
      useVoiceAgent({ endpoint: mockServerUrl })
    );
    
    await act(async () => {
      result.current.connect();
    });
    
    // Simulate server sending transcript messages for each turn
    for (const turn of conversation.turns) {
      await act(async () => {
        mockWs.receive({
          type: 'transcript',
          role: turn.role,
          text: turn.transcript
        });
      });
    }
    
    expect(result.current.transcript.length).toBe(conversation.turns.length);
  });
});

// Helper to create MediaStream from fixture
async function createMockMediaStreamFromFixture(
  fixture: AudioFixture,
  loader: AudioFixtureLoader
): Promise<MediaStream> {
  const audioContext = new AudioContext();
  const chunks: ArrayBuffer[] = [];
  
  for await (const chunk of loader.streamAudio(fixture)) {
    chunks.push(chunk);
  }
  
  const audioBuffer = await audioContext.decodeAudioData(
    concatenateBuffers(chunks)
  );
  
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  
  const dest = audioContext.createMediaStreamDestination();
  source.connect(dest);
  source.start();
  
  return dest.stream;
}
```

**Completion criteria:**
- [ ] WebSocket connection management (connect/disconnect)
- [ ] Audio capture from microphone
- [ ] Audio playback of responses
- [ ] Status state machine works correctly
- [ ] Transcript accumulates messages
- [ ] Metrics update with latency data
- [ ] Interrupt stops playback and processing
- [ ] Cleanup on unmount (no memory leaks)
- [ ] Error handling for permission denied, connection lost
- [ ] **Fixture-based testing:** Can inject real audio via mocked getUserMedia

---

## Milestone 8: UI Components

**What we're building:** Composable React components built on shadcn/ui.

**Dependencies:** M7 (useVoiceAgent hook)

**Files:**
- `ui/components/voice/VoiceAgent.tsx`
- `ui/components/voice/MicButton.tsx`
- `ui/components/voice/Transcript.tsx`
- `ui/components/voice/AudioVisualizer.tsx`
- `ui/components/voice/StatusBadge.tsx`
- `ui/components/voice/LatencyDisplay.tsx`

**Implementation approach:**

```typescript
// ui/components/voice/VoiceAgent.tsx
export function VoiceAgent({ config, className }: VoiceAgentProps) {
  const agent = useVoiceAgent(config);
  
  useEffect(() => {
    agent.connect();
    return () => agent.disconnect();
  }, []);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between">
        <StatusBadge status={agent.status} />
        <LatencyDisplay metrics={agent.metrics} />
      </div>
      
      <Transcript messages={agent.transcript} />
      
      <div className="flex items-center gap-2">
        <AudioVisualizer 
          active={agent.status === 'listening' || agent.status === 'speaking'} 
        />
        <MicButton
          listening={agent.status === 'listening'}
          onStart={agent.startListening}
          onStop={agent.stopListening}
        />
        {agent.status === 'speaking' && (
          <Button variant="destructive" onClick={agent.interrupt}>
            Interrupt
          </Button>
        )}
      </div>
    </div>
  );
}

// ui/components/voice/Transcript.tsx
export function Transcript({ messages }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex flex-col gap-2 h-64 overflow-y-auto">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={cn(
            "p-3 rounded-lg max-w-[80%]",
            msg.role === 'user' 
              ? "bg-primary text-primary-foreground self-end" 
              : "bg-muted self-start"
          )}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
}
```

**Completion criteria:**
- [ ] All components render correctly
- [ ] Components are properly composable (can be used independently)
- [ ] Theming works via CSS variables
- [ ] Accessibility: keyboard navigation, ARIA labels
- [ ] Loading states for all async operations
- [ ] Error states display clearly
- [ ] Responsive design

**Verification tests:**

```typescript
describe('VoiceAgent component', () => {
  it('renders all subcomponents', () => {
    render(<VoiceAgent config={{ endpoint: 'wss://test' }} />);
    
    expect(screen.getByRole('button', { name: /mic/i })).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    expect(screen.getByTestId('transcript')).toBeInTheDocument();
  });

  it('displays conversation transcript', async () => {
    const conversation = await loader.loadConversation('greeting-flow');
    
    render(<VoiceAgent config={{ endpoint: mockServerUrl }} />);
    
    // Simulate receiving transcript messages
    for (const turn of conversation.turns) {
      await act(async () => {
        mockWs.receive({
          type: 'transcript',
          role: turn.role,
          text: turn.transcript
        });
      });
    }
    
    // Verify transcript shows all messages
    for (const turn of conversation.turns) {
      expect(screen.getByText(turn.transcript)).toBeInTheDocument();
    }
  });
});
```

---

## Milestone 9: Additional Adapters

**What we're building:** Expand provider coverage for production flexibility.

**Dependencies:** M0 (Test fixtures), M1 (Core Interfaces), M4 (Registry)

**Files:**
- `adapters/stt/whisper.ts` (local)
- `adapters/stt/assemblyai.ts`
- `adapters/llm/groq.ts`
- `adapters/llm/ollama.ts` (local)
- `adapters/tts/cartesia.ts`
- `adapters/tts/piper.ts` (local)
- `adapters/s2s/personaplex.ts`
- `adapters/s2s/moshi.ts`

**Implementation approach:**

Build adapters in priority order based on deployment targets. Each adapter is validated against the same audio fixtures to ensure consistent quality.

**Adapter comparison testing:**

```typescript
describe('STT Adapter Comparison', () => {
  const loader = new AudioFixtureLoader();
  const validator = new TranscriptValidator();
  
  const adapters = [
    { name: 'deepgram', adapter: new DeepgramSTT(process.env.DEEPGRAM_KEY!) },
    { name: 'whisper', adapter: new WhisperSTT() },
    { name: 'assemblyai', adapter: new AssemblyAISTT(process.env.ASSEMBLYAI_KEY!) },
  ];

  const fixtures = [
    'hello-world',
    'quick-question',
    'noisy-background',
    'accented-speech',
  ];

  for (const { name, adapter } of adapters) {
    describe(name, () => {
      for (const fixtureName of fixtures) {
        it(`transcribes ${fixtureName}`, async () => {
          const fixture = await loader.loadUtterance(fixtureName);
          
          const startTime = performance.now();
          const transcripts: string[] = [];
          
          for await (const text of adapter.stream(loader.streamAudio(fixture))) {
            transcripts.push(text);
          }
          
          const latency = performance.now() - startTime;
          const result = validator.validate(transcripts.join(' '), fixture.transcript!);
          
          console.log(`${name}/${fixtureName}: WER=${result.wordErrorRate.toFixed(2)}, latency=${latency.toFixed(0)}ms`);
          
          // Each adapter should meet minimum quality bar
          expect(result.wordErrorRate).toBeLessThan(0.3);
        });
      }
    });
  }
});
```

**Completion criteria (per adapter):**
- [ ] Implements `Adapter<I, O>` interface correctly
- [ ] Streaming works end-to-end
- [ ] `interrupt()` cancels within 100ms
- [ ] `isHealthy()` returns accurate status
- [ ] Error handling covers provider-specific errors
- [ ] Configuration options exposed appropriately
- [ ] **Fixture validation:** Tested against all utterance fixtures
- [ ] **Quality benchmarks:** WER/latency documented for comparison
- [ ] Integration test against real provider

---

## Milestone 10: Integration & Deployment

**What we're building:** End-to-end system validation and deployment configurations.

**Dependencies:** All previous milestones

**Files:**
- `docker-compose.yml` (cloud)
- `docker-compose.local.yml` (local)
- `docker-compose.s2s.yml` (S2S)
- `Dockerfile`
- `.github/workflows/ci.yml`
- `docs/` (deployment guides)

**Full conversation E2E tests:**

```typescript
describe('E2E Conversation Tests', () => {
  const loader = new AudioFixtureLoader();
  const runner = new ConversationRunner(loader);

  describe('Cloud deployment', () => {
    const endpoint = process.env.CLOUD_ENDPOINT ?? 'wss://voice.example.com';

    it('greeting-flow conversation completes successfully', async () => {
      const conversation = await loader.loadConversation('greeting-flow');
      const client = new VoiceClient({ endpoint, mode: 'cascade' });
      
      const result = await runner.runConversationE2E(client, conversation);
      
      expect(result.allTurnsCompleted).toBe(true);
      expect(result.p95Latency).toBeLessThan(800);
    });

    it('context-dependent conversation preserves context', async () => {
      const conversation = await loader.loadConversation('context-dependent');
      const client = new VoiceClient({ endpoint, mode: 'cascade' });
      
      const result = await runner.runConversationE2E(client, conversation);
      
      expect(result.contextPreserved).toBe(true);
      
      // Verify "What's the weather like there?" got Paris-specific response
      const followupResponse = result.agentResponses[1];
      expect(followupResponse.toLowerCase()).toMatch(/paris|france|french/);
    });

    it('interruption-flow handles interrupt correctly', async () => {
      const conversation = await loader.loadConversation('interruption-flow');
      const client = new VoiceClient({ endpoint, mode: 'cascade' });
      
      const result = await runner.runConversationE2E(client, conversation);
      
      expect(result.interruptHandled).toBe(true);
      expect(result.interruptLatency).toBeLessThan(200);
    });
  });

  describe('Local deployment', () => {
    const endpoint = 'ws://localhost:3000';

    it('processes conversation with local providers', async () => {
      const conversation = await loader.loadConversation('greeting-flow');
      const client = new VoiceClient({ 
        endpoint, 
        mode: 'cascade',
        providers: { stt: 'whisper', llm: 'ollama', tts: 'piper' }
      });
      
      const result = await runner.runConversationE2E(client, conversation);
      
      expect(result.allTurnsCompleted).toBe(true);
      expect(result.p95Latency).toBeLessThan(500);  // Local target
    });
  });

  describe('S2S deployment', () => {
    const endpoint = process.env.S2S_ENDPOINT ?? 'ws://localhost:3001';

    it('achieves lowest latency target', async () => {
      const conversation = await loader.loadConversation('greeting-flow');
      const client = new VoiceClient({ endpoint, mode: 's2s' });
      
      const result = await runner.runConversationE2E(client, conversation);
      
      expect(result.p95Latency).toBeLessThan(200);  // S2S target
    });
  });
});

// Latency benchmarking with real audio
describe('Latency Benchmarks', () => {
  const loader = new AudioFixtureLoader();

  interface BenchmarkResult {
    mode: string;
    providers: string;
    fixture: string;
    samples: number;
    p50: number;
    p95: number;
    p99: number;
  }

  const results: BenchmarkResult[] = [];

  afterAll(() => {
    // Output results as table
    console.table(results);
    
    // Save to file for tracking over time
    fs.writeFileSync(
      `benchmarks/latency-${Date.now()}.json`,
      JSON.stringify(results, null, 2)
    );
  });

  const configurations = [
    { mode: 'cascade', providers: 'deepgram/openai/elevenlabs', endpoint: cloudEndpoint },
    { mode: 'cascade', providers: 'deepgram/groq/cartesia', endpoint: cloudEndpoint },
    { mode: 'cascade', providers: 'whisper/ollama/piper', endpoint: localEndpoint },
    { mode: 's2s', providers: 'personaplex', endpoint: s2sEndpoint },
  ];

  for (const config of configurations) {
    it(`benchmarks ${config.mode} with ${config.providers}`, async () => {
      const fixture = await loader.loadUtterance('quick-question');
      const client = new VoiceClient({ 
        endpoint: config.endpoint, 
        mode: config.mode as any 
      });
      
      const latencies: number[] = [];
      
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await client.sendAudioAndWaitForResponse(
          loader.streamAudio(fixture)
        );
        latencies.push(performance.now() - start);
      }
      
      results.push({
        mode: config.mode,
        providers: config.providers,
        fixture: 'quick-question',
        samples: latencies.length,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
      });
    });
  }
});
```

**Completion criteria:**
- [ ] All deployment modes work (cloud, local, S2S)
- [ ] End-to-end latency meets targets
- [ ] CI pipeline runs all tests
- [ ] Docker images build and run correctly
- [ ] Health checks work
- [ ] Graceful shutdown handles in-flight requests
- [ ] Documentation covers setup for each deployment mode
- [ ] **Conversation E2E:** All fixture conversations complete successfully
- [ ] **Context validation:** Context-dependent conversations preserve context
- [ ] **Interrupt validation:** Interruption fixture tests pass
- [ ] **Latency benchmarks:** Documented for all provider combinations

---

## Dependency Summary

| Milestone | Depends On | Blocks |
|-----------|------------|--------|
| M0: Test Audio Fixtures | — | M1, M2, M3, M5, M6, M7, M9, M10 |
| M1: Core Interfaces | M0 | M2, M3, M4, M5 |
| M2: First Adapters | M0, M1 | M3, M5, M9 |
| M3: Pipelines | M0, M1, M2 | M5 |
| M4: Registry | M1, M2 | M5, M6 |
| M5: VoiceSession | M0, M3, M4 | M6 |
| M6: WebSocket Server | M0, M4, M5 | M7, M10 |
| M7: useVoiceAgent | M0, M6 | M8, M10 |
| M8: UI Components | M7 | M10 |
| M9: Additional Adapters | M0, M1, M4 | M10 |
| M10: Integration | M0, M6, M7, M8, M9 | — |

---

## Audio Fixture Requirements Summary

| Milestone | Required Fixtures | Purpose |
|-----------|-------------------|---------|
| M0 | All | Create the fixtures |
| M1 | Basic utterances | Validate interface contracts |
| M2 | Utterances + edge cases | Adapter quality validation |
| M3 | Conversations | Multi-turn pipeline testing |
| M5 | Conversations | Session context testing |
| M6 | All | Server integration tests |
| M7 | Utterances | Client audio injection |
| M9 | Utterances | Adapter comparison |
| M10 | All conversations | Full E2E validation |

---

## Risk Mitigation

**Highest-risk areas:**

1. **AsyncIterable streaming patterns** — Subtle bugs in backpressure, error propagation. Mitigate: Build comprehensive test harness in M1, validate with real audio fixtures in M2.

2. **Audio capture browser compatibility** — getUserMedia varies across browsers. Mitigate: Test on Chrome, Firefox, Safari early in M7. Build fixture injection for testing.

3. **Latency targets** — May be unrealistic for certain provider combinations. Mitigate: Measure early in M2 with real audio, adjust targets or provider recommendations based on data.

4. **Context preservation** — LLMs may lose context across turns. Mitigate: Build context-dependent conversation fixtures, test explicitly in M3/M5.

5. **Audio fixture quality** — Poor recordings lead to flaky tests. Mitigate: Record in controlled environment, validate WER against multiple providers in M2.

---

## Timeline Estimate

Assuming one senior engineer full-time:

| Milestone | Duration | Cumulative |
|-----------|----------|------------|
| M0: Test Fixtures | 3-4 days | 4 days |
| M1 | 2-3 days | 7 days |
| M2 | 4-5 days | 12 days |
| M3 | 2-3 days | 15 days |
| M4 | 1-2 days | 17 days |
| M5 | 2-3 days | 20 days |
| M6 | 3-4 days | 24 days |
| M7 | 3-4 days | 28 days |
| M8 | 2-3 days | 31 days |
| M9 | 5-7 days | 38 days |
| M10 | 3-4 days | 42 days |

**Total: ~9 weeks** to production-ready with full provider coverage and comprehensive testing.

MVP (M0-M8 with minimal adapters): ~6 weeks.