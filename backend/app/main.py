"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.export import router as export_router
from app.api.generation import router as generation_router
from app.api.projects import router as projects_router
from app.api.skills import router as skills_router
from app.config import settings
from app.db.database import init_db
from app.models.schemas import ModelsResponse
from app.services.skill_service import init_default_skills

logger = logging.getLogger(__name__)

# Cache for OpenRouter models
_models_cache: dict = {"chat_models": [], "image_models": [], "multimodal_models": [], "timestamp": 0}
_CACHE_TTL = 300  # 5 minutes

# Known multimodal model patterns (support image input for text output)
_MULTIMODAL_PATTERNS = [
    "gpt-4o", "gpt-4-turbo", "gpt-4-vision",
    "claude-sonnet", "claude-opus", "claude-haiku",
    "gemini-2", "gemini-3", "gemini-pro",
    "qwen-vl", "qwen2-vl",
    "llava", "internvl",
    "kimi",
]


def _is_multimodal(model_id: str, model_info: dict) -> bool:
    """Check if a model supports multimodal input (image+text -> text)."""
    modality = model_info.get("architecture", {}).get("modality", "")
    # Models that accept image input but produce text output
    if "image" in modality.split("->")[0] and "image" not in modality.split("->")[-1]:
        return True
    # Fallback: check known patterns
    model_lower = model_id.lower()
    return any(pattern in model_lower for pattern in _MULTIMODAL_PATTERNS)


async def _fetch_openrouter_models() -> dict:
    """Fetch models from OpenRouter API and categorize them."""
    now = time.time()
    if _models_cache["timestamp"] and now - _models_cache["timestamp"] < _CACHE_TTL:
        return _models_cache

    try:
        headers = {}
        if settings.OPENROUTER_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OPENROUTER_API_KEY}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.OPENROUTER_BASE_URL}/models",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        chat_models = []
        image_models = []
        multimodal_models = []

        for model in data.get("data", []):
            model_id = model.get("id", "")
            model_name = model.get("name", model_id)
            modality = model.get("architecture", {}).get("modality", "")

            entry = {"id": model_id, "name": model_name}

            if "image" in modality.split("->")[-1]:
                image_models.append(entry)
            else:
                chat_models.append(entry)

            if _is_multimodal(model_id, model):
                multimodal_models.append(entry)

        if chat_models or image_models:
            _models_cache["chat_models"] = chat_models
            _models_cache["image_models"] = image_models
            _models_cache["multimodal_models"] = multimodal_models
            _models_cache["timestamp"] = now
            return _models_cache

    except Exception as e:
        logger.warning("Failed to fetch models from OpenRouter: %s", e)

    # Fallback to hardcoded models if cache is empty
    if not _models_cache["chat_models"] and not _models_cache["image_models"]:
        return {
            "chat_models": settings.CHAT_MODELS,
            "image_models": settings.IMAGE_MODELS,
            "multimodal_models": settings.MULTIMODAL_MODELS,
        }
    return _models_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_default_skills()
    yield


app = FastAPI(
    title="Productor API",
    description="AI-powered PRD generation backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(generation_router)
app.include_router(export_router)
app.include_router(skills_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models", response_model=ModelsResponse)
async def get_available_models():
    """Return available chat, image, and multimodal models fetched from OpenRouter."""
    models = await _fetch_openrouter_models()
    return {
        "chat_models": models["chat_models"],
        "image_models": models["image_models"],
        "multimodal_models": models.get("multimodal_models", []),
    }
