from fastapi import APIRouter, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI
import os
import sys
import tempfile
import subprocess
import httpx
import wave
import re
import random
from app.config import settings

router = APIRouter()

# ---------------------------------------------------------------------------
# Speech metrics analysis
# ---------------------------------------------------------------------------

def analyze_speech_metrics(text: str, segments: list, duration: float) -> dict:
    words = re.findall(r'\b\w+\b', text.lower())
    
    # 1. Repetitions (lặp từ)
    repetitions = 0
    for i in range(1, len(words)):
        if words[i] == words[i-1]:
            repetitions += 1
            
    # 2. Hesitations (ngập ngừng)
    fillers = {"ờ", "ừm", "à", "ừ", "um", "uh", "hmm", "like", "well", "so"}
    hesitations = sum(1 for w in words if w in fillers)
    
    # 3. Pauses (ngắt quãng)
    pauses_count = 0
    total_pause_time = 0.0
    if segments:
        for i in range(1, len(segments)):
            prev_seg = segments[i-1]
            curr_seg = segments[i]
            prev_end = getattr(prev_seg, "end", prev_seg.get("end", 0)) if isinstance(prev_seg, dict) else getattr(prev_seg, "end", 0)
            curr_start = getattr(curr_seg, "start", curr_seg.get("start", 0)) if isinstance(curr_seg, dict) else getattr(curr_seg, "start", 0)
            gap = curr_start - prev_end
            if gap > 0.5: # 0.5s threshold
                pauses_count += 1
                total_pause_time += gap
    else:
        # Fallback estimation
        est_speech_time = len(words) / 2.5
        if duration > est_speech_time + 1.0:
            total_pause_time = duration - est_speech_time
            pauses_count = int(total_pause_time / 1.0)
            
    return {
        "duration_seconds": round(duration, 1),
        "pauses_count": pauses_count,
        "total_pause_seconds": round(total_pause_time, 1),
        "hesitations_count": hesitations,
        "repetitions_count": repetitions
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _looks_invalid_key(value: str | None) -> bool:
    if not value:
        return True
    lowered = value.lower()
    return any(marker in lowered for marker in (
        "invalid", "test_key", "your_", "paste_", "replace_",
        "free-gateway", "changeme", "placeholder", "xxx",
    ))


# Whisper hallucination patterns (silent/noise audio produces these)
# All entries are compared lowercase and with trailing punctuation stripped
WHISPER_HALLUCINATIONS = {
    "1", "1.", "", ".", "..", "...", "…",
    "thank you", "thanks for watching", "thank you for watching", "subscribe to my channel",
    "đây là câu nói tiếng việt", "cảm ơn các bạn đã xem", "hẹn gặp lại", "you",
    "hãy subscribe cho kênh", "đăng ký kênh", "la la la school", "chào các bạn",
    "cám ơn các bạn đã xem", "cảm ơn bạn đã xem", "cám ơn bạn đã xem",
    "cảm ơn các bạn đã theo dõi", "cảm ơn đã xem", "cám ơn đã xem", "cảm ơn", "cám ơn",
    "thanks for watching!", "thank you for watching!", "please subscribe", "please subscribe!",
    "subscribe to my channel!", "subscribe", "subscribers", "sub", "please sub",
    "cảm ơn các bạn đã xem video này", "cảm ơn các bạn đã xem video", "cảm ơn bạn đã xem video này",
    "cảm ơn đã xem video này", "cám ơn các bạn đã xem video này", "cám ơn", "cảm ơn bạn", "cám ơn bạn",
    "cảm ơn các bạn", "cám ơn các bạn", "thank you.", "thanks.",
    "cảm ơn các bạn đã theo dõi video này", "cám ơn các bạn đã theo dõi video này",
    "subcribe", "subscribers", "please like and subscribe", "like and subscribe",
    "bạn học tiếng anh", "chúc các bạn một ngày tốt lành", "hẹn gặp lại các bạn",
    "chúc các bạn", "chúc các bạn một ngày", "tiếng anh", "tiếng việt"
}

def _is_hallucination(text: str, prompt: str) -> bool:
    """Check if transcription is a known Whisper hallucination."""
    if not text:
        return True
    
    # Normalize: lowercase, strip outer spaces and common ending punctuation
    clean_text = text.strip().lower()
    stripped = clean_text.rstrip(".,?!:;… ")
    
    # Check if exact match in predefined hallucination set
    if stripped in WHISPER_HALLUCINATIONS or clean_text in WHISPER_HALLUCINATIONS:
        return True
        
    # Check if it matches exactly the system/transcription prompt
    clean_prompt = prompt.strip().lower()
    if clean_text == clean_prompt or stripped == clean_prompt.rstrip(".,?!:;… "):
        return True
        
    # Catch dynamic variations of common English & Vietnamese Whisper hallucinations
    lower_text = clean_text
    
    # Dynamic checks for subscribe, thanks for watching, etc.
    hallucination_substrings = [
        "thanks for watching",
        "thank you for watching",
        "thank you very much for watching",
        "subscribe to",
        "subscribe",
        "please subscribe",
        "đăng ký kênh",
        "cảm ơn các bạn đã xem",
        "cám ơn các bạn đã xem",
        "cảm ơn bạn đã xem",
        "cám ơn bạn đã xem",
        "cảm ơn các bạn đã theo dõi",
        "cám ơn các bạn đã theo dõi",
        "hẹn gặp lại các bạn",
        "la la la"
    ]
    for pattern in hallucination_substrings:
        if pattern in lower_text:
            # If the transcription contains these phrases and is relatively short, it's highly likely a hallucination
            if len(lower_text) < len(pattern) + 15:
                return True
                
    # Detect repetitive word loop pattern: "you you you", "thank you thank you", etc.
    words = lower_text.split()
    if len(words) >= 4:
        # e.g., "you you you you"
        unique_words = set(words)
        if len(unique_words) == 1:
            return True
            
        # e.g., "thank you thank you thank you"
        if len(words) >= 6:
            # check 2-word repetitions
            phrases_2 = [" ".join(words[i:i+2]) for i in range(0, len(words) - 1, 2)]
            if len(set(phrases_2)) == 1:
                return True
            # check 3-word repetitions
            phrases_3 = [" ".join(words[i:i+3]) for i in range(0, len(words) - 2, 3)]
            if len(set(phrases_3)) == 1:
                return True
                
    # Extremely short single-char or just punctuation
    if len(stripped) <= 1:
        return True
        
    return False

def _has_ffmpeg() -> bool:
    import shutil
    return shutil.which("ffmpeg") is not None

def _convert_to_wav(input_path: str) -> str:
    """Convert audio to WAV using ffmpeg if available, for better Whisper compatibility."""
    if not _has_ffmpeg():
        return ""
        
    wav_path = input_path.rsplit(".", 1)[0] + ".wav"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", wav_path],
            capture_output=True, timeout=15
        )
        if result.returncode == 0 and os.path.exists(wav_path):
            return wav_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass  # ffmpeg not installed or timed out
    return ""


