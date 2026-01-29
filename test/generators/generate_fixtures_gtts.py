#!/usr/bin/env python3
"""
Generate voice test fixtures using Google Text-to-Speech (gTTS).
Creates audio files and transcript JSON files for testing voice agent pipelines.
Falls back from Eleven Labs when API is not accessible.
"""

import os
import json
import time
from pathlib import Path
from gtts import gTTS
from pydub import AudioSegment
from pydub.generators import Sine

# Base paths
BASE_DIR = Path("/sessions/pensive-kind-cerf/mnt/open_voice/test/fixtures")
AUDIO_DIR = BASE_DIR / "audio"
TRANSCRIPTS_DIR = BASE_DIR / "transcripts"


def generate_speech(text: str, output_path: Path, lang: str = 'en', slow: bool = False) -> bool:
    """Generate speech using gTTS and save to file."""
    try:
        tts = gTTS(text=text, lang=lang, slow=slow)
        mp3_path = output_path.with_suffix('.mp3')
        tts.save(str(mp3_path))
        print(f"  [OK] Generated: {mp3_path.name}")
        return True
    except Exception as e:
        print(f"  [ERROR] {output_path.name}: {str(e)}")
        return False


def generate_wav(mp3_path: Path) -> bool:
    """Convert MP3 to WAV format (16kHz, 16-bit, mono)."""
    try:
        audio = AudioSegment.from_mp3(str(mp3_path))
        # Convert to standard test format: 16kHz, 16-bit, mono
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        wav_path = mp3_path.with_suffix('.wav')
        audio.export(str(wav_path), format='wav')
        print(f"  [OK] Converted: {wav_path.name}")
        return True
    except Exception as e:
        print(f"  [WARN] WAV conversion failed for {mp3_path.name}: {e}")
        return False


def create_transcript_json(name: str, transcript: str, metadata: dict = None) -> dict:
    """Create a transcript JSON object."""
    return {
        "name": name,
        "transcript": transcript,
        "metadata": metadata or {}
    }


def save_json(data: dict, path: Path):
    """Save JSON data to file."""
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"  [OK] Saved: {path.name}")


def generate_silence(duration_ms: int, output_path: Path) -> bool:
    """Generate a silent audio file."""
    try:
        silence = AudioSegment.silent(duration=duration_ms)
        silence = silence.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        mp3_path = output_path.with_suffix('.mp3')
        wav_path = output_path.with_suffix('.wav')
        silence.export(str(mp3_path), format='mp3')
        silence.export(str(wav_path), format='wav')
        print(f"  [OK] Generated silence: {mp3_path.name}")
        return True
    except Exception as e:
        print(f"  [ERROR] Silence generation failed: {e}")
        return False


def generate_tone_beep(output_path: Path, frequency: int = 440, duration_ms: int = 500) -> bool:
    """Generate a simple tone beep for testing."""
    try:
        tone = Sine(frequency).to_audio_segment(duration=duration_ms)
        tone = tone.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        mp3_path = output_path.with_suffix('.mp3')
        tone.export(str(mp3_path), format='mp3')
        print(f"  [OK] Generated tone: {mp3_path.name}")
        return True
    except Exception as e:
        print(f"  [ERROR] Tone generation failed: {e}")
        return False


# =============================================================================
# SINGLE UTTERANCES
# =============================================================================

