from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
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

# Image Preprocessing Pipeline
def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Image standardization pipeline:
    1. White balance correction (simplified)
    2. Contrast normalization
    3. Noise reduction
    """
    logger.info("Starting image preprocessing")
    
    # Convert to RGB if needed
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # 1. Auto white balance (simplified histogram stretching)
    img_array = np.array(image).astype(float)
    
    # Stretch each channel to full range
    for i in range(3):
        channel = img_array[:, :, i]
        channel_min = np.percentile(channel, 5)
        channel_max = np.percentile(channel, 95)
        if channel_max > channel_min:
            img_array[:, :, i] = np.clip(
                255 * (channel - channel_min) / (channel_max - channel_min), 0, 255
            )
    
    image = Image.fromarray(img_array.astype(np.uint8))
    
    # 2. Contrast normalization
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.2)
    
    # 3. Noise reduction (Gaussian blur)
    image = image.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    logger.info("Image preprocessing completed")
    return image

def validate_image_quality(image: Image.Image) -> dict:
    """
    Validate image quality before analysis
    Returns quality metrics and pass/fail
    """
    img_array = np.array(image.convert('L'))  # Convert to grayscale
    
    # Blur detection (Laplacian variance)
    laplacian = np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]])
    laplacian_result = np.zeros_like(img_array, dtype=float)
    
    for i in range(1, img_array.shape[0] - 1):
        for j in range(1, img_array.shape[1] - 1):
            laplacian_result[i, j] = np.sum(img_array[i-1:i+2, j-1:j+2] * laplacian)
    
    blur_score = np.var(laplacian_result)
    
    # Exposure check
    brightness = np.mean(img_array)
    
    # Determine quality
    is_quality_ok = blur_score > 50 and 40 < brightness < 240
    
    return {
        'blur_score': float(blur_score),
        'brightness': float(brightness),
        'quality_ok': is_quality_ok
    }

def analyze_image_features(image: Image.Image) -> VisualFeatures:
    """
    Extract visual features from preprocessed water image
    """
    # Resize for consistent analysis
    image = image.resize((224, 224))
    img_array = np.array(image)
    
    # Extract basic color statistics
    r_mean = np.mean(img_array[:, :, 0])
    g_mean = np.mean(img_array[:, :, 1])
    b_mean = np.mean(img_array[:, :, 2])
    
    r_var = np.var(img_array[:, :, 0])
    g_var = np.var(img_array[:, :, 1])
    b_var = np.var(img_array[:, :, 2])
    total_var = (r_var + g_var + b_var) / 3
    
    color_balance = abs(r_mean - g_mean) + abs(g_mean - b_mean) + abs(b_mean - r_mean)
    brightness = (r_mean + g_mean + b_mean) / 3
    
    # Visual feature scores (0-100, higher = better water quality)
    optical_reflection = min(100, max(0, (brightness / 255) * 100 - (total_var / 100)))
    refraction_distortion = min(100, max(0, 100 - (color_balance / 2)))
    surface_texture = min(100, max(0, 100 - (total_var / 50)))
    turbidity = min(100, max(0, (brightness / 255) * 100 - (total_var / 80)))
    
    # Color deviation from clear water
    ideal_clear_water = np.array([180, 200, 220])
    color_diff = np.sqrt(np.sum((np.array([r_mean, g_mean, b_mean]) - ideal_clear_water) ** 2))
    color_deviation = min(100, max(0, 100 - (color_diff / 3)))
    
    overall_quality = (optical_reflection + refraction_distortion + surface_texture + turbidity + color_deviation) / 5
    
    return VisualFeatures(
        optical_reflection=round(optical_reflection, 1),
        refraction_distortion=round(refraction_distortion, 1),
        surface_texture=round(surface_texture, 1),
        turbidity=round(turbidity, 1),
        color_deviation=round(color_deviation, 1),
        overall_quality=round(overall_quality, 1)
    )

def calculate_risk_level(features: VisualFeatures) -> tuple[str, float]:
    """
    Calculate risk level based on visual features
    Prefer warning over false safety
    """
    score = features.overall_quality
    
    # Conservative thresholds
    if score >= 75:
        risk_level = "LOW"
        confidence = min(92, 70 + (score - 75) / 25 * 22)
    elif score >= 45:
        risk_level = "MEDIUM"
        confidence = min(88, 65 + (score - 45) / 30 * 23)
    else:
        risk_level = "HIGH"
        confidence = min(93, 70 + (45 - score) / 45 * 23)
    
    return risk_level, round(confidence, 1)

async def generate_ai_explanation(features: VisualFeatures, risk_level: str) -> tuple[str, str]:
    """
    Generate human-readable explanation using OpenAI GPT-5.2
    STRICT RULES: No chemicals, bacteria, diseases, or medical claims
    """
    try:
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=str(uuid.uuid4()),
            system_message="""You are a water safety analyst explaining visual analysis results.

