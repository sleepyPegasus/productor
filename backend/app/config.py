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

    # Available models for selection
    CHAT_MODELS: list = [
        {"id": "deepseek/deepseek-chat", "name": "DeepSeek Chat"},
        {"id": "openai/gpt-4o", "name": "GPT-4o"},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4"},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash"},
        {"id": "meta-llama/llama-3.1-70b-instruct", "name": "Llama 3.1 70B"},
    ]
    IMAGE_MODELS: list = [
        {"id": "openai/dall-e-3", "name": "DALL-E 3"},
        {"id": "google/gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image"},
        {"id": "stabilityai/stable-diffusion-xl", "name": "Stable Diffusion XL"},
    ]


settings = Settings()
