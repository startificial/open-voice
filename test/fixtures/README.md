# Voice Agent Test Fixtures

This directory contains audio fixtures and transcripts for testing voice agent pipelines.

## Directory Structure

```
test/fixtures/
├── audio/                   # All audio files (canonical location)
│   ├── utterances/          # Single speech segments (5 files)
│   │   ├── hello-world.wav
│   │   ├── quick-question.wav
│   │   ├── long-explanation.wav
│   │   ├── whispered.wav
│   │   └── accented-speech.wav
│   │
│   ├── conversations/       # Multi-turn conversation sequences (4 flows)
│   │   ├── greeting-flow/
│   │   │   ├── manifest.json
│   │   │   ├── 01-user-hello.wav
│   │   │   ├── 02-agent-response.wav
│   │   │   ├── 03-user-followup.wav
│   │   │   └── 04-agent-response.wav
│   │   ├── customer-service/
│   │   ├── interruption-flow/
│   │   └── context-dependent/
│   │
│   └── edge-cases/          # Edge case audio (9 files)
│       ├── very-short-utterance.wav
│       ├── numbers-and-spelling.wav
│       ├── silence-3s.wav
│       ├── silence-then-speech.wav
│       ├── speech-then-silence.wav
│       ├── noisy-background.wav
│       ├── non-english-spanish.wav
│       ├── multiple-speakers.wav
│       └── very-long-utterance.wav
│
└── transcripts/             # Ground truth transcripts (JSON)
    ├── hello-world.json
    ├── quick-question.json
    ├── whispered.json
    ├── accented-speech.json
    ├── long-explanation.json
    ├── very-short-utterance.json
    ├── numbers-and-spelling.json
    ├── silence-3s.json
    ├── noisy-background.json
    ├── ... (all edge cases)
    └── conversations/
        ├── greeting-flow.json
        ├── customer-service.json
        ├── interruption-flow.json
        └── context-dependent.json
```

## Audio Format

All audio files follow these specifications:
- **Format**: WAV
- **Sample Rate**: 16,000 Hz
- **Bit Depth**: 16-bit
- **Channels**: Mono
- **Codec**: PCM signed 16-bit little-endian

## Utterances (5 fixtures)

| File | Text | Duration |
|------|------|----------|
| hello-world.wav | "Hello world. This is a test of the voice agent system." | ~3s |
| quick-question.wav | "What's the weather like today?" | ~1.5s |
| long-explanation.wav | "The voice agent system processes audio input..." | ~21s |
| whispered.wav | "This is a whispered message, spoken very quietly and softly." | ~3.6s |
| accented-speech.wav | "Hello, my name is Maria..." | ~6.3s |

## Conversations (4 flows)

### greeting-flow
A 4-turn basic greeting and assistance conversation.

### customer-service
A 3-turn customer service complaint flow.

### interruption-flow
A 3-turn conversation testing interrupt handling.

### context-dependent
A 5-turn conversation testing context preservation (Paris trip planning).

## Edge Cases (9 fixtures)

| File | Purpose |
|------|---------|
| very-short-utterance.wav | Minimal utterance ("Hi.") |
| numbers-and-spelling.wav | Numeric/phonetic recognition |
| silence-3s.wav | Pure silence |
| silence-then-speech.wav | Delayed start |
| speech-then-silence.wav | Trailing silence |
| noisy-background.wav | Background noise handling |
| non-english-spanish.wav | Non-English language |
| multiple-speakers.wav | Speaker diarization |
| very-long-utterance.wav | Extended speech (~60s) |

## Transcript JSON Format

```json
{
  "id": "hello-world",
  "transcript": "Hello world. This is a test of the voice agent system.",
  "duration_ms": 3050,
  "speaker": "Rachel",
  "language": "en",
  "source": "elevenlabs",
  "audio_format": {
    "sample_rate": 16000,
    "channels": 1,
    "bit_depth": 16
  }
}
```

## Conversation Manifest Format

```json
{
  "name": "greeting-flow",
  "description": "Basic greeting and response flow",
  "turns": [
    {
      "role": "user",
      "audioFile": "01-user-hello.wav",
      "transcript": "Hello! How are you doing today?",
      "contextRequired": []
    },
    {
      "role": "agent",
      "audioFile": "02-agent-response.wav",
      "transcript": "Hello! I'm doing great...",
      "contextRequired": []
    }
  ],
  "expectedBehavior": {
    "minTurns": 4,
    "contextMustBePreserved": [],
    "interruptionHandled": false
  }
}
```

## Using the Test Harness

```typescript
import { createTestHarness } from '../harness';

const harness = createTestHarness({ fixturesDir: 'test/fixtures/audio' });

// Load a single utterance
const fixture = await harness.fixtureLoader.loadUtterance('hello-world');

// Stream audio in chunks
for await (const chunk of harness.fixtureLoader.streamAudio(fixture)) {
  // Process chunk
}

// Validate transcription
const result = harness.transcriptValidator.validate(
  'hello word',  // STT output
  'hello world'  // Expected
);
console.log(`WER: ${result.wordErrorRate}`);

// Run a conversation
const conversation = await harness.fixtureLoader.loadConversation('greeting-flow');
const result = await harness.conversationRunner.runConversation(
  conversation,
  pipeline,
  { simulateRealtime: true }
);
```

## Quality Requirements

For STT testing:
- Clean utterances should achieve < 10% Word Error Rate
- Noisy utterances should achieve < 25% Word Error Rate

For latency testing:
- Cascade pipeline: < 800ms p95
- Local pipeline: < 500ms p95
- S2S pipeline: < 200ms p95

## Generation

These fixtures were generated using Eleven Labs Text-to-Speech API with the Rachel voice.

**Generated**: January 2026
**Voice**: Rachel (Eleven Labs)
**Source**: elevenlabs.io