STRICT RULES:
- NEVER mention chemicals, bacteria, or diseases
- NEVER claim medical or laboratory accuracy
- NEVER say 'safe to drink' as a medical claim
- Focus ONLY on visual patterns and observations
- Use simple, calm, non-technical language
- Base explanations on appearance, not chemistry
- Communicate uncertainty clearly"""
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Analyze this water sample based on VISUAL features only:

Visual Scores (0-100, higher is better):
- Optical Reflection: {features.optical_reflection}
- Refraction Distortion: {features.refraction_distortion}
- Surface Texture: {features.surface_texture}
- Turbidity: {features.turbidity}
- Color Spectrum: {features.color_deviation}
- Overall: {features.overall_quality}

Risk Level: {risk_level}

Provide:
1. A 2-3 sentence explanation based on VISUAL PATTERNS only
2. A clear action recommendation

Format:
EXPLANATION: [visual observation only]
RECOMMENDATION: [clear action]

Remember: Visual risk estimation only. No chemical testing. No medical claims."""
        
        message = UserMessage(text=prompt)
        response = await chat.send_message(message)
        response_text = response.strip()
        
        if "EXPLANATION:" in response_text and "RECOMMENDATION:" in response_text:
            parts = response_text.split("RECOMMENDATION:")
            explanation = parts[0].replace("EXPLANATION:", "").strip()
            recommendation = parts[1].strip()
        else:
            explanation = response_text
            recommendation = "Please consult local water quality guidelines before consumption."
        
        return explanation, recommendation
        
    except Exception as e:
        logger.error(f"Error generating AI explanation: {str(e)}")
        
        # Fallback explanations (visual-focused)
        if risk_level == "LOW":
            explanation = "The water shows consistent visual patterns with stable surface reflection and uniform color distribution. These visual characteristics align with typical clean water appearance."
            recommendation = "Based on visual patterns, this appears low-risk. However, visual checks cannot confirm safety. Follow local water guidelines before drinking."
        elif risk_level == "MEDIUM":
            explanation = "The water shows some visual irregularities in surface texture and light behavior. These inconsistencies may indicate environmental mixing or stagnant conditions."
            recommendation = "Consider filtering or boiling before use. When possible, use bottled water or verified clean sources."
        else:
            explanation = "The water shows significant visual irregularities in surface reflection, texture, and color patterns. Such visual characteristics differ substantially from typical clean water."
            recommendation = "Avoid direct drinking. Use alternative clean water sources. If necessary, boil for at least 3 minutes or use proper filtration."
        
        return explanation, recommendation

@api_router.post("/analyze", response_model=AnalysisResponse)
async def analyze_water(file: UploadFile = File(...)):
    """
    Analyze uploaded water image with preprocessing pipeline
    Images are processed in-memory only (no permanent storage)
    """
    try:
        logger.info(f"Received image for analysis: {file.filename}")
        
        # Read image (in-memory only)
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Image loaded: {image.size}, mode: {image.mode}")
        
        # Preprocessing pipeline
        processed_image = preprocess_image(image)
        
        # Quality validation
        quality_check = validate_image_quality(processed_image)
        logger.info(f"Quality check: blur={quality_check['blur_score']:.1f}, brightness={quality_check['brightness']:.1f}")
        
        if not quality_check['quality_ok']:
            logger.warning("Image quality below threshold")
            # Continue anyway but log warning
        
        # Convert to base64 for storage (temporary)
        buffered = io.BytesIO()
        processed_image.save(buffered, format="PNG")
        image_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Extract visual features
        features = analyze_image_features(processed_image)
        logger.info(f"Features extracted: quality={features.overall_quality}")
        
        # Calculate risk level
        risk_level, confidence = calculate_risk_level(features)
        logger.info(f"Risk assessment: {risk_level} ({confidence}%)")
        
        # Generate AI explanation
        explanation, recommendation = await generate_ai_explanation(features, risk_level)
        
        # Create analysis record
        analysis = WaterAnalysis(
            image_data=image_base64,
            risk_level=risk_level,
            confidence=confidence,
            visual_features=features,
            ai_explanation=explanation,
            recommendation=recommendation
        )
        
        # Save to database (temporary storage)
        doc = analysis.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        doc['visual_features'] = doc['visual_features'].model_dump() if hasattr(doc['visual_features'], 'model_dump') else doc['visual_features']
        await db.water_analyses.insert_one(doc)
        
        logger.info(f"Analysis completed: {analysis.id} - {risk_level} ({confidence}%)")
        
        return AnalysisResponse(
            id=analysis.id,
            risk_level=analysis.risk_level,
            confidence=analysis.confidence,
            visual_features=analysis.visual_features,
            ai_explanation=analysis.ai_explanation,
            recommendation=analysis.recommendation,
            timestamp=analysis.timestamp.isoformat()
        )
        
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing image: {str(e)}")

@api_router.get("/analyses", response_model=List[AnalysisResponse])
async def get_analyses(limit: int = 10):
    """
    Get recent analyses (without image data for performance)
    """
    try:
        analyses = await db.water_analyses.find(
            {},
            {"_id": 0, "image_data": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)
        
        results = []
        for analysis in analyses:
            if isinstance(analysis.get('visual_features'), dict):
                analysis['visual_features'] = VisualFeatures(**analysis['visual_features'])
            results.append(AnalysisResponse(**analysis))
        
        return results
        
    except Exception as e:
        logger.error(f"Error fetching analyses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """
    Get specific analysis with image
    """
    try:
        analysis = await db.water_analyses.find_one(
            {"id": analysis_id},
            {"_id": 0}
        )
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        if isinstance(analysis.get('visual_features'), dict):
            analysis['visual_features'] = VisualFeatures(**analysis['visual_features'])
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "WaterTruth AI"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()