# ---------------------------------------------------------------------------
# Weighted round-robin provider selection
# ---------------------------------------------------------------------------
# STT_WEIGHTS env var format: "groq:3,nvidia:3,deepgram:2,openai:1,cloudflare:1"
# Higher weight = more traffic. Unconfigured providers are automatically skipped.

_ALL_STT_PROVIDERS = ["groq", "nvidia", "deepgram", "openai", "cloudflare"]

def _parse_stt_weights() -> dict[str, int]:
    """Parse STT_WEIGHTS env var into {provider: weight} dict."""
    raw = os.getenv("STT_WEIGHTS", "groq:3,nvidia:3,deepgram:2,openai:1,cloudflare:1")
    weights = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if ":" in pair:
            name, w = pair.split(":", 1)
            name = name.strip().lower()
            try:
                weights[name] = max(int(w.strip()), 0)
            except ValueError:
                weights[name] = 1
    return weights


def _get_available_providers() -> list[str]:
    """Return list of providers that have valid API keys configured."""
    available = []
    if not _looks_invalid_key(settings.groq_api_key):
        available.append("groq")
    if not _looks_invalid_key(settings.nvidia_api_key):
        available.append("nvidia")
    if not _looks_invalid_key(os.getenv("DEEPGRAM_API_KEY")):
        available.append("deepgram")
    if not _looks_invalid_key(os.getenv("OPENAI_API_KEY")):
        available.append("openai")
    if not _looks_invalid_key(os.getenv("CLOUDFLARE_API_KEY")):
        available.append("cloudflare")
    return available


def _pick_provider_order() -> list[str]:
    """Return providers ordered by weighted random selection.

    Each call shuffles the order so traffic is distributed.
    Providers with higher weight appear first more often.
    Unconfigured or zero-weight providers are excluded.
    """
    weights = _parse_stt_weights()
    available = _get_available_providers()

    # Filter to only configured + non-zero weight
    pool = [(p, weights.get(p, 0)) for p in available if weights.get(p, 0) > 0]
    if not pool:
        # Fallback: return whatever is available with equal weight
        return available

    # Weighted shuffle: pick one-by-one without replacement
    ordered = []
    remaining = list(pool)
    while remaining:
        total = sum(w for _, w in remaining)
        r = random.uniform(0, total)
        cumulative = 0
        for i, (provider, weight) in enumerate(remaining):
            cumulative += weight
            if r <= cumulative:
                ordered.append(provider)
                remaining.pop(i)
                break
    return ordered


