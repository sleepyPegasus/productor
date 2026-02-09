import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Environment
    ENV: str = os.getenv("ENV", "development")
    IS_PRODUCTION: bool = ENV.lower() == "production"

    # OpenRouter unified API
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    DEFAULT_CHAT_MODEL: str = os.getenv("DEFAULT_CHAT_MODEL", "deepseek/deepseek-chat")
    DEFAULT_IMAGE_MODEL: str = os.getenv("DEFAULT_IMAGE_MODEL", "openai/dall-e-3")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./productor.db")
    OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")

    # JWT / Auth - Production requires explicit secret
    _jwt_secret: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "72"))

    @property
    def JWT_SECRET(self) -> str:
        if self.IS_PRODUCTION and not self._jwt_secret:
            raise ValueError(
                "JWT_SECRET environment variable is required in production. "
                "Please set a secure secret key."
            )
        return self._jwt_secret or "dev-secret-key-not-for-production"

    # CORS - Restrict in production
    CORS_ALLOW_ORIGINS: str = os.getenv("CORS_ALLOW_ORIGINS", "")

    @property
    def ALLOWED_ORIGINS(self) -> list[str]:
        """Parse CORS_ALLOW_ORIGINS env var into list."""
        if self.IS_PRODUCTION:
            if not self.CORS_ALLOW_ORIGINS:
                raise ValueError(
                    "CORS_ALLOW_ORIGINS environment variable is required in production. "
                    "Example: https://app.example.com,https://admin.example.com"
                )
            return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]
        # Development: allow localhost origins
        origins = [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]
        if not origins:
            origins = ["http://localhost:5173", "http://localhost:3000"]
        return origins

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
