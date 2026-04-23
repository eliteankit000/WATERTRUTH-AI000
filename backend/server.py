"""
WaterTruth AI — visual water-quality analyst.

Core contract (per system spec):
  - Accepts an image (from live camera capture).
  - Sends it to GPT-5.2 vision with a strict system prompt.
  - Returns ONLY the structured JSON response defined in the spec.
  - Persists results to Supabase (Postgres) if DATABASE_URL is configured,
    otherwise falls back to an in-memory store so the service never dies.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select, desc
from starlette.middleware.cors import CORSMiddleware

from database import AsyncSessionLocal, Base, engine, is_configured
from models import WaterAnalysis

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # type: ignore

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("watertruth")

# ─── Config ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL   = os.environ.get("OPENAI_MODEL", "gpt-5.2").strip() or "gpt-5.2"

openai_client: Optional["AsyncOpenAI"] = None
if OPENAI_API_KEY and AsyncOpenAI is not None:
    openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    logger.info("OpenAI client ready — model=%s", OPENAI_MODEL)
else:
    logger.warning("OPENAI_API_KEY not set — vision analysis will use deterministic fallback")

# ─── In-memory fallback store (if Supabase not configured / unavailable) ─────
_memory_store: dict[str, dict] = {}

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="WaterTruth AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api")

# ─── Startup / Shutdown ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    if is_configured():
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Supabase connected — tables ensured")
        except Exception as e:  # pragma: no cover
            logger.error("Supabase connection failed: %s", e)
            logger.warning("Running with IN-MEMORY fallback store")
    else:
        logger.warning("DATABASE_URL not set — using IN-MEMORY store (non-persistent)")


@app.on_event("shutdown")
async def shutdown() -> None:
    if engine is not None:
        await engine.dispose()


# ─── Persistence helpers ──────────────────────────────────────────────────────

async def _save_analysis(doc: dict) -> None:
    if is_configured() and AsyncSessionLocal is not None:
        try:
            async with AsyncSessionLocal() as session:
                row = WaterAnalysis(
                    id=doc["id"],
                    image_data=doc["image_data"],
                    classification=doc["classification"],
                    drinkability=doc["drinkability"],
                    confidence=doc["confidence"],
                    recommendation=doc["recommendation"],
                    warning=doc["warning"],
                    visual_analysis=doc["visual_analysis"],
                    created_at=doc["created_at"],
                )
                session.add(row)
                await session.commit()
                return
        except Exception as e:
            logger.error("Supabase write failed, falling back to memory: %s", e)
    _memory_store[doc["id"]] = doc


async def _get_analysis_by_id(analysis_id: str) -> Optional[dict]:
    if is_configured() and AsyncSessionLocal is not None:
        try:
            async with AsyncSessionLocal() as session:
                r = await session.execute(
                    select(WaterAnalysis).where(WaterAnalysis.id == analysis_id)
                )
                row = r.scalar_one_or_none()
                if row:
                    return _row_to_dict(row)
        except Exception as e:
            logger.error("Supabase read failed, trying memory: %s", e)
    return _memory_store.get(analysis_id)


async def _get_recent_analyses(limit: int) -> List[dict]:
    limit = max(1, min(limit, 100))
    if is_configured() and AsyncSessionLocal is not None:
        try:
            async with AsyncSessionLocal() as session:
                r = await session.execute(
                    select(WaterAnalysis)
                    .order_by(desc(WaterAnalysis.created_at))
                    .limit(limit)
                )
                rows = r.scalars().all()
                return [_row_to_dict(row, include_image=False) for row in rows]
        except Exception as e:
            logger.error("Supabase list failed, using memory: %s", e)
    items = sorted(
        _memory_store.values(),
        key=lambda x: x.get("created_at") or datetime.now(timezone.utc),
        reverse=True,
    )[:limit]
    return [{k: v for k, v in it.items() if k != "image_data"} for it in items]


def _row_to_dict(row: WaterAnalysis, include_image: bool = True) -> dict:
    d = {
        "id":              row.id,
        "classification":  row.classification,
        "drinkability":    row.drinkability,
        "confidence":      row.confidence,
        "recommendation":  row.recommendation,
        "warning":         row.warning,
        "visual_analysis": row.visual_analysis,
        "created_at":      row.created_at,
    }
    if include_image:
        d["image_data"] = row.image_data
    return d


# ─── Response schema ──────────────────────────────────────────────────────────

class VisualAnalysis(BaseModel):
    color: str          = "indeterminate"
    clarity: str        = "indeterminate"
    particles: str      = "indeterminate"
    surface: str        = "indeterminate"
    source_context: str = "indeterminate"


class AnalysisResponse(BaseModel):
    system_check: str = "WATERTRUTH AI — SYSTEM ACTIVE"
    id: str
    visual_analysis: VisualAnalysis
    classification: str
    drinkability: str
    confidence: str
    recommendation: str
    warning: str
    created_at: str
    image_data: Optional[str] = None


# ─── Constants from spec ──────────────────────────────────────────────────────

MANDATORY_WARNING = (
    "Visual inspection cannot detect dissolved chemicals, heavy metals, pathogens, "
    "or biological contaminants. This result is NOT a substitute for laboratory "
    "testing (TDS, pH, bacteria, chemical screening)."
)

VALID_CLASSIFICATIONS = {
    "CLEAN",
    "SLIGHTLY_CONTAMINATED",
    "DIRTY",
    "HIGHLY_POLLUTED",
    "NO_WATER_DETECTED",
}

DRINKABILITY_MAP = {
    "CLEAN":                 "UNCERTAIN — VISUAL ONLY",
    "SLIGHTLY_CONTAMINATED": "UNCERTAIN — TESTING REQUIRED",
    "DIRTY":                 "NOT SAFE TO DRINK",
    "HIGHLY_POLLUTED":       "NOT SAFE TO DRINK",
    "NO_WATER_DETECTED":     "N/A",
}

RECOMMENDATION_MAP = {
    "CLEAN": (
        "Water appears visually clean. Boil or filter before any consumption. "
        "Test with a certified kit (TDS, pH, bacteria) before drinking."
    ),
    "SLIGHTLY_CONTAMINATED": (
        "Visible irregularities detected. Do not drink without filtration and "
        "certified laboratory testing."
    ),
    "DIRTY": (
        "Do not drink. Treat with multi-stage filtration and test before any use."
    ),
    "HIGHLY_POLLUTED": (
        "Serious contamination indicators present. Do not use for drinking, cooking, "
        "or bathing. Seek an alternative source immediately."
    ),
    "NO_WATER_DETECTED": "No water detected in the image. Please re-capture.",
}


SYSTEM_PROMPT = """You are WaterTruth AI — a specialized visual water-quality analyst embedded in an environmental safety application. Your only inputs are images or camera frames. Your only job is to assess visible water quality indicators and return a structured JSON response. You do not perform chemistry, microbiology, or laboratory analysis of any kind.