# ---------------------------------------------------------------------------
# STT provider implementations
# ---------------------------------------------------------------------------

async def _transcribe_with_cloudflare(audio_bytes: bytes) -> str:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    api_key = os.getenv("CLOUDFLARE_API_KEY")
    if _looks_invalid_key(account_id) or _looks_invalid_key(api_key):
        raise HTTPException(
            status_code=500,
            detail="No valid speech-to-text provider configured. Set NVIDIA_API_KEY, GROQ_API_KEY or CLOUDFLARE_API_KEY.",
        )

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/openai/whisper"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/octet-stream",
            },
            content=audio_bytes,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Cloudflare STT error {response.status_code}: {response.text}")

    payload = response.json()
    result = payload.get("result") or {}
    return (result.get("text") or payload.get("text") or "").strip()


async def _transcribe_with_nvidia(temp_path: str, language: str, prompt: str) -> tuple[str, list, float]:
    nvidia_api_key = settings.nvidia_api_key
    if _looks_invalid_key(nvidia_api_key):
        return "", [], 0.0

    try:
        client = AsyncOpenAI(api_key=nvidia_api_key, base_url="https://integrate.api.nvidia.com/v1")
        with open(temp_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                file=audio_file,
                model="openai/whisper-large-v3",
                language=language,
                temperature=0.0,
                prompt=prompt,
                response_format="verbose_json"
            )
        text = transcription.text.strip() if hasattr(transcription, "text") else transcription.get("text", "").strip()
        segments = getattr(transcription, "segments", [])
        if not segments and isinstance(transcription, dict):
            segments = transcription.get("segments", [])
            
        duration = getattr(transcription, "duration", 0.0)
        if not duration and isinstance(transcription, dict):
            duration = transcription.get("duration", 0.0)
            
        return text, segments, duration
    except Exception as e:
        print(f"[STT] Nvidia error: {e}", file=sys.stderr)
        return "", [], 0.0


async def _transcribe_with_groq(temp_path: str, language: str, prompt: str) -> tuple[str, list, float]:
    groq_api_key = settings.groq_api_key
    if _looks_invalid_key(groq_api_key):
        return "", [], 0.0

    try:
        client = AsyncOpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1")
        with open(temp_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3",
                language=language,
                temperature=0.0,
                prompt=prompt,
                response_format="verbose_json"
            )
        text = transcription.text.strip() if hasattr(transcription, "text") else transcription.get("text", "").strip()
        segments = getattr(transcription, "segments", [])
        if not segments and isinstance(transcription, dict):
            segments = transcription.get("segments", [])
            
        duration = getattr(transcription, "duration", 0.0)
        if not duration and isinstance(transcription, dict):
            duration = transcription.get("duration", 0.0)
            
        return text, segments, duration
    except Exception as e:
        print(f"[STT] Groq error: {e}", file=sys.stderr)
        return "", [], 0.0


async def _transcribe_with_deepgram(temp_path: str, language: str) -> tuple[str, list, float]:
    """Transcribe using Deepgram Nova-2 API (free tier: 12,500 min/month)."""
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if _looks_invalid_key(api_key):
        return "", [], 0.0

    try:
        lang_code = "en" if language.startswith("en") else "vi"
        url = f"https://api.deepgram.com/v1/listen?model=nova-2&language={lang_code}&smart_format=true&utterances=true"

        with open(temp_path, "rb") as f:
            audio_bytes = f.read()

        # Detect content type from file extension
        ext = os.path.splitext(temp_path)[1].lower()
        content_type_map = {
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".webm": "audio/webm",
            ".mp4": "audio/mp4",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
        }
        content_type = content_type_map.get(ext, "audio/wav")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": content_type,
                },
                content=audio_bytes,
            )

        if response.status_code != 200:
            print(f"[STT] Deepgram error {response.status_code}: {response.text[:200]}", file=sys.stderr)
            return "", [], 0.0

        payload = response.json()
        results = payload.get("results", {})
        channels = results.get("channels", [])
        if not channels:
            return "", [], 0.0

        alt = channels[0].get("alternatives", [{}])[0]
        text = alt.get("transcript", "").strip()
        duration = results.get("duration", 0.0)

        # Convert Deepgram utterances → segments format
        segments = []
        for utt in results.get("utterances", []):
            segments.append({
                "start": utt.get("start", 0.0),
                "end": utt.get("end", 0.0),
                "text": utt.get("transcript", ""),
            })

        return text, segments, duration
    except Exception as e:
        print(f"[STT] Deepgram error: {e}", file=sys.stderr)
        return "", [], 0.0


