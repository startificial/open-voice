# Voice Agent Test Fixtures

This directory contains audio fixtures and transcripts for testing voice agent pipelines.

## Directory Structure

```
test/fixtures/
├── utterances/              # Single speech segments
│   ├── hello-world.wav
│   ├── hello-world.json
│   ├── quick-question.wav
│   ├── quick-question.json
│   ├── long-explanation.wav
│   ├── long-explanation.json
│   ├── whispered.wav
│   ├── whispered.json
│   ├── accented-speech.wav
│   └── accented-speech.json
│
├── conversations/           # Multi-turn sequences
│   └── greeting-flow/
│       ├── manifest.json
│       ├── turn-01-user.wav
│       ├── turn-01-user.json
│       ├── turn-02-agent.wav
│       ├── turn-02-agent.json
│       ├── turn-03-user.wav
│       ├── turn-03-user.json
│       ├── turn-04-agent.wav
│       └── turn-04-agent.json
│
└── edge-cases/
    ├── very-short-utterance.wav
    ├── very-short-utterance.json
    ├── numbers-and-spelling.wav
    └── numbers-and-spelling.json
```

## Current Audio Files

The current audio files are **real TTS audio** generated using Eleven Labs Text-to-Speech
with the Rachel voice. All files are high-quality speech suitable for STT testing.

## Audio Format

All audio files follow these specifications:
- **Format**: WAV
- **Sample Rate**: 16,000 Hz
- **Bit Depth**: 16-bit
- **Channels**: Mono
- **Codec**: PCM signed 16-bit little-endian

## Utterances

| File | Text | Duration |
|------|------|----------|
| hello-world.wav | "Hello world. This is a test of the voice agent system." | ~3s |
| quick-question.wav | "What's the weather like today?" | ~1.5s |
| long-explanation.wav | "The voice agent system processes audio input..." | ~21s |
| whispered.wav | "This is a whispered message, spoken very quietly and softly." | ~3.6s |
| accented-speech.wav | "Hello, my name is Maria..." | ~6.3s |

## Conversations

### greeting-flow
A 4-turn conversation simulating a customer service greeting:
1. **User**: "Hello! How are you doing today?"
2. **Agent**: "Hello! I'm doing great, thank you for asking. How can I help you today?"
3. **User**: "I just wanted to check on my account status."
4. **Agent**: "Of course! I'd be happy to help you with that. Could you please provide your account number?"

## Edge Cases

| File | Text | Purpose |
|------|------|---------|
| very-short-utterance.wav | "Hi." | Test minimal utterance recognition |
| numbers-and-spelling.wav | "My account number is 1 2 3 4 5 6 7 8 9..." | Test numeric/phonetic recognition |

## Transcript JSON Format

```json
{
  "id": "hello-world",
  "text": "Hello world. This is a test of the voice agent system.",
  "duration_ms": 3050,
  "speaker": "Rachel",
  "language": "en",
  "source": "elevenlabs",
  "audio_format": {
    "sample_rate": 16000,
    "channels": 1,
    "bit_depth": 16
  },
  "words": [
    { "word": "Hello", "start_ms": 0, "end_ms": 400 },
    ...
  ]
}
```

## Conversation Manifest Format

```json
{
  "id": "greeting-flow",
  "name": "Greeting Flow Conversation",
  "description": "A basic greeting and account inquiry conversation flow",
  "turns": [
    {
      "turn": 1,
      "role": "user",
      "audio_file": "turn-01-user.wav",
      "transcript_file": "turn-01-user.json",
      "text": "Hello! How are you doing today?"
    },
    ...
  ],
  "total_duration_ms": 12620
}
```

## Using the Test Harness

```typescript
import { createTestHarness } from '../harness';

const harness = createTestHarness({ fixturesDir: 'test/fixtures' });

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

**Generated**: January 29, 2026
**Voice**: Rachel (Eleven Labs)
**Source**: elevenlabs.io
