# WaterTruth AI

A mobile-first Progressive Web App (PWA) for visual water safety risk estimation using AI (OpenAI GPT-4o-mini).

## Architecture

- **Frontend**: React 19 + CRACO, Tailwind CSS, shadcn/ui, Framer Motion — runs on port 5000
- **Backend**: FastAPI (Python) + MongoDB (motor) + OpenAI API — runs on port 8000
- **Database**: MongoDB (local, running via mongod with data at /tmp/mongodb-data)

## Project Structure

```
watertruth-ai/
├── backend/
│   ├── server.py          # FastAPI app with image analysis routes
│   ├── .env               # Backend config (MONGO_URL, OPENAI_API_KEY, etc.)
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── src/               # React source
│   ├── .env               # Frontend env (REACT_APP_BACKEND_URL, PORT=5000)
│   ├── craco.config.js    # CRACO config (allowedHosts: all, host: 0.0.0.0)
│   └── package.json       # Node dependencies (yarn)
├── start_backend.sh       # Starts MongoDB + uvicorn backend
└── replit.md
```

## Workflows

- **Start application**: `cd frontend && PORT=5000 yarn start` → port 5000 (webview)
- **Backend**: `bash start_backend.sh` → starts MongoDB + FastAPI on port 8000

## Environment Variables

- `REACT_APP_BACKEND_URL`: URL to backend (set in frontend/.env)
- `OPENAI_API_KEY`: Required for AI analysis (set in backend/.env or as Replit secret)
- `MONGO_URL`: MongoDB connection string (default: mongodb://localhost:27017)
- `DB_NAME`: MongoDB database name (default: watertruth_db)

## Key Notes

- Frontend uses CRACO (Create React App Configuration Override) with `allowedHosts: all` to work behind Replit's proxy
- MongoDB runs locally with `--fork` flag in the backend startup script
- The `ajv` package (v8) is required in frontend/node_modules to fix a dependency conflict with react-scripts
- Motor v3.6.0 + PyMongo v4.9.2 are needed (motor 3.3.1 is incompatible with newer pymongo)
