import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # "gemini" (hosted default), "ollama" (local), "anthropic", or "offline"
    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "gemini").lower())
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-flash-latest"))
    # Tried in order when the main model is overloaded (503/429), times out or is retired (404).
    gemini_fallback_models: list[str] = field(default_factory=lambda: [
        m.strip() for m in _env("GEMINI_FALLBACK_MODELS", "gemini-flash-lite-latest").split(",") if m.strip()
    ])
    gemini_timeout: float = field(default_factory=lambda: float(_env("GEMINI_TIMEOUT", "60")))
    # Same variable names as the Dietitian AI API, so both apps can share one Ollama server.
    ollama_url: str = field(default_factory=lambda: (_env("OLLAMA_BASE_URL") or _env("OLLAMA_URL", "http://localhost:11434")).rstrip("/"))
    # Chat / text model — Llama 3.2 (≈2 GB), the same model the Dietitian AI API uses.
    ollama_model: str = field(default_factory=lambda: _env("OLLAMA_MODEL", "llama3.2"))
    # Photo model — Llama 3.2 is text-only, so photos go to an open vision model.
    # qwen3-vl:2b is the lower-memory default. Use larger variants with more RAM/VRAM.
    # Set to "none" to skip it: Llama 3.2 then analyses from the farmer's notes + leaf-colour measurements.
    ollama_vision_model: str = field(default_factory=lambda: "" if _env("OLLAMA_VISION_MODEL", "qwen3-vl:2b").lower() in ("", "none", "off") else _env("OLLAMA_VISION_MODEL", "qwen3-vl:2b"))
    ollama_timeout: float = field(default_factory=lambda: float(_env("OLLAMA_TIMEOUT", "600")))
    ollama_auto_pull: bool = field(default_factory=lambda: _env("OLLAMA_AUTO_PULL", "true").lower() in ("1", "true", "yes"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    anthropic_model: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-sonnet-5-5"))
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./data/crop_advisor.db"))
    upload_dir: Path = field(default_factory=lambda: Path(_env("UPLOAD_DIR", "./data/uploads")))
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "12")))
    cors_origins: list[str] = field(default_factory=lambda: _env("CORS_ORIGINS", "*").split(","))


settings = Settings()
