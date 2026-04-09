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
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from PIL import Image, ImageEnhance, ImageFilter
import io
import base64
import numpy as np
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ─── MongoDB ──────────────────────────────────────────────────────────────────
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME   = os.environ.get('DB_NAME', 'watertruth_db')
mongo_client: Optional[AsyncIOMotorClient] = None
db = None

# ─── OpenAI ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '').strip()
openai_client: Optional[AsyncOpenAI] = None
if OPENAI_API_KEY:
    openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    logger.info("OpenAI client initialised")
else:
    logger.warning("OPENAI_API_KEY not set — AI explanations will use fallback text")

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="WaterTruth AI API", version="1.0.0")

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
async def startup():
    global mongo_client, db
    try:
        mongo_client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )
        # Verify connection is live
        await mongo_client.admin.command("ping")
        db = mongo_client[DB_NAME]
        # Create index for fast ID lookups
        await db.water_analyses.create_index("id", unique=True, background=True)
        logger.info(f"MongoDB connected: {MONGO_URL[:40]}...")
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        logger.warning("App will start but database operations will fail until MongoDB is reachable")
        mongo_client = None
        db = None


@app.on_event("shutdown")
async def shutdown():
    if mongo_client:
        mongo_client.close()
        logger.info("MongoDB connection closed")


def get_db():
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Database not connected. Check MONGO_URL environment variable."
        )
    return db


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
    """White-balance + contrast normalise + gentle denoise."""
    if image.mode != 'RGB':
        image = image.convert('RGB')

    img = np.array(image, dtype=float)
    for ch in range(3):
        lo = np.percentile(img[:, :, ch], 2)
        hi = np.percentile(img[:, :, ch], 98)
        if hi > lo:
            img[:, :, ch] = np.clip(255 * (img[:, :, ch] - lo) / (hi - lo), 0, 255)

    image = Image.fromarray(img.astype(np.uint8))
    image = ImageEnhance.Contrast(image).enhance(1.15)
    image = image.filter(ImageFilter.GaussianBlur(radius=0.4))
    return image


def validate_image_quality(image: Image.Image) -> dict:
    """
    Fast quality check via numpy Laplacian.
    Thresholds are intentionally lenient — camera images vary widely.
    A uniform surface (calm clear water) naturally has low edge variance.
    """
    gray = np.array(image.convert('L'), dtype=float)
    lap = (
          4 * gray[1:-1, 1:-1]
        - gray[:-2, 1:-1]
        - gray[2:,  1:-1]
        - gray[1:-1, :-2]
        - gray[1:-1,  2:]
    )
    blur_score  = float(np.var(lap))
    brightness  = float(np.mean(gray))
    # Very lenient: accept almost anything a real camera would produce
    quality_ok  = brightness > 15 and brightness < 248
    return {'blur_score': blur_score, 'brightness': brightness, 'quality_ok': quality_ok}


def analyze_image_features(image: Image.Image) -> VisualFeatures:
    """Extract visual quality scores from the preprocessed image."""
    img = np.array(image.resize((224, 224)), dtype=float)

    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    r_mean, g_mean, b_mean = r.mean(), g.mean(), b.mean()
    r_var,  g_var,  b_var  = r.var(),  g.var(),  b.var()
    total_var = (r_var + g_var + b_var) / 3
    brightness = (r_mean + g_mean + b_mean) / 3
    color_balance = abs(r_mean - g_mean) + abs(g_mean - b_mean) + abs(b_mean - r_mean)

    optical_reflection    = float(np.clip((brightness / 255) * 100 - (total_var / 100), 0, 100))
    refraction_distortion = float(np.clip(100 - (color_balance / 2),                   0, 100))
    surface_texture       = float(np.clip(100 - (total_var / 50),                       0, 100))
    turbidity             = float(np.clip((brightness / 255) * 100 - (total_var / 80),  0, 100))

    ideal     = np.array([180.0, 200.0, 220.0])
    color_diff = float(np.sqrt(np.sum((np.array([r_mean, g_mean, b_mean]) - ideal) ** 2)))
    color_deviation = float(np.clip(100 - (color_diff / 3), 0, 100))

    overall = (optical_reflection + refraction_distortion + surface_texture
               + turbidity + color_deviation) / 5

    return VisualFeatures(
        optical_reflection=round(optical_reflection, 1),
        refraction_distortion=round(refraction_distortion, 1),
        surface_texture=round(surface_texture, 1),
        turbidity=round(turbidity, 1),
        color_deviation=round(color_deviation, 1),
        overall_quality=round(overall, 1),
    )


