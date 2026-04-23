"""
SQLAlchemy models for WaterTruth AI.
Single table: water_analyses.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, JSON, Index

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class WaterAnalysis(Base):
    __tablename__ = "water_analyses"

    id              = Column(String(36),  primary_key=True, default=_uuid)
    image_data      = Column(Text,        nullable=False)   # base64 JPEG (small preview)
    classification  = Column(String(32),  nullable=False, index=True)
    drinkability    = Column(String(64),  nullable=False)
    confidence      = Column(String(16),  nullable=False)   # HIGH / MEDIUM / LOW
    recommendation  = Column(Text,        nullable=False)
    warning         = Column(Text,        nullable=False)
    visual_analysis = Column(JSON,        nullable=False)   # {color, clarity, particles, surface, source_context}
    created_at      = Column(DateTime(timezone=True), default=_now, nullable=False, index=True)


Index("ix_water_analyses_created_at_desc", WaterAnalysis.created_at.desc())
