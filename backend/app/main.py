"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.export import router as export_router
from app.api.generation import router as generation_router
from app.api.projects import router as projects_router
from app.config import settings
from app.db.database import init_db
from app.models.schemas import ModelsResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models", response_model=ModelsResponse)
async def get_available_models():
    """Return available chat and image models for project creation."""
    return {
        "chat_models": settings.CHAT_MODELS,
        "image_models": settings.IMAGE_MODELS,
    }
