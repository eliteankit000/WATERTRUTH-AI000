# WaterTruth AI

A mobile-first Progressive Web App (PWA) for AI-powered visual water safety risk estimation.

## Tech Stack

- **Frontend**: React 19 + CRACO, Tailwind CSS, shadcn/ui, Framer Motion — port 5000 (dev)
- **Backend**: FastAPI + Motor (MongoDB async) + OpenAI API — port 8000 (dev)
- **Database**: MongoDB (local in dev via mongod, MongoDB Atlas recommended for production)

## Project Structure

```
watertruth-ai/
├── backend/
│   ├── server.py           # FastAPI app — analysis routes + serves React build in prod
│   ├── requirements.txt    # Clean production Python deps
│   ├── gunicorn.conf.py    # Gunicorn production config
│   └── .env                # Local secrets (MONGO_URL, OPENAI_API_KEY)
├── frontend/
│   ├── src/
│   │   ├── components/CameraScanner.jsx   # Camera + image capture
│   │   ├── pages/Results.jsx              # Analysis results display
│   │   └── pages/Home.jsx                 # Landing page
│   ├── .env                # PORT=5000, HOST=0.0.0.0, REACT_APP_BACKEND_URL=
│   ├── package.json        # proxy: localhost:8000 for dev
│   └── craco.config.js     # allowedHosts:all, host:0.0.0.0
├── render.yaml             # Render.com deployment config
├── Procfile                # Alternative start command
└── start_backend.sh        # Replit dev: starts MongoDB + uvicorn
```

## Replit Dev Workflows

- **Start application**: `cd frontend && PORT=5000 yarn start` → port 5000 (webview)
- **Backend**: `bash start_backend.sh` → MongoDB fork + FastAPI on port 8000

## How API Calls Work

- **Development**: Frontend (port 5000) proxies `/api/*` to backend (port 8000) via `"proxy"` in package.json. `REACT_APP_BACKEND_URL` is empty.
- **Production**: FastAPI serves the React `build/` as static files. All `/api/*` hits FastAPI directly. No proxy needed.

## Deploy to Render.com

### Prerequisites
1. MongoDB Atlas free cluster — get a connection string (`mongodb+srv://...`)
2. OpenAI API key

### Steps
1. Push to GitHub
2. Create new **Web Service** on Render, connect repo
3. Render auto-detects `render.yaml` — it sets build/start commands automatically
4. Set these **Environment Variables** in Render dashboard:
   - `MONGO_URL` → your MongoDB Atlas connection string
   - `OPENAI_API_KEY` → your OpenAI key
5. Deploy — single service handles both frontend and backend

### Build command (auto from render.yaml)
```
pip install -r backend/requirements.txt && cd frontend && npm install --legacy-peer-deps && npm run build
```

### Start command (auto from render.yaml)
```
cd backend && gunicorn server:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
```

## Analysis Pipeline

1. **Camera capture** — mobile camera via `getUserMedia`, auto-captures when quality ≥ 40%
2. **Image preprocessing** — white balance, contrast normalisation, Gaussian denoise
3. **Quality validation** — numpy Laplacian blur detection + brightness check
4. **Feature extraction** — optical reflection, turbidity, surface texture, colour deviation
5. **Risk classification** — overall quality score → LOW / MEDIUM / HIGH
6. **AI explanation** — GPT-4o-mini generates human-readable observation + recommendation
7. **MongoDB storage** — analysis saved with UUID, retrievable by ID

## Key Config Notes

- Frontend uses `REACT_APP_BACKEND_URL = ''` so API calls use relative paths (`/api/...`)
- `"proxy": "http://localhost:8000"` in frontend/package.json enables dev proxying
- FastAPI mounts React `build/` as static files when `frontend/build/` exists
- CORS is set to `allow_origins=["*"]` — restrict to your domain in strict prod environments
- `validate_image_quality` uses numpy vectorised Laplacian (fast) — no Python loops
