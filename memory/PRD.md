# WaterTruth AI — Product Requirements Document

## Problem statement (from user)
Visual water-quality analyst embedded in an environmental safety application. Input is an image captured from a live camera. Output is a strictly-structured JSON (`visual_analysis`, `classification`, `drinkability`, `confidence`, `recommendation`, `warning`) produced by GPT-5.2 vision. The app never declares water safe to drink based on appearance alone. History is persisted to **Supabase** (replacing MongoDB). Deployed on **Render**.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
  - `POST /api/analyze` — accepts multipart image, returns structured JSON result
  - `GET /api/analyses?limit=N` — list recent (no image blob)
  - `GET /api/analyses/{id}` — full detail incl. base64 image
  - `GET /api/health` — reports DB + LLM status
  - Storage: SQLAlchemy async + Supabase PostgreSQL (Transaction Pooler, `statement_cache_size=0`). Falls back to in-memory store if `DATABASE_URL` missing.
  - Vision: OpenAI `AsyncOpenAI` client, model `gpt-5.2`, `response_format=json_object`. Deterministic fallback if key missing.
  - Output sanitiser enforces: valid classification, mapped drinkability, verbatim mandatory warning, LOW-confidence recapture hint.
- **Frontend**: React (CRA + Tailwind + shadcn/ui) on port 3000
  - Routes: `/` (Home), `/scan` (CameraScanner), `/results/:id`, `/history`
  - Live camera water-detector overlay with quality metrics & auto-capture
  - Distinctive **Swiss / Clinical Dashboard** design (IBM Plex Sans + Mono, no reassuring greens, red marquee disclaimer)

## What's implemented (2026-04-23)
- ✅ New `/api/analyze` endpoint using **GPT-5.2 vision** (JSON mode)
- ✅ Strict output contract with spec-mapped drinkability + recommendation + mandatory warning
- ✅ **Supabase** persistence layer via SQLAlchemy async (Transaction Pooler) with in-memory fallback
- ✅ `/api/analyses` and `/api/analyses/{id}` list/detail endpoints
- ✅ Redesigned clinical Swiss-grid frontend (Home, Scanner, Results, History)
- ✅ Live camera HUD with brackets / crosshair / scan line / quality telemetry
- ✅ Results page with mandatory red safety banner, classification chip (no green for CLEAN), drinkability verdict, monospace observations, raw JSON drawer
- ✅ History log page with dense grid of past analyses
- ✅ Backend + frontend services running cleanly under supervisor

## Pending — awaiting user credentials
- 🔑 `OPENAI_API_KEY` — user to provide their own GPT-5.2-capable key
- 🔑 `DATABASE_URL` — user to provide Supabase Transaction Pooler URI (port 6543)

Until both are provided, the app runs in graceful-fallback mode (returns `NO_WATER_DETECTED` with a "key not configured" recommendation, and stores records in-memory).

## Next action items
- P0: Once user provides `OPENAI_API_KEY` and `DATABASE_URL`, add them to `/app/backend/.env`, restart backend, verify `/api/health` shows `ai: configured` and `database: supabase`
- P0: Run end-to-end test with a real water image via `/scan`
- P1: Optional — upload captured images to Supabase Storage and store a URL instead of base64 to shrink rows
- P1: Optional — CSV/PDF export of history
- P2: Optional — trend charts over time (classification frequency by day)

## Business/engagement enhancement suggestion
Add a one-tap **"Share verified report"** button on the Results page that produces a signed, read-only URL (`/results/:id?share=token`). Environmental groups, NGOs, and journalists could crowdsource water-quality reports from field volunteers — dramatically increasing app reach and creating a shareable dataset of river/lake/source observations over time.