UTTERANCES = {
    "hello-world": {
        "text": "Hello world. This is a test of the voice agent system.",
        "lang": "en",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "neutral"}
    },
    "quick-question": {
        "text": "What's the weather like today?",
        "lang": "en",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "neutral"}
    },
    "long-explanation": {
        "text": """I'd like to explain my situation in detail. Last week, I purchased a product from your
        online store, and when it arrived, I noticed that the packaging was damaged. Upon opening it,
        I found that the item inside was also affected. The screen had a visible crack running from
        the top left corner to the bottom right. I tried to contact customer support through your
        website, but the chat feature wasn't working properly. I then sent an email to your support
        team, but I haven't received a response yet. I'm really hoping we can resolve this issue
        quickly because I need to use this product for an important presentation next week. Could you
        please help me with a replacement or refund?""".replace('\n', ' ').strip(),
        "lang": "en",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "neutral"}
    },
    "whispered": {
        "text": "I need to speak quietly because others are sleeping nearby.",
        "lang": "en",
        "slow": True,  # Slower speech to simulate whispering effect
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "volume": "low"}
    },
    "accented-speech": {
        "text": "Good morning! I would like to make a reservation for dinner tonight, please.",
        "lang": "en-uk",  # British English
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "british"}
    },
}


# =============================================================================
# CONVERSATIONS
# =============================================================================

CONVERSATIONS = {
    "greeting-flow": {
        "description": "Basic greeting and response flow to test simple conversation handling",
        "turns": [
            {
                "role": "user",
                "audioFile": "01-user-hello",
                "transcript": "Hello! How are you doing today?",
                "lang": "en",
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "02-agent-response",
                "transcript": "Hello! I'm doing great, thank you for asking. How can I help you today?",
                "lang": "en",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "03-user-followup",
                "transcript": "I was wondering if you could help me find some information.",
                "lang": "en",
                "delayBeforeMs": 500,
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "04-agent-response",
                "transcript": "Of course! I'd be happy to help you find information. What would you like to know about?",
                "lang": "en",
                "contextRequired": []
            }
        ],
        "expectedBehavior": {
            "minTurns": 4,
            "contextMustBePreserved": [],
            "interruptionHandled": False
        }
    },
    "customer-service": {
        "description": "Customer service scenario with complaint handling",
        "turns": [
            {
                "role": "user",
                "audioFile": "01-user-complaint",
                "transcript": "Hi, I'm calling about a problem with my recent order. The item arrived damaged.",
                "lang": "en",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "02-user-provides-details",
                "transcript": "The order number is 12345. It was a laptop, and the screen is cracked.",
                "lang": "en",
                "delayBeforeMs": 1000,
                "contextRequired": ["damaged order"]
            },
            {
                "role": "user",
                "audioFile": "03-user-confirms",
                "transcript": "Yes, I would like a replacement please. Shipping to the same address is fine.",
                "lang": "en",
                "delayBeforeMs": 500,
                "contextRequired": ["order 12345", "replacement request"]
            }
        ],
        "expectedBehavior": {
            "minTurns": 3,
            "contextMustBePreserved": ["order number", "damage description", "replacement preference"],
            "interruptionHandled": False
        }
    },
    "interruption-flow": {
        "description": "Tests interrupt handling when user cuts off agent mid-response",
        "turns": [
            {
                "role": "user",
                "audioFile": "01-user-starts",
                "transcript": "Can you tell me about the history of artificial intelligence?",
                "lang": "en",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "02-user-interrupts-midway",
                "transcript": "Actually, wait. I changed my mind. Can you just give me a brief summary instead?",
                "lang": "en",
                "isInterruption": True,
                "delayBeforeMs": 200,
                "contextRequired": ["AI history topic"]
            },
            {
                "role": "user",
                "audioFile": "03-user-continues",
                "transcript": "That's perfect, thank you. Now, what about machine learning specifically?",
                "lang": "en",
                "delayBeforeMs": 500,
                "contextRequired": ["AI context", "brief summary received"]
            }
        ],
        "expectedBehavior": {
            "minTurns": 3,
            "contextMustBePreserved": ["AI topic", "preference for brief responses"],
            "interruptionHandled": True
        }
    },
    "context-dependent": {
        "description": "Tests that agent maintains context across turns for pronoun resolution and implicit references",
        "turns": [
            {
                "role": "user",
                "audioFile": "01-user-sets-context",
                "transcript": "I'm planning a trip to Paris next month.",
                "lang": "en",
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "agent-response-context",
                "transcript": "Paris is wonderful! What aspects of your trip can I help with?",
                "lang": "en",
                "contextRequired": ["Paris", "next month"]
            },
            {
                "role": "user",
                "audioFile": "02-user-followup",
                "transcript": "What's the weather like there?",
                "lang": "en",
                "delayBeforeMs": 500,
                "contextRequired": ["Paris"]
            },
            {
                "role": "agent",
                "audioFile": "agent-response-weather",
                "transcript": "In Paris next month, you can expect mild temperatures around 15 to 20 degrees Celsius. It's a lovely time to visit!",
                "lang": "en",
                "contextRequired": ["Paris", "month from turn 1"]
            },
            {
                "role": "user",
                "audioFile": "03-user-another-followup",
                "transcript": "And good restaurants?",
                "lang": "en",
                "delayBeforeMs": 300,
                "contextRequired": ["Paris"]
            }
        ],
        "expectedBehavior": {
            "minTurns": 5,
            "contextMustBePreserved": ["Paris", "trip planning", "time of visit"],
            "interruptionHandled": False
        }
    }
}


