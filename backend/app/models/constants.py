"""Shared constants used across the application."""

# Known multimodal model patterns (models that support image input for text output).
# Used by both the models API and the orchestrator.
MULTIMODAL_PATTERNS = [
    "gpt-4o", "gpt-4-turbo", "gpt-4-vision",
    "claude-sonnet", "claude-opus", "claude-haiku",
    "gemini-2", "gemini-3", "gemini-pro",
    "qwen-vl", "qwen2-vl",
    "llava", "internvl",
    "kimi",
]
