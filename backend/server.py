from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from PIL import Image
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
    optical_reflection: float  # 0-100 score
    refraction_distortion: float  # 0-100 score
    surface_texture: float  # 0-100 score
    turbidity: float  # 0-100 score
    color_deviation: float  # 0-100 score
    overall_quality: float  # 0-100 score

class WaterAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image_data: str  # Base64 encoded image
    risk_level: str  # LOW, MEDIUM, HIGH
    confidence: float  # 0-100
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

# Mock Visual Analysis Functions
def analyze_image_features(image: Image.Image) -> VisualFeatures:
    """
    Mock CV analysis - extracts visual features from water image
    In production, this would use actual CV models
    """
    # Convert to RGB if needed
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize for consistent analysis
    image = image.resize((224, 224))
    img_array = np.array(image)
    
    # Extract basic color statistics
    r_mean = np.mean(img_array[:, :, 0])
    g_mean = np.mean(img_array[:, :, 1])
    b_mean = np.mean(img_array[:, :, 2])
    
    # Calculate color variance (texture indicator)
    r_var = np.var(img_array[:, :, 0])
    g_var = np.var(img_array[:, :, 1])
    b_var = np.var(img_array[:, :, 2])
    total_var = (r_var + g_var + b_var) / 3
    
    # Calculate color balance (deviation from neutral)
    color_balance = abs(r_mean - g_mean) + abs(g_mean - b_mean) + abs(b_mean - r_mean)
    
    # Calculate brightness
    brightness = (r_mean + g_mean + b_mean) / 3
    
    # Mock visual feature scores (0-100)
    # Higher scores = better water quality indicators
    
    # Optical reflection (based on brightness and uniformity)
    optical_reflection = min(100, max(0, (brightness / 255) * 100 - (total_var / 100)))
    
    # Refraction distortion (based on color uniformity)
    refraction_distortion = min(100, max(0, 100 - (color_balance / 2)))
    
    # Surface texture (based on variance)
    surface_texture = min(100, max(0, 100 - (total_var / 50)))
    
    # Turbidity (based on clarity indicators)
    turbidity = min(100, max(0, (brightness / 255) * 100 - (total_var / 80)))
    
    # Color deviation (how far from clear water - bluish/transparent)
    ideal_clear_water = np.array([180, 200, 220])  # Light blue-ish clear water
    color_diff = np.sqrt(np.sum((np.array([r_mean, g_mean, b_mean]) - ideal_clear_water) ** 2))
    color_deviation = min(100, max(0, 100 - (color_diff / 3)))
    
    # Overall quality score
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
    Returns (risk_level, confidence)
    """
    score = features.overall_quality
    
    if score >= 70:
        risk_level = "LOW"
        confidence = min(95, 70 + (score - 70) / 30 * 25)  # 70-95% confidence
    elif score >= 40:
        risk_level = "MEDIUM"
        confidence = min(85, 60 + (score - 40) / 30 * 25)  # 60-85% confidence
    else:
        risk_level = "HIGH"
        confidence = min(90, 65 + (40 - score) / 40 * 25)  # 65-90% confidence
    
    return risk_level, round(confidence, 1)

async def generate_ai_explanation(features: VisualFeatures, risk_level: str) -> tuple[str, str]:
    """
    Generate human-readable explanation using OpenAI GPT-5.2
    Returns (explanation, recommendation)
    """
    try:
        # Initialize LLM Chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=str(uuid.uuid4()),
            system_message="You are a water safety analyst. Explain visual water analysis results in simple, non-technical language. NEVER make medical claims or identify specific contaminants. Focus only on visual patterns and general safety guidance."
        ).with_model("openai", "gpt-5.2")
        
        # Create analysis prompt
        prompt = f"""Analyze this water sample based on visual features:

Visual Analysis Scores (0-100, higher is better):
- Optical Reflection Stability: {features.optical_reflection}
- Refraction Distortion: {features.refraction_distortion}
- Surface Texture Consistency: {features.surface_texture}
- Turbidity Indicators: {features.turbidity}
- Color Spectrum Deviation: {features.color_deviation}
- Overall Quality Score: {features.overall_quality}

Risk Classification: {risk_level}

Provide:
1. A 2-3 sentence explanation of what these visual patterns typically indicate (avoid technical jargon)
2. A clear safety recommendation

Format your response as:
EXPLANATION: [your explanation]
RECOMMENDATION: [your recommendation]

Remember: This is visual analysis only, not chemical testing. Never claim the water is medically safe or unsafe."""
        
        message = UserMessage(text=prompt)
        response = await chat.send_message(message)
        
        # Parse response
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
        # Fallback explanation
        if risk_level == "LOW":
            explanation = "The water surface reflection and texture patterns align with typical clean water visual characteristics. Visual consistency suggests minimal observable irregularities."
            recommendation = "Based on visual analysis, this water appears clear. However, always verify with local water quality standards before drinking."
        elif risk_level == "MEDIUM":
            explanation = "The water shows some visual inconsistencies in surface patterns and color distribution. These variations may indicate stagnant water or mixed sources."
            recommendation = "Consider filtering or boiling before consumption. When possible, use bottled water or verified clean sources."
        else:
            explanation = "The water surface reflection and texture do not match typical clean water patterns. Such visual inconsistencies are commonly associated with contaminated or stagnant sources."
            recommendation = "Avoid direct drinking. Use alternative clean water sources. If necessary, boil for at least 3 minutes before use."
        
        return explanation, recommendation

@api_router.post("/analyze", response_model=AnalysisResponse)
async def analyze_water(file: UploadFile = File(...)):
    """
    Analyze uploaded water image
    """
    try:
        # Read and validate image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Convert to base64 for storage
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        image_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Extract visual features
        features = analyze_image_features(image)
        
        # Calculate risk level
        risk_level, confidence = calculate_risk_level(features)
        
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
        
        # Save to database
        doc = analysis.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        doc['visual_features'] = doc['visual_features'].model_dump() if hasattr(doc['visual_features'], 'model_dump') else doc['visual_features']
        await db.water_analyses.insert_one(doc)
        
        logger.info(f"Analysis completed: {analysis.id} - Risk: {risk_level} ({confidence}%)")
        
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
        
        # Convert nested dicts to proper format
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
        
        # Convert visual_features dict to model
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