def calculate_risk_level(features: VisualFeatures) -> tuple[str, float]:
    score = features.overall_quality
    if score >= 70:
        risk  = "LOW"
        conf  = min(93, 70 + (score - 70) / 30 * 23)
    elif score >= 40:
        risk  = "MEDIUM"
        conf  = min(88, 65 + (score - 40) / 30 * 23)
    else:
        risk  = "HIGH"
        conf  = min(93, 70 + (40 - score) / 40 * 23)
    return risk, round(conf, 1)


def _fallback_explanation(risk_level: str) -> tuple[str, str]:
    if risk_level == "LOW":
        return (
            "The water shows consistent visual patterns with stable surface reflection "
            "and uniform colour distribution, aligning with typical clean water appearance.",
            "Based on visual patterns this appears low-risk. Visual checks cannot confirm "
            "safety — always follow local water guidelines before drinking.",
        )
    elif risk_level == "MEDIUM":
        return (
            "The water shows some visual irregularities in surface texture and light "
            "behaviour, which may indicate environmental mixing or stagnant conditions.",
            "Consider filtering or boiling before use. When possible, use bottled water "
            "or a verified clean source.",
        )
    else:
        return (
            "The water shows significant visual irregularities in surface reflection, "
            "texture, and colour patterns that differ from typical clean water appearance.",
            "Avoid direct drinking. Use an alternative clean water source. If necessary, "
            "boil for at least 3 minutes or use proper filtration.",
        )


async def generate_ai_explanation(features: VisualFeatures, risk_level: str) -> tuple[str, str]:
    """Call OpenAI for explanation; fall back to rule-based text if key is absent or call fails."""
    if not openai_client:
        logger.info("Skipping OpenAI call — no API key configured")
        return _fallback_explanation(risk_level)

    try:
        response = await openai_client.chat.completions.create(
            model=os.environ.get('OPENAI_MODEL', 'gpt-4o-mini'),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a water safety analyst explaining visual analysis results.\n"
                        "STRICT RULES:\n"
                        "- NEVER mention chemicals, bacteria, or diseases\n"
                        "- NEVER claim medical or laboratory accuracy\n"
                        "- Focus ONLY on visual patterns (colour, clarity, texture)\n"
                        "- Use simple, calm, non-technical language\n"
                        "- Communicate uncertainty clearly"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Analyse this water sample from VISUAL features only:\n\n"
                        f"Scores (0-100, higher = better appearance):\n"
                        f"- Optical Reflection: {features.optical_reflection}\n"
                        f"- Refraction Distortion: {features.refraction_distortion}\n"
                        f"- Surface Texture: {features.surface_texture}\n"
                        f"- Turbidity (clarity): {features.turbidity}\n"
                        f"- Colour Score: {features.color_deviation}\n"
                        f"- Overall: {features.overall_quality}\n\n"
                        f"Risk Level: {risk_level}\n\n"
                        f"Provide:\n"
                        f"EXPLANATION: [2-3 sentence visual observation]\n"
                        f"RECOMMENDATION: [clear action for the user]\n\n"
                        f"No chemical claims. No medical claims. Visual only."
                    ),
                },
            ],
            temperature=0.6,
            max_tokens=250,
            timeout=15,
        )
        text = response.choices[0].message.content.strip()
        if "EXPLANATION:" in text and "RECOMMENDATION:" in text:
            parts = text.split("RECOMMENDATION:")
            explanation    = parts[0].replace("EXPLANATION:", "").strip()
            recommendation = parts[1].strip()
        else:
            explanation    = text
            recommendation = "Please consult local water quality guidelines before consumption."
        return explanation, recommendation

    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return _fallback_explanation(risk_level)


