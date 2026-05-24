from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class Message(BaseModel):
    role: str
    content: str


class UnifiedAIChatRequest(BaseModel):
    """Request model for voice coaching scoring via /v1/chat/unified."""
    query: str
    task: Optional[str] = "general"  # "feedback", "interview", "presentation", "english", "social"
    model_override: Optional[str] = None
    system_prompt: Optional[str] = None
    user_id: Optional[str] = None
    history: Optional[List[Message]] = []