ABSOLUTE RULES — never violate
1. NEVER declare water safe to drink based on appearance alone.
2. NEVER fabricate data, infer invisible contaminants, or make claims beyond what is directly visible.
3. ALWAYS flag uncertainty when the image is blurry, low-light, or inconclusive.
4. ALWAYS append the mandatory safety disclaimer to every response.
5. If no water is visible in the image, return classification: "NO_WATER_DETECTED" and stop.

STEP 1 — Visual observation
Carefully examine the image. Note each of the following:
- COLOR: clear / brown / grey / green / yellow / orange / black / mixed
- CLARITY (turbidity): transparent / slightly hazy / moderately cloudy / opaque
- PARTICLES: none / trace / moderate / heavy
- SURFACE: normal water / foamy / oily (iridescent sheen) / algae-or-biofilm-covered
- CONTEXT (if visible): tap / river / lake / standing puddle / container / unknown
Only describe what is objectively visible. Do not infer chemical composition.

STEP 2 — Classification (choose exactly one)
CLEAN                 → Visually clear, no discoloration, no particles, normal surface.
SLIGHTLY_CONTAMINATED → Minor cloudiness, trace particles, or faint discoloration.
DIRTY                 → Visible turbidity, notable discoloration, or moderate particles.
HIGHLY_POLLUTED       → Heavy contamination, foam, oil sheen, algae bloom, or visibly hazardous.
NO_WATER_DETECTED     → No water is visible in the image.

