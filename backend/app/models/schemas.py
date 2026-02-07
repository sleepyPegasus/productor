from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ProjectStatus(str, Enum):
    CREATED = "created"
    ANALYZING = "analyzing"
    PROTOTYPING = "prototyping"
    GENERATING = "generating"
    REVIEWING = "reviewing"
    REVISING = "revising"
    APPROVED = "approved"
    ERROR = "error"


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    chat_model: str = Field(default="", max_length=100)
    image_model: str = Field(default="", max_length=100)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    chat_model: Optional[str] = Field(None, max_length=100)
    image_model: Optional[str] = Field(None, max_length=100)


class PrdContentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: ProjectStatus
    version: int
    chat_model: Optional[str] = None
    image_model: Optional[str] = None
    prd_content: Optional[str] = None
    structured_requirement: Optional[str] = None
    pages_plan: Optional[str] = None
    design_images: Optional[str] = None
    comprehensive_content: Optional[str] = None
    history: Optional[str] = None
    created_at: str
    updated_at: str


class ProjectListItem(BaseModel):
    id: str
    name: str
    description: str
    status: ProjectStatus
    version: int
    chat_model: Optional[str] = None
    image_model: Optional[str] = None
    prd_content: Optional[str] = None
    design_images: Optional[str] = None
    created_at: str
    updated_at: str


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class ReviseWithVersionRequest(BaseModel):
    message: str = Field(..., min_length=1)
    version: Optional[int] = Field(None, description="Target PRD version to revise against")


class VersionHistory(BaseModel):
    version: int
    action: str
    feedback: Optional[str] = None
    timestamp: str


class StreamEvent(BaseModel):
    type: str  # "token", "status", "prd_update", "done", "error"
    data: str


class ModelInfo(BaseModel):
    id: str
    name: str


class ModelsResponse(BaseModel):
    chat_models: list[ModelInfo]
    image_models: list[ModelInfo]
