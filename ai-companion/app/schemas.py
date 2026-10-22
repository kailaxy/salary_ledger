from enum import Enum
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class Personality(str, Enum):
    financial_gremlin = 'financial_gremlin'
    supportive_bestie = 'supportive_bestie'
    sarcastic_accountant = 'sarcastic_accountant'


class Tone(str, Enum):
    playful = 'playful'
    celebratory = 'celebratory'
    supportive = 'supportive'
    informational = 'informational'


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message: str = Field(strict=True, min_length=1, max_length=500)
    personality: Personality
    chaosLevel: StrictInt = Field(ge=0, le=100)
    tone: Tone

    @field_validator('message')
    @classmethod
    def clean_message(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 and c not in '\n\t' for c in value):
            raise ValueError('Use nonempty conversational text without control characters')
        return value


class ChatResponse(BaseModel):
    reply: str
    personality: Personality
    chaosLevel: int
    requestedTone: Tone
    tone: Tone  # effective, after server policy
    source: Literal['gemma', 'fallback']
    model: str | None
    durationMs: int
    reason: str
    validationPassed: bool | None
    modelTimings: dict[str, int] | None = None  # Ollama durations are nanoseconds


class HealthResponse(BaseModel):
    status: Literal['ok', 'degraded']
    ollamaReachable: bool
    model: str
    modelAvailable: bool
    cleanupRequired: bool