STEP 3 — Drinkability
CLEAN                 → "UNCERTAIN — VISUAL ONLY"
SLIGHTLY_CONTAMINATED → "UNCERTAIN — TESTING REQUIRED"
DIRTY                 → "NOT SAFE TO DRINK"
HIGHLY_POLLUTED       → "NOT SAFE TO DRINK"
NO_WATER_DETECTED     → "N/A"
"CLEAN" does NOT map to "LIKELY SAFE." Visually clear water can still contain invisible toxins.

STEP 4 — Confidence scoring
HIGH   → Sharp, well-lit, water fills most of the frame, indicators unambiguous.
MEDIUM → Some blur, partial framing, mixed signals, or moderate lighting.
LOW    → Dark, blurry, water is a small portion of the frame, or indicators conflict.
If confidence is LOW, include "re-capture in better lighting" in the recommendation.

STEP 5 — Recommendation
Use the canonical recommendation text for each classification.

OUTPUT — return ONLY this JSON, no prose, no markdown fences
{
  "visual_analysis": {
    "color": "",
    "clarity": "",
    "particles": "",
    "surface": "",
    "source_context": ""
  },
  "classification": "",
  "drinkability": "",
  "confidence": "",
  "recommendation": "",
  "warning": "Visual inspection cannot detect dissolved chemicals, heavy metals, pathogens, or biological contaminants. This result is NOT a substitute for laboratory testing (TDS, pH, bacteria, chemical screening)."
}

