# Voice Agent Architecture

A simple, extensible system for building voice agents.

---

## Principles

| Principle | How We Apply It |
|-----------|-----------------|
| **DRY** | One interface for all providers |
| **Abstraction** | Hide provider details behind adapters |
| **Simplicity** | 4 core interfaces, everything else composes them |
| **Readability** | Convention over configuration, sensible defaults |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│              React + shadcn/ui + Tailwind                  │
│                           │                                 │
│                    useVoiceAgent()                         │
└───────────────────────────┼─────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────┼─────────────────────────────────┐
│                      MIDDLEWARE                              │
│                           │                                  │
│                    VoiceSession                              │
│                           │                                  │
│            ┌──────────────┴──────────────┐                  │
│            ▼                             ▼                   │
│     CascadePipeline               S2SPipeline               │
│      STT → LLM → TTS              PersonaPlex               │
│            │                             │                   │
│            └──────────────┬──────────────┘                  │
│                           │                                  │
│              All implement: Adapter<I, O>                   │
└───────────────────────────┴─────────────────────────────────┘
```

---

## Core Interfaces

Everything builds on these four types.

### 1. Adapter

```typescript
// One interface. All providers implement this. No exceptions.
interface Adapter<TInput, TOutput> {
  name: string;
  type: 'stt' | 'llm' | 'tts' | 's2s';
  
