# Test Credentials

This project does not use in-app authentication — no user credentials are created or seeded.

## External integration credentials (user-provided)
- **OPENAI_API_KEY** — set in `/app/backend/.env` when the user provides their own OpenAI GPT-5.2-capable key. Empty at the time of writing; backend gracefully falls back to `NO_WATER_DETECTED` / `LOW` confidence when absent.
- **DATABASE_URL** — Supabase Transaction Pooler URI (port 6543). Empty at the time of writing; backend falls back to an in-memory store.

Once the user pastes these into `/app/backend/.env` and `sudo supervisorctl restart backend`, `/api/health` should report `ai: configured` + `database: supabase`.
