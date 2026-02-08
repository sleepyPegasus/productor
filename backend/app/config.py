import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # OpenRouter unified API
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    DEFAULT_CHAT_MODEL: str = os.getenv("DEFAULT_CHAT_MODEL", "deepseek/deepseek-chat")
    DEFAULT_IMAGE_MODEL: str = os.getenv("DEFAULT_IMAGE_MODEL", "openai/dall-e-3")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./productor.db")
    OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")

    # JWT / Auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "productor-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "72"))

    # SMTP (for email verification - leave empty to use console output for dev)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@productor.local")

    # Available models for selection
    CHAT_MODELS: list = [
        {"id": "deepseek/deepseek-chat", "name": "DeepSeek Chat"},
        {"id": "openai/gpt-4o", "name": "GPT-4o"},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4"},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash"},
        {"id": "google/gemini-3-pro-preview", "name": "Gemini 3.0 Pro"},
        {"id": "meta-llama/llama-3.1-70b-instruct", "name": "Llama 3.1 70B"},
    ]
    IMAGE_MODELS: list = [
        {"id": "openai/dall-e-3", "name": "DALL-E 3"},
        {"id": "google/gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image"},
        {"id": "stabilityai/stable-diffusion-xl", "name": "Stable Diffusion XL"},
    ]
    MULTIMODAL_MODELS: list = [
        {"id": "openai/gpt-4o", "name": "GPT-4o"},
        {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4"},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash"},
        {"id": "google/gemini-3-pro-preview", "name": "Gemini 3.0 Pro"},
        {"id": "moonshotai/kimi-vl-a3b-thinking", "name": "Kimi VL A3B"},
    ]


settings = Settings()
