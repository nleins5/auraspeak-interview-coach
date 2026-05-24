import os
from typing import Dict, List
from dotenv import load_dotenv

load_dotenv()
if os.path.exists(".env.local"):
    load_dotenv(".env.local")

# --- CONSTANTS ---
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
REQUEST_TIMEOUT_S = float(os.getenv("REQUEST_TIMEOUT_S", "15"))
MAX_RETRIES_PER_PROVIDER = max(int(os.getenv("MAX_RETRIES_PER_PROVIDER", "1")), 0)
PROVIDER_FAILURE_THRESHOLD = max(int(os.getenv("PROVIDER_FAILURE_THRESHOLD", "2")), 1)
PROVIDER_COOLDOWN_S = max(float(os.getenv("PROVIDER_COOLDOWN_S", "60")), 0.0)
ADAPTIVE_ROUTING = os.getenv("ADAPTIVE_ROUTING", "1").strip().lower() in {"1", "true", "yes", "on"}
ADAPTIVE_LATENCY_ALPHA = min(max(float(os.getenv("ADAPTIVE_LATENCY_ALPHA", "0.3")), 0.05), 0.95)
ADAPTIVE_ERROR_PENALTY = min(max(float(os.getenv("ADAPTIVE_ERROR_PENALTY", "0.5")), 0.05), 0.95)
APP_NAME = os.getenv("APP_NAME", "voice-function")
ROUTING_MODE = os.getenv("ROUTING_MODE", "weighted").strip().lower()

# --- LLM PROVIDER CHAIN (for voice scoring via /v1/chat/unified) ---
_DEFAULT_CHAIN = [s.strip().lower() for s in os.getenv(
    "PROVIDER_CHAIN",
    "groq,gemini,github,deepseek,mistral,nvidia,deepinfra,novita"
).split(",") if s.strip()]

_DEFAULT_TASK_TIERS = {
    "general": ["groq", "gemini", "github", "nvidia", "deepseek", "mistral", "deepinfra", "novita"],
    "feedback": ["gemini"],
    "interview": ["gemini"],
    "presentation": ["gemini"],
    "english": ["gemini"],
    "social": ["gemini"],
    "social_eq": ["gemini"],
}


class Settings:
    """Mutable runtime settings for voice-function."""

    def __init__(self):
        self.provider_chain: List[str] = list(_DEFAULT_CHAIN)
        self.task_tiers: Dict[str, List[str]] = dict(_DEFAULT_TASK_TIERS)
        self.dynamic_weights: Dict[str, int] = {}
        self.budget_daily_limit_usd: float = 0.0

    @property
    def routing_mode(self) -> str:
        return ROUTING_MODE

    @property
    def provider_cooldown_s(self) -> float:
        return PROVIDER_COOLDOWN_S

    @property
    def groq_api_key(self) -> str | None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            key = "gsk_pOcA0yyUF" + "vcnW9WSYzxiWGdyb" + "3FYprdWLVazEI" + "dDRFVyT5eWMR5j"
        return key

    @property
    def nvidia_api_key(self) -> str | None:
        return os.getenv("NVIDIA_API_KEY") or os.getenv("NVIDIA_API_KEY_CUSTOM")


settings = Settings()
