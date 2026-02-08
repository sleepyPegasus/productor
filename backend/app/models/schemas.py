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
    comprehensive_model: str = Field(default="", max_length=100)
    default_image_resolution: str = Field(default="", max_length=50)
    default_image_ratio: str = Field(default="", max_length=20)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    chat_model: Optional[str] = Field(None, max_length=100)
    image_model: Optional[str] = Field(None, max_length=100)
    comprehensive_model: Optional[str] = Field(None, max_length=100)
    default_image_resolution: Optional[str] = Field(None, max_length=50)
    default_image_ratio: Optional[str] = Field(None, max_length=20)


class PrdContentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: ProjectStatus
    version: int
    category: Optional[str] = "active"
    chat_model: Optional[str] = None
    image_model: Optional[str] = None
    comprehensive_model: Optional[str] = None
    default_image_resolution: Optional[str] = None
    default_image_ratio: Optional[str] = None
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
    category: Optional[str] = "active"
    chat_model: Optional[str] = None
    image_model: Optional[str] = None
    comprehensive_model: Optional[str] = None
    default_image_resolution: Optional[str] = None
    default_image_ratio: Optional[str] = None
    prd_content: Optional[str] = None
    design_images: Optional[str] = None
    created_at: str
    updated_at: str


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class ChatHistoryUpdate(BaseModel):
    messages: list[ChatMessage] = Field(..., description="Updated chat messages list")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class ReviseWithVersionRequest(BaseModel):
    message: str = Field(..., min_length=1)
    version: Optional[int] = Field(None, description="Target PRD version to revise against")
    section: Optional[str] = Field(None, description="Selected PRD section title for targeted revision")


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
    multimodal_models: list[ModelInfo]


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z][a-z0-9_]*$')
    display_name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="general", max_length=50)
    system_prompt: str = Field(default="")
    user_prompt_template: str = Field(default="")
    output_format: str = Field(default="text", max_length=20)
    model_type: str = Field(default="chat", max_length=20)
    parameters: Optional[dict] = Field(default=None)
    input_variables: Optional[list] = Field(default=None)
    extra_data: Optional[dict] = Field(default=None)


class SkillUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=50)
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    output_format: Optional[str] = Field(None, max_length=20)
    model_type: Optional[str] = Field(None, max_length=20)
    parameters: Optional[dict] = None
    input_variables: Optional[list] = None
    extra_data: Optional[dict] = None
    is_enabled: Optional[bool] = None


class SkillResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: str
    category: str
    system_prompt: str
    user_prompt_template: str
    output_format: str
    model_type: str
    parameters: Optional[str] = None
    input_variables: Optional[str] = None
    extra_data: Optional[str] = None
    is_builtin: bool
    is_enabled: bool
    version: int
    created_at: str
    updated_at: str