# =============================================================================
# EDGE CASES
# =============================================================================

EDGE_CASES = {
    "very-short-utterance": {
        "text": "Yes.",
        "lang": "en",
        "metadata": {"duration": "very_short", "content": "single_word"}
    },
    "very-long-utterance": {
        "text": """This is an extremely long utterance designed to test the system's ability to handle
        extended speech segments. I'm going to continue speaking for quite a while to ensure that
        the audio processing pipeline can manage longer recordings without any issues.
        Let me tell you a story. Once upon a time, there was a developer who wanted to build the
        perfect voice agent system. They started by creating comprehensive test fixtures, including
        various types of speech patterns, accents, and conversation flows. The developer knew that
        testing was crucial for building reliable software.
        The journey wasn't easy. There were many challenges along the way, including handling
        different audio formats, managing streaming data, and ensuring low latency responses.
        But with persistence and careful planning, the developer made steady progress.
        One of the key insights was that real-world testing with actual audio files was far more
        valuable than synthetic test data. This led to the creation of a comprehensive test fixture
        library that covered various scenarios including clean speech, noisy backgrounds, different
        accents, and multi-turn conversations.
        Thank you for listening to this long utterance.""".replace('\n', ' ').strip(),
        "lang": "en",
        "metadata": {"duration": "very_long", "content": "extended_narrative"}
    },
    "non-english-spanish": {
        "text": "Hola, buenos dias. Me gustaria hacer una reservacion para esta noche, por favor.",
        "lang": "es",
        "metadata": {"language": "spanish", "content": "greeting_and_request"}
    },
    "numbers-and-spelling": {
        "text": "My phone number is 555-123-4567. That's five five five, one two three, four five six seven. My email is john dot smith at example dot com.",
        "lang": "en",
        "metadata": {"content": "numbers_and_contact_info"}
    },
    "speech-then-silence": {
        "text": "I'm going to say something and then pause.",
        "lang": "en",
        "metadata": {"pattern": "speech_then_silence"}
    },
    "silence-then-speech": {
        "text": "After a moment of silence, I am now speaking.",
        "lang": "en",
        "metadata": {"pattern": "silence_then_speech"}
    },
}


def generate_utterances():
    """Generate all single utterance audio files and transcripts."""
    print("\n=== Generating Single Utterances ===")
    utterances_dir = AUDIO_DIR / "utterances"
    utterances_dir.mkdir(parents=True, exist_ok=True)

    for name, data in UTTERANCES.items():
        output_path = utterances_dir / name
        lang = data.get("lang", "en")
        slow = data.get("slow", False)

        # Generate audio
        success = generate_speech(data["text"], output_path, lang, slow)

        if success:
            # Also convert to WAV
            generate_wav(output_path.with_suffix('.mp3'))

            # Save transcript JSON
            transcript_data = create_transcript_json(name, data["text"], data.get("metadata"))
            save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")

        time.sleep(0.5)  # Small delay between requests