TONE & OUTPUT CONTRACT
- Respond in valid, parseable JSON only.
- Use precise, clinical language. No reassurance that exceeds visual evidence.
- If a field cannot be determined from the image, use the string "indeterminate".
- The "warning" field is static and must appear verbatim in every response."""


# ─── Image helpers ────────────────────────────────────────────────────────────

def _load_and_normalize(contents: bytes) -> tuple[Image.Image, str]:
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        img = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize if very large (keeps upload to GPT small, faster, cheaper)
    max_dim = 1280
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return img, b64


# ─── GPT-5.2 vision call ──────────────────────────────────────────────────────

def _sanitise(payload: dict) -> dict:
    """Enforce the strict output contract: valid classification, correct drinkability,
    canonical recommendation, and the verbatim mandatory warning."""

    va = payload.get("visual_analysis") or {}
    visual = {
        "color":          str(va.get("color")          or "indeterminate"),
        "clarity":        str(va.get("clarity")        or "indeterminate"),
        "particles":      str(va.get("particles")      or "indeterminate"),
        "surface":        str(va.get("surface")        or "indeterminate"),
        "source_context": str(va.get("source_context") or "indeterminate"),
    }

    classification = str(payload.get("classification") or "").upper().strip()
    if classification not in VALID_CLASSIFICATIONS:
        classification = "NO_WATER_DETECTED"

    drinkability = DRINKABILITY_MAP[classification]

    confidence = str(payload.get("confidence") or "").upper().strip()
    if confidence not in {"HIGH", "MEDIUM", "LOW"}:
        confidence = "LOW"

    recommendation = str(
        payload.get("recommendation") or RECOMMENDATION_MAP[classification]
    ).strip()
    # Guarantee low-confidence hint
    if confidence == "LOW" and "re-capture" not in recommendation.lower():
        recommendation = recommendation.rstrip(". ") + ". Re-capture in better lighting."

    return {
        "visual_analysis": visual,
        "classification":  classification,
        "drinkability":    drinkability,
        "confidence":      confidence,
        "recommendation":  recommendation,
        "warning":         MANDATORY_WARNING,
    }


async def _analyse_with_gpt(image_b64: str) -> dict:
    if openai_client is None:
        # Deterministic fallback so the service stays usable without a key
        return _sanitise({
            "visual_analysis": {
                "color": "indeterminate",
                "clarity": "indeterminate",
                "particles": "indeterminate",
                "surface": "indeterminate",
                "source_context": "indeterminate",
            },
            "classification": "NO_WATER_DETECTED",
            "confidence":     "LOW",
            "recommendation": "OpenAI API key is not configured on this server. "
                              "Add OPENAI_API_KEY to backend/.env to enable visual analysis.",
        })

    try:
        resp = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Analyse this image per the WaterTruth AI contract. Return only the JSON.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                        },
                    ],
                },
            ],
            max_completion_tokens=700,
            timeout=45,
        )
        raw = resp.choices[0].message.content or "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("GPT returned non-JSON, falling back. Raw=%s", raw[:200])
            payload = {}
        return _sanitise(payload)

    except Exception as e:  # pragma: no cover
        logger.error("GPT call failed: %s", e, exc_info=True)
        return _sanitise({
            "visual_analysis": {
                "color": "indeterminate", "clarity": "indeterminate",
                "particles": "indeterminate", "surface": "indeterminate",
                "source_context": "indeterminate",
            },
            "classification": "NO_WATER_DETECTED",
            "confidence":     "LOW",
            "recommendation": f"Vision service error: {str(e)[:120]}. Please retry.",
        })


# ─── Routes ───────────────────────────────────────────────────────────────────

@api_router.get("/health")
async def health_check() -> dict:
    return {
        "status":   "healthy",
        "service":  "WaterTruth AI",
        "database": "supabase" if is_configured() else "in-memory (fallback)",
        "ai":       "configured" if openai_client else "not configured (fallback)",
        "model":    OPENAI_MODEL if openai_client else "n/a",
        "memory_store_count": len(_memory_store),
    }


def _payload_to_response(doc: dict) -> AnalysisResponse:
    created = doc.get("created_at")
    if isinstance(created, datetime):
        created_iso = created.isoformat()
    else:
        created_iso = str(created)
    return AnalysisResponse(
        system_check="WATERTRUTH AI — SYSTEM ACTIVE",
        id=doc["id"],
        visual_analysis=VisualAnalysis(**doc["visual_analysis"]),
        classification=doc["classification"],
        drinkability=doc["drinkability"],
        confidence=str(doc["confidence"]).lower(),
        recommendation=doc["recommendation"],
        warning=doc["warning"],
        created_at=created_iso,
        image_data=doc.get("image_data"),
    )


@api_router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("20/minute")
async def analyze_water(request: Request, file: UploadFile = File(...)) -> AnalysisResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    _img, image_b64 = _load_and_normalize(contents)

    result = await _analyse_with_gpt(image_b64)

    doc = {
        "id":              str(uuid.uuid4()),
        "image_data":      image_b64,
        "classification":  result["classification"],
        "drinkability":    result["drinkability"],
        "confidence":      result["confidence"],
        "recommendation":  result["recommendation"],
        "warning":         result["warning"],
        "visual_analysis": result["visual_analysis"],
        "created_at":      datetime.now(timezone.utc),
    }

    await _save_analysis(doc)
    logger.info(
        "Analysis %s → %s / %s / %s",
        doc["id"], doc["classification"], doc["drinkability"], doc["confidence"],
    )
    return _payload_to_response(doc)


@api_router.get("/analyses", response_model=List[AnalysisResponse])
async def list_analyses(limit: int = 20) -> List[AnalysisResponse]:
    docs = await _get_recent_analyses(limit)
    return [_payload_to_response(d) for d in docs]


@api_router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(analysis_id: str) -> AnalysisResponse:
    doc = await _get_analysis_by_id(analysis_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _payload_to_response(doc)


# ─── Mount API router ─────────────────────────────────────────────────────────
app.include_router(api_router)


# ─── Serve React build in production ──────────────────────────────────────────
STATIC_DIR    = ROOT_DIR.parent / "frontend" / "build"
STATIC_ASSETS = STATIC_DIR / "static"

if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    logger.info("Serving React build from %s", STATIC_DIR)

    if STATIC_ASSETS.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_ASSETS)), name="react-static")

    @app.get("/manifest.json")
    async def manifest():
        return FileResponse(str(STATIC_DIR / "manifest.json"))

    @app.get("/favicon.ico")
    async def favicon():
        return FileResponse(str(STATIC_DIR / "favicon.ico"))

    @app.get("/service-worker.js")
    async def service_worker():
        return FileResponse(str(STATIC_DIR / "service-worker.js"))

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    logger.info("No React build found — running in API-only / dev mode")