async def _transcribe_with_openai(temp_path: str, language: str, prompt: str) -> tuple[str, list, float]:
    """Transcribe using OpenAI Whisper API directly (pay-per-use, $0.006/min)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if _looks_invalid_key(api_key):
        return "", [], 0.0

    try:
        client = AsyncOpenAI(api_key=api_key)
        with open(temp_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1",
                language=language,
                temperature=0.0,
                prompt=prompt,
                response_format="verbose_json"
            )
        text = transcription.text.strip() if hasattr(transcription, "text") else transcription.get("text", "").strip()
        segments = getattr(transcription, "segments", [])
        if not segments and isinstance(transcription, dict):
            segments = transcription.get("segments", [])

        duration = getattr(transcription, "duration", 0.0)
        if not duration and isinstance(transcription, dict):
            duration = transcription.get("duration", 0.0)

        return text, segments, duration
    except Exception as e:
        print(f"[STT] OpenAI error: {e}", file=sys.stderr)
        return "", [], 0.0


# ---------------------------------------------------------------------------
# Unified transcription dispatcher (weighted round-robin + fallback)
# ---------------------------------------------------------------------------

async def _transcribe_roundrobin(
    temp_path: str,
    language: str | None,
    prompt: str,
    audio_bytes: bytes | None = None,
) -> tuple[str, list, float, str]:
    order = _pick_provider_order()
    print(f"[STT] Provider order for this request: {order}", file=sys.stderr)

    is_standard = temp_path.lower().endswith((".wav", ".mp3"))

    for provider in order:
        text = ""
        segments: list = []
        duration = 0.0

        # Skip providers that don't natively support WebM/M4A/AAC/OGG if we couldn't convert it
        if not is_standard and provider in {"nvidia", "cloudflare"}:
            print(f"[STT] Skipping {provider} because file format is non-standard and no ffmpeg for WAV conversion", file=sys.stderr)
            continue

        try:
            if provider == "groq":
                text, segments, duration = await _transcribe_with_groq(temp_path, language, prompt)
            elif provider == "nvidia":
                text, segments, duration = await _transcribe_with_nvidia(temp_path, language, prompt)
            elif provider == "deepgram":
                text, segments, duration = await _transcribe_with_deepgram(temp_path, language)
            elif provider == "openai":
                text, segments, duration = await _transcribe_with_openai(temp_path, language, prompt)
            elif provider == "cloudflare":
                if audio_bytes is None:
                    with open(temp_path, "rb") as f:
                        audio_bytes = f.read()
                raw = await _transcribe_with_cloudflare(audio_bytes)
                if raw:
                    text = raw
        except Exception as e:
            print(f"[STT] {provider} failed: {e}", file=sys.stderr)
            continue

        if text and not _is_hallucination(text, prompt):
            print(f"[STT] Success via {provider}: {text[:60]}...", file=sys.stderr)
            return text, segments, duration, provider

        print(f"[STT] {provider} returned empty/hallucination, trying next...", file=sys.stderr)

    return "", [], 0.0, "none"


# ---------------------------------------------------------------------------
# Test endpoint
# ---------------------------------------------------------------------------

@router.get("/test")
async def test_audio_providers():
    """Test speech-to-text API connectivity and keys using a dynamically synthesized audio file."""
    import math
    import struct
    
    results = {}
    temp_path = None
    try:
        # Generate 1 second of mono 16-bit silent/tone audio at 16000Hz (A4 = 440Hz)
        sample_rate = 16000
        duration = 1.0
        frequency = 440.0
        amplitude = 32767 * 0.5
        num_samples = int(sample_rate * duration)
        
        suffix = ".wav"
        fd, temp_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        
        # Write to a valid WAV file structure
        with wave.open(temp_path, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for i in range(num_samples):
                val = int(amplitude * math.sin(2.0 * math.pi * frequency * i / sample_rate))
                data = struct.pack("<h", val)
                wav_file.writeframesraw(data)
                
        with open(temp_path, "rb") as f:
            audio_bytes = f.read()

        available = _get_available_providers()
        weights = _parse_stt_weights()

        # Test each configured provider
        for provider in _ALL_STT_PROVIDERS:
            p_text = ""
            p_err = None
            configured = provider in available
            weight = weights.get(provider, 0)

            if configured:
                try:
                    if provider == "groq":
                        p_text, _, _ = await _transcribe_with_groq(temp_path, "en", "")
                    elif provider == "nvidia":
                        p_text, _, _ = await _transcribe_with_nvidia(temp_path, "en", "")
                    elif provider == "deepgram":
                        p_text, _, _ = await _transcribe_with_deepgram(temp_path, "en")
                    elif provider == "openai":
                        p_text, _, _ = await _transcribe_with_openai(temp_path, "en", "")
                    elif provider == "cloudflare":
                        p_text = await _transcribe_with_cloudflare(audio_bytes)
                except Exception as e:
                    p_err = str(e)

            results[provider] = {
                "configured": configured,
                "weight": weight,
                "result": p_text,
                "error": p_err,
            }

        return {
            "status": "success",
            "routing": "weighted_round_robin",
            "stt_weights_env": os.getenv("STT_WEIGHTS", "(default)"),
            "results": results,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# ---------------------------------------------------------------------------
# Main transcription endpoint
# ---------------------------------------------------------------------------

@router.post("/transcriptions")
async def create_transcription(
    file: UploadFile = File(...),
    language: str = Form("vi"),
    client_duration: float = Form(0.0),
):
    temp_path = None
    wav_path = None
    try:
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        fd, temp_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)

        file_size = 0
        with open(temp_path, "wb") as temp_file:
            while chunk := await file.read(8192):
                file_size += len(chunk)
                temp_file.write(chunk)

        print(f"[STT] Received audio: {file.filename}, size={file_size}, suffix={suffix}", file=sys.stderr)

        # Reject extremely small files (likely empty/silence)
        if file_size < 1000:
            print(f"[STT] File too small ({file_size} bytes), likely empty recording", file=sys.stderr)
            return {"text": "", "error": "Audio quá ngắn hoặc trống"}

        normalized_language = "en" if language.lower().startswith("en") else "vi"
        transcription_prompt = (
            "This is an English learner speaking. Preserve filler words and possible recognition mistakes."
            if normalized_language == "en"
            else "Đây là câu nói tiếng Việt."
        )

        # Try converting to WAV for better compatibility (especially Safari mp4)
        wav_path = _convert_to_wav(temp_path)
        primary_path = wav_path if wav_path else temp_path

        duration_from_wave = 0.0
        if wav_path and os.path.exists(wav_path):
            try:
                with wave.open(wav_path, "rb") as wf:
                    duration_from_wave = wf.getnframes() / float(wf.getframerate())
            except Exception as e:
                print(f"[STT] Error getting duration: {e}", file=sys.stderr)

        # ── Weighted round-robin across all configured providers ──
        text, segments, stt_duration, provider_used = await _transcribe_roundrobin(
            primary_path, normalized_language, transcription_prompt
        )

        print(f"[STT] Result: provider={provider_used}, text_len={len(text)}, text={text[:80]}...", file=sys.stderr)

        if not text:
            return {"text": "", "error": "Không nhận diện được giọng nói. Hãy nói gần micro hơn."}
            
        final_duration = stt_duration or client_duration or duration_from_wave

        metrics = analyze_speech_metrics(text, segments, final_duration)
        return {"text": text, "metrics": metrics, "provider": provider_used}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[STT] Unexpected error: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


# ---------------------------------------------------------------------------
# WebSocket streaming endpoint (also round-robin)
# ---------------------------------------------------------------------------

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    available = _get_available_providers()
    if not available:
        await websocket.close(code=1011)
        return

    try:
        while True:
            data = await websocket.receive_bytes()
            temp_path = None
            try:
                suffix = ".webm"
                if data[:4] == b'\x1aE\xdf\xa3':
                    suffix = ".webm"
                elif b'ftyp' in data[:32]:
                    suffix = ".mp4"

                fd, temp_path = tempfile.mkstemp(suffix=suffix)
                os.close(fd)

                with open(temp_path, "wb") as temp_file:
                    temp_file.write(data)

                prompt = "Đây là câu nói tiếng Việt."

                # Use the same weighted round-robin for WebSocket streaming
                text, segments, stt_duration, provider = await _transcribe_roundrobin(
                    temp_path, "vi", prompt
                )

                if text and not _is_hallucination(text, prompt):
                    await websocket.send_json({"text": text, "provider": provider})
            except Exception as e:
                print(f"[WS-STT] Error: {e}", file=sys.stderr)
                await websocket.send_json({"error": str(e)})
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
    except WebSocketDisconnect:
        print("Client disconnected from audio stream", file=sys.stderr)
