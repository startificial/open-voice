#!/usr/bin/env python3
"""
Generate voice test fixtures using Eleven Labs TTS API.
Creates audio files and transcript JSON files for testing voice agent pipelines.
"""

import os
import json
import requests
import time
from pathlib import Path

# Eleven Labs API configuration
ELEVENLABS_API_KEY = "sk_76b8a6b59e2b83c42fe340dba75041ced6032a2e8074d206"
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1"

# Base paths
BASE_DIR = Path("/sessions/pensive-kind-cerf/mnt/open_voice/test/fixtures")
AUDIO_DIR = BASE_DIR / "audio"
TRANSCRIPTS_DIR = BASE_DIR / "transcripts"

# Voice IDs (using default voices from Eleven Labs)
# We'll use different voices for user vs agent to simulate realistic conversations
VOICES = {
    "user_male": "pNInz6obpgDQGcFmaJgB",      # Adam - for user utterances
    "user_female": "21m00Tcm4TlvDq8ikWAM",    # Rachel - alternative user voice
    "agent": "EXAVITQu4vr4xnSDxMaL",          # Bella - for agent responses
    "whisper": "21m00Tcm4TlvDq8ikWAM",        # Rachel for whispered content
}

# Default voice settings
VOICE_SETTINGS = {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": True
}

WHISPER_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.5,
    "style": 0.0,
    "use_speaker_boost": False
}


def generate_speech(text: str, voice_id: str, output_path: Path, voice_settings: dict = None) -> bool:
    """Generate speech using Eleven Labs API and save to file."""
    settings = voice_settings or VOICE_SETTINGS

    url = f"{ELEVENLABS_API_URL}/text-to-speech/{voice_id}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }

    data = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": settings
    }

    try:
        response = requests.post(url, json=data, headers=headers)

        if response.status_code == 200:
            # Save as mp3 first, then we'll note that conversion may be needed
            mp3_path = output_path.with_suffix('.mp3')
            with open(mp3_path, 'wb') as f:
                f.write(response.content)
            print(f"  [OK] Generated: {mp3_path.name}")
            return True
        else:
            print(f"  [ERROR] {output_path.name}: {response.status_code} - {response.text[:100]}")
            return False
    except Exception as e:
        print(f"  [ERROR] {output_path.name}: {str(e)}")
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


# =============================================================================
# SINGLE UTTERANCES
# =============================================================================

