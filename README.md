# WaterTruth AI

**Mobile-first Progressive Web App for visual water safety risk estimation**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/react-19-blue.svg)](https://reactjs.org/)

## Overview

WaterTruth AI provides instant visual water safety risk assessment using computer vision and AI. Point your mobile camera at water, and get an immediate risk classification (LOW/MEDIUM/HIGH) with AI-powered explanations.

**⚠️ Important:** This system provides visual risk estimation only. It does NOT chemically test water and should NOT replace professional water quality testing.

## Features

- 📱 **Mobile-First PWA** - Installable, works offline
- 📷 **Live Camera Scanning** - Automatic capture when optimal
- 🤖 **AI-Powered Analysis** - OpenAI GPT-4 explanations
- 🎯 **Risk Classification** - LOW/MEDIUM/HIGH with confidence scores
- 🔒 **Privacy-First** - Images processed in-memory, not stored
- ⚡ **Fast** - Results in 3-5 seconds
- 🌐 **Works Anywhere** - No internet after initial load

## Tech Stack

**Backend:**
- FastAPI (Python 3.11)
- MongoDB (database)
- OpenAI API (GPT-4o-mini)
- Pillow + NumPy (image processing)
- Uvicorn (ASGI server)

**Frontend:**
- React 19 (PWA)
- Tailwind CSS (styling)
- Framer Motion (animations)
- Axios (HTTP client)
- Shadcn UI (components)

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB
- OpenAI API key

### Installation

**1. Clone repository:**
```bash
git clone https://github.com/yourusername/watertruth-ai.git
cd watertruth-ai
```

**2. Setup Backend:**
```bash
cd backend
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=watertruth_db
CORS_ORIGINS=*
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
EOF

# Run backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**3. Setup Frontend:**
```bash
cd ../frontend
yarn install

# Create .env file
cat > .env << EOF
REACT_APP_BACKEND_URL=http://localhost:8001
EOF

# Run frontend
yarn start
```

**4. Open in browser:**
```
http://localhost:3000
```

## Usage

### For Users

1. Open WaterTruth AI on your mobile device
2. Click "Start Camera Scan"
3. Point camera at water surface
4. Wait for automatic capture (1-2 seconds)
5. View results and AI explanation

### For Developers

**API Endpoints:**

```bash
# Health check
GET /api/health

# Analyze water image
POST /api/analyze
Content-Type: multipart/form-data
Body: file (image file)

# Get recent analyses
GET /api/analyses?limit=10

# Get specific analysis
GET /api/analyses/{id}
```

**Example API call:**

```bash
curl -X POST http://localhost:8001/api/analyze \
  -F "file=@water_sample.jpg"
```

**Response:**

```json
{
  "id": "uuid",
  "risk_level": "LOW",
  "confidence": 85.5,
  "visual_features": {
    "optical_reflection": 78.4,
    "refraction_distortion": 58.0,
    "surface_texture": 100.0,
    "turbidity": 78.4,
    "color_deviation": 99.5,
    "overall_quality": 82.9
  },
  "ai_explanation": "The water shows consistent visual patterns...",
  "recommendation": "Based on visual patterns, this appears low-risk...",
  "timestamp": "2025-02-06T16:04:20.658Z"
}
```

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed deployment instructions for:

- Vercel + MongoDB Atlas
- AWS EC2 + RDS
- Docker Compose
- Netlify + Railway

## Testing

### Backend Tests

```bash
cd backend
pytest
```

### Frontend Tests

```bash
cd frontend
yarn test
```

### Mobile Testing (Local)

See [LOCAL_MOBILE_TESTING_GUIDE.md](/app/LOCAL_MOBILE_TESTING_GUIDE.md)

## Project Structure

```
watertruth-ai/
├── backend/
│   ├── server.py           # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment variables
├── frontend/
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/        # Page components
│   │   ├── App.js        # Main app
│   │   └── App.css       # Styles
│   ├── package.json      # Dependencies
│   └── .env             # Environment variables
├── DEPLOYMENT_GUIDE.md   # Deployment instructions
└── README.md            # This file
```

## System Architecture

```
┌─────────────┐
│   Mobile    │
│   Browser   │
└──────┬──────┘
       │ Camera API
       ↓
┌─────────────┐
│   React     │
│   Frontend  │ ← PWA, Service Worker
└──────┬──────┘
       │ HTTPS/REST
       ↓
┌─────────────┐
│   FastAPI   │
│   Backend   │ ← Image Processing, Rate Limiting
└──────┬──────┘
       │
   ────┴────
   │       │
   ↓       ↓
┌─────┐ ┌─────┐
│ AI  │ │ DB  │
│GPT-4│ │Mongo│
└─────┘ └─────┘
```

## Visual Analysis Pipeline

1. **Image Capture** - Auto-capture at optimal quality (85%+)
2. **Preprocessing** - White balance, contrast, noise reduction
3. **Feature Extraction** - 5 visual metrics (0-100 scale)
4. **Risk Classification** - Rule-based classifier
5. **AI Explanation** - OpenAI GPT-4 generates human-readable text
6. **Results Display** - Risk level, confidence, recommendations

## Limitations

- ❌ Does NOT chemically test water
- ❌ Cannot detect invisible contaminants
- ❌ Not a medical device
- ❌ Not FDA/EPA approved
- ❌ Should NOT replace laboratory testing

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Acknowledgments

- OpenAI for GPT-4 API
- React team for awesome framework
- Tailwind CSS for utility-first styling
- Shadcn for beautiful UI components

## Contact

Project Link: [https://github.com/yourusername/watertruth-ai](https://github.com/yourusername/watertruth-ai)

## Disclaimer

**WaterTruth AI provides visual risk estimation only and does not chemically test water. This system does not identify specific contaminants, bacteria, or diseases. Results should not be used as a substitute for laboratory testing or professional water quality analysis. Always follow local water safety guidelines and regulations.**