def generate_conversations():
    """Generate all conversation audio files and manifests."""
    print("\n=== Generating Conversations ===")

    for conv_name, conv_data in CONVERSATIONS.items():
        print(f"\nConversation: {conv_name}")
        conv_dir = AUDIO_DIR / "conversations" / conv_name
        conv_dir.mkdir(parents=True, exist_ok=True)

        # Generate audio for each turn
        for turn in conv_data["turns"]:
            output_path = conv_dir / turn["audioFile"]
            lang = turn.get("lang", "en")

            success = generate_speech(turn["transcript"], output_path, lang)
            if success:
                generate_wav(output_path.with_suffix('.mp3'))
            time.sleep(0.5)

        # Create manifest.json (with .mp3 extensions for audio files)
        manifest = {
            "name": conv_name,
            "description": conv_data["description"],
            "turns": [
                {
                    "role": turn["role"],
                    "audioFile": turn["audioFile"] + ".wav",
                    "transcript": turn["transcript"],
                    "delayBeforeMs": turn.get("delayBeforeMs"),
                    "isInterruption": turn.get("isInterruption"),
                    "contextRequired": turn.get("contextRequired", [])
                }
                for turn in conv_data["turns"]
            ],
            "expectedBehavior": conv_data["expectedBehavior"]
        }

        # Clean up None values
        for turn in manifest["turns"]:
            if turn["delayBeforeMs"] is None:
                del turn["delayBeforeMs"]
            if turn["isInterruption"] is None:
                del turn["isInterruption"]

        save_json(manifest, conv_dir / "manifest.json")

        # Also save conversation transcript
        conv_transcript_dir = TRANSCRIPTS_DIR / "conversations"
        conv_transcript_dir.mkdir(parents=True, exist_ok=True)
        save_json(manifest, conv_transcript_dir / f"{conv_name}.json")


def generate_edge_cases():
    """Generate edge case audio files."""
    print("\n=== Generating Edge Cases ===")
    edge_cases_dir = AUDIO_DIR / "edge-cases"
    edge_cases_dir.mkdir(parents=True, exist_ok=True)

    for name, data in EDGE_CASES.items():
        output_path = edge_cases_dir / name
        lang = data.get("lang", "en")

        success = generate_speech(data["text"], output_path, lang)

        if success:
            generate_wav(output_path.with_suffix('.mp3'))

            # Save transcript JSON
            transcript_data = create_transcript_json(name, data["text"], data.get("metadata"))
            save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")

        time.sleep(0.5)


def generate_silence_files():
    """Generate silence audio files."""
    print("\n=== Generating Silence Files ===")
    edge_cases_dir = AUDIO_DIR / "edge-cases"
    edge_cases_dir.mkdir(parents=True, exist_ok=True)

    # 3 second silence
    generate_silence(3000, edge_cases_dir / "silence-3s")
    save_json(
        {"name": "silence-3s", "transcript": "", "metadata": {"duration_ms": 3000, "content": "silence"}},
        TRANSCRIPTS_DIR / "silence-3s.json"
    )


def main():
    """Main entry point."""
    print("=" * 60)
    print("Voice Test Fixtures Generator (gTTS)")
    print("Using Google Text-to-Speech API")
    print("=" * 60)

    # Create directories
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    # Generate all fixtures
    generate_utterances()
    generate_conversations()
    generate_edge_cases()
    generate_silence_files()

    print("\n" + "=" * 60)
    print("Generation Complete!")
    print("=" * 60)

    # Summary
    print(f"\nFiles generated in: {BASE_DIR}")
    print(f"  Audio files: {AUDIO_DIR}")
    print(f"  Transcripts: {TRANSCRIPTS_DIR}")


if __name__ == "__main__":
    main()