UTTERANCES = {
    "hello-world": {
        "text": "Hello world. This is a test of the voice agent system.",
        "voice": "user_male",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "quick-question": {
        "text": "What's the weather like today?",
        "voice": "user_male",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "long-explanation": {
        "text": """I'd like to explain my situation in detail. Last week, I purchased a product from your
        online store, and when it arrived, I noticed that the packaging was damaged. Upon opening it,
        I found that the item inside was also affected. The screen had a visible crack running from
        the top left corner to the bottom right. I tried to contact customer support through your
        website, but the chat feature wasn't working properly. I then sent an email to your support
        team, but I haven't received a response yet. I'm really hoping we can resolve this issue
        quickly because I need to use this product for an important presentation next week. Could you
        please help me with a replacement or refund?""",
        "voice": "user_female",
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "accent": "american"}
    },
    "whispered": {
        "text": "I need to speak quietly because others are sleeping nearby.",
        "voice": "whisper",
        "voice_settings": WHISPER_SETTINGS,
        "metadata": {"speaker": "test_user", "noiseLevel": "clean", "volume": "low"}
    },
    "accented-speech": {
        "text": "Good morning! I would like to make a reservation for dinner tonight, please.",
        "voice": "user_female",
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
                "audioFile": "01-user-hello.mp3",
                "transcript": "Hello! How are you doing today?",
                "voice": "user_male",
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "02-agent-response.mp3",
                "transcript": "Hello! I'm doing great, thank you for asking. How can I help you today?",
                "voice": "agent",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "03-user-followup.mp3",
                "transcript": "I was wondering if you could help me find some information.",
                "voice": "user_male",
                "delayBeforeMs": 500,
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "04-agent-response.mp3",
                "transcript": "Of course! I'd be happy to help you find information. What would you like to know about?",
                "voice": "agent",
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
                "audioFile": "01-user-complaint.mp3",
                "transcript": "Hi, I'm calling about a problem with my recent order. The item arrived damaged.",
                "voice": "user_male",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "02-user-provides-details.mp3",
                "transcript": "The order number is 12345. It was a laptop, and the screen is cracked.",
                "voice": "user_male",
                "delayBeforeMs": 1000,
                "contextRequired": ["damaged order"]
            },
            {
                "role": "user",
                "audioFile": "03-user-confirms.mp3",
                "transcript": "Yes, I would like a replacement please. Shipping to the same address is fine.",
                "voice": "user_male",
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
                "audioFile": "01-user-starts.mp3",
                "transcript": "Can you tell me about the history of artificial intelligence?",
                "voice": "user_male",
                "contextRequired": []
            },
            {
                "role": "user",
                "audioFile": "02-user-interrupts-midway.mp3",
                "transcript": "Actually, wait. I changed my mind. Can you just give me a brief summary instead?",
                "voice": "user_male",
                "isInterruption": True,
                "delayBeforeMs": 200,
                "contextRequired": ["AI history topic"]
            },
            {
                "role": "user",
                "audioFile": "03-user-continues.mp3",
                "transcript": "That's perfect, thank you. Now, what about machine learning specifically?",
                "voice": "user_male",
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
                "audioFile": "01-user-sets-context.mp3",
                "transcript": "I'm planning a trip to Paris next month.",
                "voice": "user_female",
                "contextRequired": []
            },
            {
                "role": "agent",
                "audioFile": "agent-response-context.mp3",
                "transcript": "Paris is wonderful! What aspects of your trip can I help with?",
                "voice": "agent",
                "contextRequired": ["Paris", "next month"]
            },
            {
                "role": "user",
                "audioFile": "02-user-followup.mp3",
                "transcript": "What's the weather like there?",
                "voice": "user_female",
                "delayBeforeMs": 500,
                "contextRequired": ["Paris"]
            },
            {
                "role": "agent",
                "audioFile": "agent-response-weather.mp3",
                "transcript": "In Paris next month, you can expect mild temperatures around 15 to 20 degrees Celsius. It's a lovely time to visit!",
                "voice": "agent",
                "contextRequired": ["Paris", "month from turn 1"]
            },
            {
                "role": "user",
                "audioFile": "03-user-another-followup.mp3",
                "transcript": "And good restaurants?",
                "voice": "user_female",
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
        "voice": "user_male",
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

        As the system evolved, new features were added: interrupt handling, context preservation
        across conversation turns, and support for multiple speech-to-text and text-to-speech
        providers. Each feature required its own set of tests to ensure reliability.

        The moral of this story is that good testing is the foundation of reliable software.
        By investing time in creating comprehensive test fixtures, developers can catch bugs
        early and build systems that work well in the real world.

        Thank you for listening to this long utterance. I hope it serves as a useful test case
        for your voice agent system.""",
        "voice": "user_male",
        "metadata": {"duration": "very_long", "content": "extended_narrative"}
    },
    "non-english-spanish": {
        "text": "Hola, buenos dias. Me gustaria hacer una reservacion para esta noche, por favor.",
        "voice": "user_female",
        "metadata": {"language": "spanish", "content": "greeting_and_request"}
    },
    "numbers-and-spelling": {
        "text": "My phone number is 555-123-4567. That's five five five, one two three, four five six seven. My email is john dot smith at example dot com.",
        "voice": "user_male",
        "metadata": {"content": "numbers_and_contact_info"}
    },
    "speech-then-silence": {
        "text": "I'm going to say something and then pause.",
        "voice": "user_male",
        "metadata": {"pattern": "speech_then_silence"}
    },
    "silence-then-speech": {
        "text": "After a moment of silence, I am now speaking.",
        "voice": "user_male",
        "metadata": {"pattern": "silence_then_speech"}
    },
}


def generate_utterances():
    """Generate all single utterance audio files and transcripts."""
    print("\n=== Generating Single Utterances ===")
    utterances_dir = AUDIO_DIR / "utterances"
    utterances_dir.mkdir(parents=True, exist_ok=True)

    for name, data in UTTERANCES.items():
        voice_id = VOICES[data["voice"]]
        voice_settings = data.get("voice_settings", VOICE_SETTINGS)
        output_path = utterances_dir / f"{name}.mp3"

        # Generate audio
        success = generate_speech(data["text"], voice_id, output_path, voice_settings)

        if success:
            # Save transcript JSON
            transcript_data = create_transcript_json(name, data["text"], data.get("metadata"))
            save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")

        # Rate limiting - Eleven Labs has request limits
        time.sleep(1)


def generate_conversations():
    """Generate all conversation audio files and manifests."""
    print("\n=== Generating Conversations ===")

    for conv_name, conv_data in CONVERSATIONS.items():
        print(f"\nConversation: {conv_name}")
        conv_dir = AUDIO_DIR / "conversations" / conv_name
        conv_dir.mkdir(parents=True, exist_ok=True)

        # Generate audio for each turn
        for turn in conv_data["turns"]:
            voice_id = VOICES[turn["voice"]]
            output_path = conv_dir / turn["audioFile"]

            success = generate_speech(turn["transcript"], voice_id, output_path)
            time.sleep(1)  # Rate limiting

        # Create manifest.json
        manifest = {
            "name": conv_name,
            "description": conv_data["description"],
            "turns": [
                {
                    "role": turn["role"],
                    "audioFile": turn["audioFile"],
                    "transcript": turn["transcript"],
                    "delayBeforeMs": turn.get("delayBeforeMs"),
                    "isInterruption": turn.get("isInterruption"),
                    "contextRequired": turn.get("contextRequired", [])
                }
                for turn in conv_data["turns"]
            ],
            "expectedBehavior": conv_data["expectedBehavior"]
        }

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
        voice_id = VOICES[data["voice"]]
        output_path = edge_cases_dir / f"{name}.mp3"

        success = generate_speech(data["text"], voice_id, output_path)

        if success:
            # Save transcript JSON
            transcript_data = create_transcript_json(name, data["text"], data.get("metadata"))
            save_json(transcript_data, TRANSCRIPTS_DIR / f"{name}.json")

        time.sleep(1)  # Rate limiting


def generate_silence_files():
    """Generate silence audio files using pydub."""
    print("\n=== Generating Silence Files ===")
    try:
        from pydub import AudioSegment
        from pydub.generators import Silence

        edge_cases_dir = AUDIO_DIR / "edge-cases"

        # 3 second silence
        silence_3s = AudioSegment.silent(duration=3000)
        silence_3s.export(edge_cases_dir / "silence-3s.mp3", format="mp3")
        print("  [OK] Generated: silence-3s.mp3")

        # Save transcript for silence
        save_json(
            {"name": "silence-3s", "transcript": "", "metadata": {"duration_ms": 3000, "content": "silence"}},
            TRANSCRIPTS_DIR / "silence-3s.json"
        )

    except ImportError:
        print("  [WARN] pydub not available, skipping silence generation")
    except Exception as e:
        print(f"  [ERROR] Could not generate silence files: {e}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Voice Test Fixtures Generator")
    print("Using Eleven Labs TTS API")
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
