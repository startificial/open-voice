#!/usr/bin/env python3
"""
Generate synthetic voice test fixtures using local audio generation.
Creates placeholder audio files for testing infrastructure when external APIs are unavailable.
These can be replaced with real TTS audio by running the Eleven Labs script locally.
"""

import os
import json
import math
import struct
import wave
from pathlib import Path
from typing import List, Tuple

# Base paths
BASE_DIR = Path("/sessions/pensive-kind-cerf/mnt/open_voice/test/fixtures")
AUDIO_DIR = BASE_DIR / "audio"
TRANSCRIPTS_DIR = BASE_DIR / "transcripts"


def generate_sine_wave(frequency: float, duration: float, sample_rate: int = 16000, volume: float = 0.5) -> bytes:
    """Generate a sine wave."""
    num_samples = int(sample_rate * duration)
    samples = []
    for i in range(num_samples):
        sample = volume * math.sin(2 * math.pi * frequency * i / sample_rate)
        samples.append(int(sample * 32767))
    return struct.pack('<' + 'h' * len(samples), *samples)


def generate_speech_like_audio(text: str, sample_rate: int = 16000) -> bytes:
    """
    Generate speech-like audio based on text length.
    Uses varying frequencies and patterns to simulate speech rhythm.
    """
    # Estimate duration based on text length (average 150 words/minute, 5 chars/word)
    words = len(text.split())
    duration = max(0.5, words * 0.4)  # ~0.4 seconds per word

    samples = []
    num_samples = int(sample_rate * duration)

    # Create varying frequency patterns to simulate speech
    base_freq = 150  # Base frequency for speech

    for i in range(num_samples):
        t = i / sample_rate

        # Create formant-like frequencies that vary over time
        freq1 = base_freq + 50 * math.sin(2 * math.pi * 3 * t)  # Slow variation
        freq2 = base_freq * 2 + 100 * math.sin(2 * math.pi * 5 * t)  # Second formant
        freq3 = base_freq * 3 + 150 * math.sin(2 * math.pi * 7 * t)  # Third formant

        # Combine multiple frequencies
        sample = 0.4 * math.sin(2 * math.pi * freq1 * t)
        sample += 0.3 * math.sin(2 * math.pi * freq2 * t)
        sample += 0.2 * math.sin(2 * math.pi * freq3 * t)

        # Add amplitude envelope (attack, sustain, decay for syllables)
        syllable_rate = 4  # syllables per second
        envelope = 0.5 + 0.5 * math.sin(2 * math.pi * syllable_rate * t)

        # Add some noise for breathiness
        noise = 0.1 * (((i * 1103515245 + 12345) % (2**31)) / (2**31) - 0.5)

        final_sample = (sample * envelope + noise) * 0.8
        samples.append(int(final_sample * 32767))

    return struct.pack('<' + 'h' * len(samples), *samples)


def generate_silence(duration: float, sample_rate: int = 16000) -> bytes:
    """Generate silence."""
    num_samples = int(sample_rate * duration)
    samples = [0] * num_samples
    return struct.pack('<' + 'h' * len(samples), *samples)


def save_wav(audio_data: bytes, output_path: Path, sample_rate: int = 16000):
    """Save audio data as WAV file."""
    output_path = output_path.with_suffix('.wav')
    with wave.open(str(output_path), 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data)
    print(f"  [OK] Generated: {output_path.name}")


