"""LLM client factory using LangChain via OpenRouter."""

from langchain_openai import ChatOpenAI

from app.config import settings


def _check_api_key():
    """Raise a clear error if the OpenRouter API key is not configured."""
    if not settings.OPENROUTER_API_KEY:
        raise ValueError(
            "未配置 OpenRouter API Key。请在 .env 文件中设置 OPENROUTER_API_KEY。"
        )


def get_chat_llm(model: str = None, temperature: float = 0.7, max_tokens: int = 4096) -> ChatOpenAI:
    """Create a ChatOpenAI instance pointing to OpenRouter."""
    _check_api_key()
    return ChatOpenAI(
        model=model or settings.DEFAULT_CHAT_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def get_streaming_llm(model: str = None, temperature: float = 0.7, max_tokens: int = 4096) -> ChatOpenAI:
    """Create a streaming ChatOpenAI instance pointing to OpenRouter."""
    _check_api_key()
    return ChatOpenAI(
        model=model or settings.DEFAULT_CHAT_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
        max_retries=3,
    )
