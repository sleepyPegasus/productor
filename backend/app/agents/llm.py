"""LLM client factory using LangChain."""

from langchain_openai import ChatOpenAI

from app.config import settings


def get_chat_llm(temperature: float = 0.7, max_tokens: int = 4096) -> ChatOpenAI:
    """Create a ChatOpenAI instance pointing to DeepSeek."""
    return ChatOpenAI(
        model=settings.DEEPSEEK_MODEL,
        openai_api_key=settings.DEEPSEEK_API_KEY,
        openai_api_base=settings.DEEPSEEK_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def get_streaming_llm(temperature: float = 0.7, max_tokens: int = 4096) -> ChatOpenAI:
    """Create a streaming ChatOpenAI instance pointing to DeepSeek."""
    return ChatOpenAI(
        model=settings.DEEPSEEK_MODEL,
        openai_api_key=settings.DEEPSEEK_API_KEY,
        openai_api_base=settings.DEEPSEEK_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
    )