# ─── Routes ───────────────────────────────────────────────────────────────────

@api_router.get("/health")
async def health_check():
    db_status = "connected" if db is not None else "disconnected"
    ai_status = "configured" if openai_client else "not configured (fallback active)"
    return {
        "status": "healthy",
        "service": "WaterTruth AI",
        "database": db_status,
        "ai": ai_status,
    }


@api_router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("20/minute")
async def analyze_water(request: Request, file: UploadFile = File(...)):
    """Analyse an uploaded water image and return risk classification."""
    database = get_db()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        try:
            image = Image.open(io.BytesIO(contents))
            image.verify()
            image = Image.open(io.BytesIO(contents))  # re-open after verify
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

        logger.info(f"Image loaded: {image.size}, mode: {image.mode}")

        processed = preprocess_image(image)

        quality = validate_image_quality(processed)
        logger.info(
            f"Quality: blur={quality['blur_score']:.1f}, "
            f"brightness={quality['brightness']:.1f}, "
            f"ok={quality['quality_ok']}"
        )

        # Store base64 of processed image
        buf = io.BytesIO()
        processed.save(buf, format="JPEG", quality=80)
        image_b64 = base64.b64encode(buf.getvalue()).decode()

        features = analyze_image_features(processed)
        logger.info(f"Features: {features.model_dump()}")

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

        await database.water_analyses.insert_one(doc)
        logger.info(f"Saved analysis: {analysis.id} → {risk_level} ({confidence}%)")

        return AnalysisResponse(
            id=analysis.id,
            risk_level=analysis.risk_level,
            confidence=analysis.confidence,
            visual_features=analysis.visual_features,
            ai_explanation=analysis.ai_explanation,
            recommendation=analysis.recommendation,
            timestamp=analysis.timestamp.isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@api_router.get("/analyses", response_model=List[AnalysisResponse])
async def get_analyses(limit: int = 10):
    database = get_db()
    try:
        docs = await database.water_analyses.find(
            {}, {"_id": 0, "image_data": 0}
        ).sort("timestamp", -1).limit(max(1, min(limit, 100))).to_list(None)

        results = []
        for doc in docs:
            if isinstance(doc.get('visual_features'), dict):
                doc['visual_features'] = VisualFeatures(**doc['visual_features'])
            results.append(AnalysisResponse(**doc))
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analyses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    database = get_db()
    try:
        doc = await database.water_analyses.find_one({"id": analysis_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Analysis not found")
        if isinstance(doc.get('visual_features'), dict):
            doc['visual_features'] = VisualFeatures(**doc['visual_features'])
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis {analysis_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Register API router ───────────────────────────────────────────────────────
app.include_router(api_router)


# ─── Serve React build (production only) ─────────────────────────────────────
STATIC_DIR = ROOT_DIR.parent / "frontend" / "build"
STATIC_ASSETS = STATIC_DIR / "static"

if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    logger.info(f"Serving React build from {STATIC_DIR}")

    # Serve /static/** assets (CSS, JS, media)
    if STATIC_ASSETS.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_ASSETS)), name="react-static")

    # Serve manifest, favicon, service-worker etc from build root
    @app.get("/manifest.json")
    async def manifest():
        return FileResponse(str(STATIC_DIR / "manifest.json"))

    @app.get("/favicon.ico")
    async def favicon():
        return FileResponse(str(STATIC_DIR / "favicon.ico"))

    @app.get("/service-worker.js")
    async def service_worker():
        return FileResponse(str(STATIC_DIR / "service-worker.js"))

    # React Router catch-all — must be last
    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(str(STATIC_DIR / "index.html"))

else:
    logger.info("No React build found — running in API-only / dev mode")
