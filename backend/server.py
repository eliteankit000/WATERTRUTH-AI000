from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone
from PIL import Image, ImageEnhance, ImageFilter
import io
import base64
import numpy as np
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'watertruth_db')]

# OpenAI client
openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI(title="WaterTruth AI API", version="1.0.0")

# CORS — allow all origins (production handled by Render's proxy)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ─── Models ───────────────────────────────────────────────────────────────────

class VisualFeatures(BaseModel):
    optical_reflection: float
    refraction_distortion: float
    surface_texture: float
    turbidity: float
    color_deviation: float
    overall_quality: float

class WaterAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image_data: str
    risk_level: str
    confidence: float
    visual_features: VisualFeatures
    ai_explanation: str
    recommendation: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AnalysisResponse(BaseModel):
    id: str
    risk_level: str
    confidence: float
    visual_features: VisualFeatures
    ai_explanation: str
    recommendation: str
    timestamp: str


# ─── Image Processing ─────────────────────────────────────────────────────────

def preprocess_image(image: Image.Image) -> Image.Image:
    """Standardise image: white-balance, contrast, slight denoise."""
    logger.info("Starting image preprocessing")
    if image.mode != 'RGB':
        image = image.convert('RGB')

    # Auto white balance via per-channel histogram stretch
    img_array = np.array(image, dtype=float)
    for i in range(3):
        channel = img_array[:, :, i]
        lo = np.percentile(channel, 5)
        hi = np.percentile(channel, 95)
        if hi > lo:
            img_array[:, :, i] = np.clip(255 * (channel - lo) / (hi - lo), 0, 255)

    image = Image.fromarray(img_array.astype(np.uint8))
    image = ImageEnhance.Contrast(image).enhance(1.2)
    image = image.filter(ImageFilter.GaussianBlur(radius=0.5))
    logger.info("Image preprocessing completed")
    return image


def validate_image_quality(image: Image.Image) -> dict:
    """Fast quality check using numpy convolution (no Python loops)."""
    gray = np.array(image.convert('L'), dtype=float)

    # Laplacian via numpy — fast O(n) approach
    lap = (
        -gray[:-2, 1:-1]
        - gray[2:, 1:-1]
        - gray[1:-1, :-2]
        - gray[1:-1, 2:]
        + 4 * gray[1:-1, 1:-1]
    )
    blur_score = float(np.var(lap))
    brightness = float(np.mean(gray))

    # Lenient thresholds — real-world camera images vary a lot
    quality_ok = blur_score > 20 and 20 < brightness < 245

    return {
        'blur_score': blur_score,
        'brightness': brightness,
        'quality_ok': quality_ok,
    }


def analyze_image_features(image: Image.Image) -> VisualFeatures:
    """Extract visual features from pre-processed water image."""
    image = image.resize((224, 224))
    img = np.array(image, dtype=float)

    r_mean, g_mean, b_mean = img[:, :, 0].mean(), img[:, :, 1].mean(), img[:, :, 2].mean()
    r_var,  g_var,  b_var  = img[:, :, 0].var(),  img[:, :, 1].var(),  img[:, :, 2].var()
    total_var = (r_var + g_var + b_var) / 3

    color_balance = abs(r_mean - g_mean) + abs(g_mean - b_mean) + abs(b_mean - r_mean)
    brightness = (r_mean + g_mean + b_mean) / 3

    # Scores: 0-100, HIGHER = better (cleaner-looking water)
    optical_reflection  = float(np.clip((brightness / 255) * 100 - (total_var / 100), 0, 100))
    refraction_distortion = float(np.clip(100 - (color_balance / 2),               0, 100))
    surface_texture     = float(np.clip(100 - (total_var / 50),                     0, 100))
    # Turbidity score — high = clear (low cloudiness)
    turbidity           = float(np.clip((brightness / 255) * 100 - (total_var / 80), 0, 100))

    # Color deviation from ideal clear water (blue-ish ~[180,200,220])
    ideal = np.array([180.0, 200.0, 220.0])
    color_diff = float(np.sqrt(np.sum((np.array([r_mean, g_mean, b_mean]) - ideal) ** 2)))
    color_deviation = float(np.clip(100 - (color_diff / 3), 0, 100))

    overall_quality = (optical_reflection + refraction_distortion + surface_texture + turbidity + color_deviation) / 5

    return VisualFeatures(
        optical_reflection=round(optical_reflection, 1),
        refraction_distortion=round(refraction_distortion, 1),
        surface_texture=round(surface_texture, 1),
        turbidity=round(turbidity, 1),
        color_deviation=round(color_deviation, 1),
        overall_quality=round(overall_quality, 1),
    )


def calculate_risk_level(features: VisualFeatures) -> tuple[str, float]:
    score = features.overall_quality
    if score >= 70:
        risk_level = "LOW"
        confidence = min(93, 70 + (score - 70) / 30 * 23)
    elif score >= 40:
        risk_level = "MEDIUM"
        confidence = min(88, 65 + (score - 40) / 30 * 23)
    else:
        risk_level = "HIGH"
        confidence = min(93, 70 + (40 - score) / 40 * 23)
    return risk_level, round(confidence, 1)


