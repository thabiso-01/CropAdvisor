import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # "gemini" (hosted default), "anthropic", or "offline" (knowledge base only)
    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "gemini").lower())
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-flash-latest"))
    # Tried in order when the main model is overloaded (503/429), times out or is retired (404).
    gemini_fallback_models: list[str] = field(default_factory=lambda: [
        m.strip() for m in _env("GEMINI_FALLBACK_MODELS", "gemini-flash-lite-latest").split(",") if m.strip()
    ])
    gemini_timeout: float = field(default_factory=lambda: float(_env("GEMINI_TIMEOUT", "60")))
    # The main model gets a shorter wait so a busy model hands over to the fallback quickly.
    gemini_first_timeout: float = field(default_factory=lambda: float(_env("GEMINI_FIRST_TIMEOUT", "25")))
    # Fast model that checks "is this a plant?" before any analysis is done.
    gemini_check_model: str = field(default_factory=lambda: _env("GEMINI_CHECK_MODEL", "gemini-flash-lite-latest"))
    # Requests allowed per hour, per device and per IP address (protects the Gemini quota). 0 = no limit.
    analyze_per_hour: int = field(default_factory=lambda: int(_env("ANALYZE_PER_HOUR", "30")))
    chat_per_hour: int = field(default_factory=lambda: int(_env("CHAT_PER_HOUR", "120")))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    anthropic_model: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-sonnet-5-5"))
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./data/crop_advisor.db"))
    upload_dir: Path = field(default_factory=lambda: Path(_env("UPLOAD_DIR", "./data/uploads")))
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "12")))
    # Browser origins allowed to call the API from another site. The website itself is same-origin
    # (nginx / Vite proxy) and the phone app is native, so neither needs to be listed.
    cors_origins: list[str] = field(default_factory=lambda: [
        o.strip() for o in _env("CORS_ORIGINS", "http://localhost:5173,http://localhost:8081,http://localhost:19006").split(",") if o.strip()
    ])


settings = Settings()
