# Deploy WaterTruth AI to Render

This app ships as a **single web service** on Render. The build step compiles
the React frontend into `frontend/build/`, and FastAPI (`backend/server.py`)
serves both `/api/*` and the static React build from the same origin.

## 1. Push to GitHub

Push this repository to a GitHub account that Render can read.

## 2. Create the service on Render

Option A — **Blueprint (recommended)**:

1. Go to [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect your GitHub repo — Render will read `render.yaml` automatically
3. When prompted, paste the two secrets:
   - `OPENAI_API_KEY` — your OpenAI key with GPT-5.2 access
   - `DATABASE_URL` — your Supabase **Transaction Pooler** URI (port `6543`)
     ```
     postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
     ```
4. Click **Apply** — first build takes ~4-6 min (installs Python + Node deps, builds React)

Option B — **Manual web service**:

- **Runtime**: Python 3
- **Build command**:
  ```
  pip install -r backend/requirements.txt && cd frontend && yarn install --frozen-lockfile && yarn build
  ```
- **Start command**:
  ```
  cd backend && gunicorn server:app -c gunicorn.conf.py
  ```
- **Health check path**: `/api/health`
- **Environment variables** (Environment tab):
  - `OPENAI_API_KEY` = your OpenAI key
  - `DATABASE_URL` = Supabase pooler URI (port 6543)
  - `OPENAI_MODEL` = `gpt-5.2`
  - `PYTHON_VERSION` = `3.11.9`
  - `NODE_VERSION` = `20.11.1`

## 3. Verify after deploy

```
curl https://<your-service>.onrender.com/api/health
```

Expected:
```json
{
  "status": "healthy",
  "database": "supabase",
  "ai": "configured",
  "model": "gpt-5.2"
}
```

Then open `https://<your-service>.onrender.com/` in a browser — you should see
the WaterTruth home page. Tap **Start Camera Scan** (requires HTTPS, which
Render provides by default) → capture a water sample → get a real GPT-5.2
classification.

## 4. Common gotchas

| Symptom | Fix |
|---|---|
| `database: "in-memory (fallback)"` in /api/health | `DATABASE_URL` missing or wrong. Must be Transaction Pooler on port **6543**, not direct connection on 5432. |
| `ai: "not configured"` | `OPENAI_API_KEY` missing from Environment tab. |
| 500 on first write (`CheckViolationError`) | You added CHECK constraints and the em-dash got mangled. Drop them: `ALTER TABLE water_analyses DROP CONSTRAINT IF EXISTS water_analyses_drinkability_valid, DROP CONSTRAINT IF EXISTS water_analyses_classification_valid, DROP CONSTRAINT IF EXISTS water_analyses_confidence_valid;` |
| Camera permission denied on phone | Must be served over HTTPS. Render gives you HTTPS by default. |
| Free tier sleeps after 15 min idle | First request after sleep takes ~30s to wake. Upgrade to Starter ($7/mo) for always-on. |

## 5. Database schema

SQLAlchemy auto-creates the `water_analyses` table on first startup. No
migrations needed for the initial deploy. If you want to add indexes or
constraints, use the SQL helpers in `/app/memory/PRD.md`.