  stream(input: AsyncIterable<TInput>): AsyncIterable<TOutput>;
  interrupt(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
```

### 2. Pipeline

```typescript
// Pipelines process audio → audio. Both modes use the same interface.
interface Pipeline {
  process(input: AsyncIterable<Audio>): AsyncIterable<Audio>;
  interrupt(): Promise<void>;
}

// Cascade: chains three adapters
class CascadePipeline implements Pipeline {
  constructor(stt: Adapter, llm: Adapter, tts: Adapter) {}
  
  async *process(audio) {
    yield* this.tts.stream(this.llm.stream(this.stt.stream(audio)));
  }
}

// S2S: wraps one adapter
class S2SPipeline implements Pipeline {
  constructor(s2s: Adapter) {}
  
  process(audio) {
    return this.s2s.stream(audio);
  }
}
```

### 3. Session

```typescript
// Manages a conversation. Doesn't know about providers.
class VoiceSession {
  constructor(pipeline: Pipeline) {}
  
  converse(audio: AsyncIterable<Audio>) {
    return this.pipeline.process(audio);
  }
  
  interrupt() {
    return this.pipeline.interrupt();
  }
}
```

### 4. Registry

```typescript
// Register once, use anywhere. No scattered initialization.
class AdapterRegistry {
  register(adapter: Adapter): void;
  get(type: string, name: string): Adapter;
}
```

---

## Adding a Provider

Three lines. No other files change.

```typescript
// 1. Implement the interface
class DeepgramSTT implements Adapter<Audio, string> { ... }

// 2. Register it
registry.register(new DeepgramSTT(apiKey));

// 3. Use it
const config = { providers: { stt: 'deepgram' } };
```

Every adapter looks the same:

```typescript
class AnyAdapter implements Adapter<TIn, TOut> {
  name = 'provider-name';
  type = 'stt' | 'llm' | 'tts' | 's2s';
  
  async *stream(input) {
    // Connect to provider
    // Forward input
    // Yield output
  }
  
  async interrupt() {
    // Cancel in-flight requests
  }
  
  async isHealthy() {
    // Ping provider
  }
}
```

---

## Client

One hook. Composable components.

### useVoiceAgent()

```typescript
function useVoiceAgent(config: Config) {
  return {
    // State
    status: 'idle' | 'listening' | 'processing' | 'speaking',
    transcript: Message[],
    metrics: Metrics,
    
    // Actions
    connect(): void,
    disconnect(): void,
    startListening(): void,
    stopListening(): void,
    interrupt(): void,
  };
}
```

### Components

All built on shadcn/ui. Each does one thing.

```
components/voice/
├── VoiceAgent.tsx      # Full agent (composes others)
├── MicButton.tsx       # Toggle listening
├── Transcript.tsx      # Message history
├── AudioVisualizer.tsx # Waveform
├── StatusBadge.tsx     # Connection state
└── LatencyDisplay.tsx  # Metrics
```

### Theming

Tweakcn → CSS variables → All components update.

```css
:root {
  --primary: 221 83% 53%;    /* Brand color */
  --accent: 142 76% 36%;     /* Active state */
  --destructive: 0 84% 60%;  /* End call */
}
```

Change variables, entire UI rebrands. No component changes.

---

## Configuration

One object. Explicit provider selection.

```typescript
interface Config {
  endpoint: string;
  mode: 'cascade' | 's2s';
  
  // Cascade mode: all three required
  providers?: {
    stt: string;   // e.g., 'deepgram', 'whisper'
    llm: string;   // e.g., 'openai', 'ollama'
    tts: string;   // e.g., 'elevenlabs', 'piper'
  };
  
  // S2S mode: one required
  s2s?: string;    // e.g., 'personaplex', 'moshi'
  
  agent?: {
    systemPrompt?: string;             // default: 'You are a helpful assistant.'
    voice?: string;                    // provider-specific voice ID
    persona?: { voice, rolePrompt };   // S2S only
  };
}
```

### Examples

```typescript
// Cloud cascade
{
  endpoint: 'wss://voice.example.com',
  mode: 'cascade',
  providers: { stt: 'deepgram', llm: 'openai', tts: 'elevenlabs' }
}

// Local cascade
{
  endpoint: 'wss://localhost:3000',
  mode: 'cascade',
  providers: { stt: 'whisper', llm: 'ollama', tts: 'piper' }
}

// S2S with PersonaPlex
{
  endpoint: 'wss://voice.example.com',
  mode: 's2s',
  s2s: 'personaplex',
  agent: { persona: { voice: 'NATF0', rolePrompt: 'You are a customer service agent.' } }
}
```

---

## Protocol

Simple WebSocket messages. Provider details don't leak through.

```typescript
// Client → Server (3 types)
{ type: 'audio', data: ArrayBuffer }
{ type: 'config', config: Partial<Config> }
{ type: 'interrupt' }

// Server → Client (5 types)
{ type: 'audio', data: ArrayBuffer }
{ type: 'transcript', role: 'user' | 'agent', text: string }
{ type: 'status', status: Status }
{ type: 'metrics', latency: Metrics }
{ type: 'error', code: string, message: string }
```

---

## Providers

All implement `Adapter<I, O>`. Swap freely.

| Type | Provider | Local | Notes |
|------|----------|-------|-------|
| STT | Deepgram | ❌ | Best cloud |
| | Whisper | ✅ | Best local |
| | AssemblyAI | ❌ | |
| LLM | OpenAI | ❌ | GPT-4o |
| | Claude | ❌ | |
| | Groq | ❌ | Fastest |
| | Ollama | ✅ | Easy local |
| | vLLM | ✅ | Production local |
| TTS | ElevenLabs | ❌ | Best quality |
| | Cartesia | ❌ | Lowest latency |
| | Piper | ✅ | Fast local |
| S2S | PersonaPlex | ✅ | Best open-source |
| | Moshi | ✅ | |

---

## File Structure

Organized by responsibility.

```
packages/
├── core/               # Interfaces only
│   ├── adapter.ts
│   ├── pipeline.ts
│   ├── session.ts
│   └── registry.ts
│
├── adapters/           # All providers
│   ├── stt/
│   │   ├── deepgram.ts
│   │   ├── whisper.ts
│   │   └── index.ts
│   ├── llm/
│   ├── tts/
│   └── s2s/
│
├── server/             # WebSocket server
│   └── index.ts
│
└── ui/                 # React components
    ├── hooks/
    │   └── use-voice-agent.ts
    └── components/
        └── voice/
```

---

## Server Setup

```typescript
// server/index.ts
import { VoiceServer, AdapterRegistry } from '@voice-agent/core';
import { DeepgramSTT, WhisperSTT } from '@voice-agent/adapters/stt';
import { OpenAILLM, OllamaLLM } from '@voice-agent/adapters/llm';
import { ElevenLabsTTS, PiperTTS } from '@voice-agent/adapters/tts';
import { PersonaPlexS2S } from '@voice-agent/adapters/s2s';

const registry = new AdapterRegistry();

// Register all available adapters
registry.register(new DeepgramSTT(process.env.DEEPGRAM_KEY));
registry.register(new WhisperSTT());
registry.register(new OpenAILLM(process.env.OPENAI_KEY));
registry.register(new OllamaLLM());
registry.register(new ElevenLabsTTS(process.env.ELEVENLABS_KEY));
registry.register(new PiperTTS());
registry.register(new PersonaPlexS2S(process.env.PERSONAPLEX_ENDPOINT));

// Start
new VoiceServer({ registry }).listen(3000);
```

---

## Deployment

One deployment. Config determines behavior.

```yaml
services:
  voice-server:
    image: voice-agent/server
    environment:
      # Required
      - MODE=cascade  # or 's2s'
      
      # Provider credentials (use what you need)
      - DEEPGRAM_KEY
      - OPENAI_KEY
      - ELEVENLABS_KEY
      - OLLAMA_ENDPOINT=http://ollama:11434
      - PERSONAPLEX_ENDPOINT=http://personaplex:8000
    ports:
      - "3000:3000"

  # Optional: local LLM
  ollama:
    image: ollama/ollama
    profiles: ["local"]
    
  # Optional: local S2S
  personaplex:
    image: voice-agent/personaplex
    profiles: ["s2s"]
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

### Run Modes

```bash
# Cloud cascade (default)
docker compose up voice-server

# Local cascade
docker compose --profile local up

# S2S
docker compose --profile s2s up
```

Provider selection is explicit via config — no auto-discovery.

---

## Latency

| Mode | Target | How |
|------|--------|-----|
| Cascade (cloud) | <800ms | Deepgram + Groq + Cartesia |
| Cascade (local) | <500ms | Whisper + vLLM + Piper |
| S2S | <200ms | PersonaPlex (single model, full-duplex) |

---

## Testing

Adapters share one interface → mock one interface.

```typescript
class MockSTT implements Adapter<Audio, string> {
  async *stream() { yield 'test'; }
  async interrupt() {}
  async isHealthy() { return true; }
}

test('pipeline processes audio', async () => {
  const pipeline = new CascadePipeline(new MockSTT(), new MockLLM(), new MockTTS());
  const output = await collect(pipeline.process(mockAudio()));
  expect(output.length).toBeGreaterThan(0);
});
```

---

## Summary

**4 interfaces:**
- `Adapter` — wraps any provider
- `Pipeline` — processes audio
- `VoiceSession` — orchestrates conversation
- `AdapterRegistry` — manages providers

**1 hook:**
- `useVoiceAgent()` — all client functionality

**1 config:**
- Override what you need, defaults handle the rest

**1 deployment:**
- Same server, different config

That's the entire architecture.