def save_json(data: dict, path: Path):
    """Save JSON data to file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"  [OK] Saved: {path.name}")


def create_transcript_json(name: str, transcript: str, metadata: dict = None) -> dict:
    """Create a transcript JSON object."""
    return {
        "name": name,
        "transcript": transcript,
        "sampleRate": 16000,
        "channels": 1,
        "bitDepth": 16,
        "format": "wav",
        "metadata": metadata or {}
    }


# =============================================================================
# UTTERANCE DEFINITIONS
# =============================================================================

UTTERANCES = {
    "hello-world": {
        "text": "Hello world. This is a test of the voice agent system.",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "quick-question": {
        "text": "What's the weather like today?",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "long-explanation": {
        "text": "I'd like to explain my situation in detail. Last week, I purchased a product from your online store, and when it arrived, I noticed that the packaging was damaged. Upon opening it, I found that the item inside was also affected. The screen had a visible crack running from the top left corner to the bottom right. I tried to contact customer support through your website, but the chat feature wasn't working properly. I then sent an email to your support team, but I haven't received a response yet. I'm really hoping we can resolve this issue quickly because I need to use this product for an important presentation next week. Could you please help me with a replacement or refund?",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "whispered": {
        "text": "I need to speak quietly because others are sleeping nearby.",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "volume": "low"}
    },
    "accented-speech": {
        "text": "Good morning! I would like to make a reservation for dinner tonight, please.",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "british"}
    },
}


CONVERSATIONS = {
    "greeting-flow": {
        "description": "Basic greeting and response flow to test simple conversation handling",
        "turns": [
            {"role": "user", "audioFile": "01-user-hello.wav", "transcript": "Hello! How are you doing today?", "contextRequired": []},
            {"role": "agent", "audioFile": "02-agent-response.wav", "transcript": "Hello! I'm doing great, thank you for asking. How can I help you today?", "contextRequired": []},
            {"role": "user", "audioFile": "03-user-followup.wav", "transcript": "I was wondering if you could help me find some information.", "delayBeforeMs": 500, "contextRequired": []},
            {"role": "agent", "audioFile": "04-agent-response.wav", "transcript": "Of course! I'd be happy to help you find information. What would you like to know about?", "contextRequired": []}
        ],
        "expectedBehavior": {"minTurns": 4, "contextMustBePreserved": [], "interruptionHandled": False}
    },
    "customer-service": {
        "description": "Customer service scenario with complaint handling",
        "turns": [
            {"role": "user", "audioFile": "01-user-complaint.wav", "transcript": "Hi, I'm calling about a problem with my recent order. The item arrived damaged.", "contextRequired": []},
            {"role": "user", "audioFile": "02-user-provides-details.wav", "transcript": "The order number is 12345. It was a laptop, and the screen is cracked.", "delayBeforeMs": 1000, "contextRequired": ["damaged order"]},
            {"role": "user", "audioFile": "03-user-confirms.wav", "transcript": "Yes, I would like a replacement please. Shipping to the same address is fine.", "delayBeforeMs": 500, "contextRequired": ["order 12345", "replacement request"]}
        ],
        "expectedBehavior": {"minTurns": 3, "contextMustBePreserved": ["order number", "damage description", "replacement preference"], "interruptionHandled": False}
    },
    "interruption-flow": {
        "description": "Tests interrupt handling when user cuts off agent mid-response",
        "turns": [
            {"role": "user", "audioFile": "01-user-starts.wav", "transcript": "Can you tell me about the history of artificial intelligence?", "contextRequired": []},
            {"role": "user", "audioFile": "02-user-interrupts-midway.wav", "transcript": "Actually, wait. I changed my mind. Can you just give me a brief summary instead?", "isInterruption": True, "delayBeforeMs": 200, "contextRequired": ["AI history topic"]},
            {"role": "user", "audioFile": "03-user-continues.wav", "transcript": "That's perfect, thank you. Now, what about machine learning specifically?", "delayBeforeMs": 500, "contextRequired": ["AI context", "brief summary received"]}
        ],
        "expectedBehavior": {"minTurns": 3, "contextMustBePreserved": ["AI topic", "preference for brief responses"], "interruptionHandled": True}
    },
    "context-dependent": {
        "description": "Tests that agent maintains context across turns for pronoun resolution and implicit references",
        "turns": [
            {"role": "user", "audioFile": "01-user-sets-context.wav", "transcript": "I'm planning a trip to Paris next month.", "contextRequired": []},
            {"role": "agent", "audioFile": "agent-response-context.wav", "transcript": "Paris is wonderful! What aspects of your trip can I help with?", "contextRequired": ["Paris", "next month"]},
            {"role": "user", "audioFile": "02-user-followup.wav", "transcript": "What's the weather like there?", "delayBeforeMs": 500, "contextRequired": ["Paris"]},
            {"role": "agent", "audioFile": "agent-response-weather.wav", "transcript": "In Paris next month, you can expect mild temperatures around 15 to 20 degrees Celsius. It's a lovely time to visit!", "contextRequired": ["Paris", "month from turn 1"]},
            {"role": "user", "audioFile": "03-user-another-followup.wav", "transcript": "And good restaurants?", "delayBeforeMs": 300, "contextRequired": ["Paris"]}
        ],
        "expectedBehavior": {"minTurns": 5, "contextMustBePreserved": ["Paris", "trip planning", "time of visit"], "interruptionHandled": False}
    }
}


EDGE_CASES = {
    "very-short-utterance": {
        "text": "Yes.",
        "metadata": {"duration": "very_short", "content": "single_word"}
    },
    "very-long-utterance": {
        "text": "This is an extremely long utterance designed to test the system's ability to handle extended speech segments. I'm going to continue speaking for quite a while to ensure that the audio processing pipeline can manage longer recordings without any issues. Let me tell you a story. Once upon a time, there was a developer who wanted to build the perfect voice agent system. They started by creating comprehensive test fixtures, including various types of speech patterns, accents, and conversation flows. The developer knew that testing was crucial for building reliable software. The journey wasn't easy. There were many challenges along the way, including handling different audio formats, managing streaming data, and ensuring low latency responses. But with persistence and careful planning, the developer made steady progress. Thank you for listening to this long utterance.",
        "metadata": {"duration": "very_long", "content": "extended_narrative"}
    },
    "non-english-spanish": {
        "text": "Hola, buenos dias. Me gustaria hacer una reservacion para esta noche, por favor.",
        "metadata": {"language": "spanish", "content": "greeting_and_request"}
    },
    "numbers-and-spelling": {
        "text": "My phone number is 555-123-4567. That's five five five, one two three, four five six seven. My email is john dot smith at example dot com.",
        "metadata": {"content": "numbers_and_contact_info"}
    },
    "speech-then-silence": {
        "text": "I'm going to say something and then pause.",
        "metadata": {"pattern": "speech_then_silence"}
    },
    "silence-then-speech": {
        "text": "After a moment of silence, I am now speaking.",
        "metadata": {"pattern": "silence_then_speech"}
    },
    "silence-3s": {
        "text": "",
        "is_silence": True,
        "duration": 3.0,
        "metadata": {"duration_ms": 3000, "content": "silence"}
    },
    "noisy-background": {
        "text": "This speech has some background noise mixed in.",
        "add_noise": True,
        "metadata": {"speaker": "test_user", "noiseLevel": "medium", "accent": "american"}
    },
    "multiple-speakers": {
        "text": "First speaker says hello. Second speaker responds with greetings.",
        "metadata": {"speaker": "multiple", "noiseLevel": "clean"}
    },
}


def generate_utterances():
    """Generate all single utterance audio files and transcripts."""
    print("\n=== Generating Single Utterances ===")
    utterances_dir = AUDIO_DIR / "utterances"
    utterances_dir.mkdir(parents=True, exist_ok=True)

    for name, data in UTTERANCES.items():
        output_path = utterances_dir / name

        # Generate speech-like audio
        audio_data = generate_speech_like_audio(data["text"])
        save_wav(audio_data, output_path)

        # Save transcript
        transcript_data = create_transcript_json(name, data["text"], data.get("metadata"))
        save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")


def generate_conversations():
    """Generate all conversation audio files and manifests."""
    print("\n=== Generating Conversations ===")

    for conv_name, conv_data in CONVERSATIONS.items():
        print(f"\nConversation: {conv_name}")
        conv_dir = AUDIO_DIR / "conversations" / conv_name
        conv_dir.mkdir(parents=True, exist_ok=True)

        for turn in conv_data["turns"]:
            audio_file = turn["audioFile"].replace('.wav', '')
            output_path = conv_dir / audio_file

            audio_data = generate_speech_like_audio(turn["transcript"])
            save_wav(audio_data, output_path)

        # Create manifest
        manifest = {
            "name": conv_name,
            "description": conv_data["description"],
            "turns": conv_data["turns"],
            "expectedBehavior": conv_data["expectedBehavior"]
        }
        save_json(manifest, conv_dir / "manifest.json")

        # Save conversation transcript
        conv_transcript_dir = TRANSCRIPTS_DIR / "conversations"
        save_json(manifest, conv_transcript_dir / f"{conv_name}.json")


def generate_edge_cases():
    """Generate edge case audio files."""
    print("\n=== Generating Edge Cases ===")
    edge_cases_dir = AUDIO_DIR / "edge-cases"
    edge_cases_dir.mkdir(parents=True, exist_ok=True)

    for name, data in EDGE_CASES.items():
        output_path = edge_cases_dir / name

        if data.get("is_silence"):
            audio_data = generate_silence(data.get("duration", 3.0))
        elif data.get("add_noise"):
            # Generate speech with added noise
            audio_data = generate_speech_like_audio(data["text"])
            # Add simple noise by mixing
            noise_samples = len(audio_data) // 2
            noise = bytes([
                ((i * 1103515245 + 12345) % 256) for i in range(noise_samples * 2)
            ])
            # Mix noise at lower volume
            mixed = bytearray(audio_data)
            for i in range(0, min(len(noise), len(mixed)), 2):
                orig = struct.unpack('<h', mixed[i:i+2])[0]
                noise_val = struct.unpack('<h', noise[i:i+2])[0] if i+1 < len(noise) else 0
                mixed_val = int(orig * 0.8 + noise_val * 0.2)
                mixed_val = max(-32768, min(32767, mixed_val))
                mixed[i:i+2] = struct.pack('<h', mixed_val)
            audio_data = bytes(mixed)
        else:
            audio_data = generate_speech_like_audio(data.get("text", ""))

        save_wav(audio_data, output_path)

        # Save transcript
        transcript_data = create_transcript_json(name, data.get("text", ""), data.get("metadata"))
        save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Synthetic Voice Test Fixtures Generator")
    print("Generating placeholder audio for infrastructure testing")
    print("=" * 60)

    # Create directories
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    generate_utterances()
    generate_conversations()
    generate_edge_cases()

    print("\n" + "=" * 60)
    print("Generation Complete!")
    print("=" * 60)
    print(f"\nFiles generated in: {BASE_DIR}")
    print("\nNOTE: These are synthetic placeholder audio files.")
    print("For real TTS audio, run the Eleven Labs script locally:")
    print("  python test/generators/generate_fixtures.py")


if __name__ == "__main__":
    main()