async def generate_ai_explanation(features: VisualFeatures, risk_level: str) -> tuple[str, str]:
    """Generate explanation via OpenAI; falls back to rule-based text."""
    try:
        system_message = (
            "You are a water safety analyst explaining visual analysis results.\n\n"
            "STRICT RULES:\n"
            "- NEVER mention chemicals, bacteria, or diseases\n"
            "- NEVER claim medical or laboratory accuracy\n"
            "- NEVER say 'safe to drink' as a medical claim\n"
            "- Focus ONLY on visual patterns and observations\n"
            "- Use simple, calm, non-technical language\n"
            "- Communicate uncertainty clearly"
        )
        prompt = (
            f"Analyze this water sample based on VISUAL features only:\n\n"
            f"Visual Scores (0-100, higher = better appearance):\n"
            f"- Optical Reflection: {features.optical_reflection}\n"
            f"- Refraction Distortion: {features.refraction_distortion}\n"
            f"- Surface Texture: {features.surface_texture}\n"
            f"- Turbidity (clarity): {features.turbidity}\n"
            f"- Color Score: {features.color_deviation}\n"
            f"- Overall: {features.overall_quality}\n\n"
            f"Risk Level: {risk_level}\n\n"
            f"Provide:\n"
            f"1. A 2-3 sentence explanation based on VISUAL PATTERNS only\n"
            f"2. A clear action recommendation\n\n"
            f"Format:\n"
            f"EXPLANATION: [visual observation only]\n"
            f"RECOMMENDATION: [clear action]\n\n"
            f"Remember: Visual risk estimation only. No chemical testing. No medical claims."
        )
        response = await openai_client.chat.completions.create(
            model=os.environ.get('OPENAI_MODEL', 'gpt-4o-mini'),
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        text = response.choices[0].message.content.strip()
        if "EXPLANATION:" in text and "RECOMMENDATION:" in text:
            parts = text.split("RECOMMENDATION:")
            explanation = parts[0].replace("EXPLANATION:", "").strip()
            recommendation = parts[1].strip()
        else:
            explanation = text
            recommendation = "Please consult local water quality guidelines before consumption."
        return explanation, recommendation

    except Exception as e:
        logger.error(f"OpenAI error: {e}")
        # Rule-based fallback
        if risk_level == "LOW":
            return (
                "The water shows consistent visual patterns with stable surface reflection and uniform colour distribution. "
                "These visual characteristics align with typical clean water appearance.",
                "Based on visual patterns, this appears low-risk. However, visual checks cannot confirm safety. "
                "Follow local water guidelines before drinking.",
            )
        elif risk_level == "MEDIUM":
            return (
                "The water shows some visual irregularities in surface texture and light behaviour. "
                "These inconsistencies may indicate environmental mixing or stagnant conditions.",
                "Consider filtering or boiling before use. When possible, use bottled water or a verified clean source.",
            )
        else:
            return (
                "The water shows significant visual irregularities in surface reflection, texture, and colour patterns. "
                "Such visual characteristics differ substantially from typical clean water appearance.",
                "Avoid direct drinking. Use alternative clean water sources. "
                "If necessary, boil for at least 3 minutes or use proper filtration.",
            )


# ─── Routes ───────────────────────────────────────────────────────────────────

@api_router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("20/minute")
async def analyze_water(request: Request, file: UploadFile = File(...)):
    """Analyse an uploaded water image and return risk classification."""
    try:
        logger.info(f"Received image: {file.filename}")
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Image loaded: {image.size}, mode: {image.mode}")

        processed = preprocess_image(image)

        quality = validate_image_quality(processed)
        logger.info(f"Quality: blur={quality['blur_score']:.1f}, brightness={quality['brightness']:.1f}, ok={quality['quality_ok']}")

        # Convert to base64 for storage
        buf = io.BytesIO()
        processed.save(buf, format="PNG")
        image_b64 = base64.b64encode(buf.getvalue()).decode()

        features = analyze_image_features(processed)
        logger.info(f"Features: overall={features.overall_quality}")

        risk_level, confidence = calculate_risk_level(features)
        logger.info(f"Risk: {risk_level} ({confidence}%)")

        explanation, recommendation = await generate_ai_explanation(features, risk_level)

        analysis = WaterAnalysis(
            image_data=image_b64,
            risk_level=risk_level,
            confidence=confidence,
            visual_features=features,
            ai_explanation=explanation,
            recommendation=recommendation,
        )

        doc = analysis.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        if hasattr(doc['visual_features'], 'model_dump'):
            doc['visual_features'] = doc['visual_features'].model_dump()
        await db.water_analyses.insert_one(doc)
        logger.info(f"Saved: {analysis.id}")

        return AnalysisResponse(
            id=analysis.id,
            risk_level=analysis.risk_level,
            confidence=analysis.confidence,
            visual_features=analysis.visual_features,
            ai_explanation=analysis.ai_explanation,
            recommendation=analysis.recommendation,
            timestamp=analysis.timestamp.isoformat(),
        )

    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error analysing image: {str(e)}")


@api_router.get("/analyses", response_model=List[AnalysisResponse])
async def get_analyses(limit: int = 10):
    try:
        docs = await db.water_analyses.find(
            {}, {"_id": 0, "image_data": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)
        results = []
        for doc in docs:
            if isinstance(doc.get('visual_features'), dict):
                doc['visual_features'] = VisualFeatures(**doc['visual_features'])
            results.append(AnalysisResponse(**doc))
        return results
    except Exception as e:
        logger.error(f"Error fetching analyses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    try:
        doc = await db.water_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Analysis not found")
        if isinstance(doc.get('visual_features'), dict):
            doc['visual_features'] = VisualFeatures(**doc['visual_features'])
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "WaterTruth AI"}


# ─── Mount API router ──────────────────────────────────────────────────────────
app.include_router(api_router)

# ─── Serve React static build (production) ────────────────────────────────────
STATIC_DIR = ROOT_DIR.parent / "frontend" / "build"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR / "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        index = STATIC_DIR / "index.html"
        return FileResponse(str(index))

    logger.info(f"Serving React build from {STATIC_DIR}")
else:
    logger.info("No React build found — running in API-only mode")


# ─── Lifecycle ────────────────────────────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
