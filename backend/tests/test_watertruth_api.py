"""WaterTruth AI backend API tests — LIVE mode (GPT-5.2 vision + Supabase)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break

API = f"{BASE_URL}/api"

MANDATORY_WARNING = (
    "Visual inspection cannot detect dissolved chemicals, heavy metals, pathogens, "
    "or biological contaminants. This result is NOT a substitute for laboratory "
    "testing (TDS, pH, bacteria, chemical screening)."
)

VALID_CLASSIFICATIONS = {
    "CLEAN", "SLIGHTLY_CONTAMINATED", "DIRTY", "HIGHLY_POLLUTED", "NO_WATER_DETECTED",
}
DRINKABILITY_MAP = {
    "CLEAN":                 "UNCERTAIN — VISUAL ONLY",
    "SLIGHTLY_CONTAMINATED": "UNCERTAIN — TESTING REQUIRED",
    "DIRTY":                 "NOT SAFE TO DRINK",
    "HIGHLY_POLLUTED":       "NOT SAFE TO DRINK",
    "NO_WATER_DETECTED":     "N/A",
}


@pytest.fixture(scope="module")
def real_jpeg_bytes():
    path = "/tmp/river_water.jpg"
    with open(path, "rb") as f:
        return f.read()


# ─── Health ─────────────────────────────────────────────────────────────────
class TestHealth:
    def test_health_live_mode(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "healthy"
        assert d["service"] == "WaterTruth AI"
        assert d["database"] == "supabase", f"expected supabase, got {d['database']}"
        assert d["ai"] == "configured", f"expected configured, got {d['ai']}"
        assert d["model"] == "gpt-5.2"


# ─── Analyze (real GPT-5.2) ─────────────────────────────────────────────────
class TestAnalyze:
    def test_analyze_real_water_image(self, real_jpeg_bytes):
        files = {"file": ("river.jpg", real_jpeg_bytes, "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()

        # Schema
        for k in ["id", "visual_analysis", "classification", "drinkability",
                  "confidence", "recommendation", "warning", "created_at", "image_data"]:
            assert k in d, f"missing key {k}"

        va = d["visual_analysis"]
        for k in ["color", "clarity", "particles", "surface", "source_context"]:
            assert k in va and isinstance(va[k], str) and va[k]

        # Strict valid-value enforcement
        assert d["classification"] in VALID_CLASSIFICATIONS
        assert d["drinkability"] == DRINKABILITY_MAP[d["classification"]]
        assert d["confidence"].lower() in {"low", "medium", "high"}

        # CRITICAL: never declares SAFE
        assert "SAFE TO DRINK" != d["drinkability"]
        assert d["drinkability"] != "SAFE"
        # For CLEAN, must be UNCERTAIN (not SAFE)
        if d["classification"] == "CLEAN":
            assert "UNCERTAIN" in d["drinkability"]

        # Mandatory warning verbatim
        assert d["warning"] == MANDATORY_WARNING

        assert isinstance(d["image_data"], str) and len(d["image_data"]) > 100
        assert "T" in d["created_at"]

        pytest.last_id = d["id"]

    def test_analyze_rejects_non_image(self):
        files = {"file": ("foo.txt", b"plain text data", "text/plain")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400

    def test_analyze_rejects_empty_file(self):
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400

    def test_analyze_rejects_corrupted_image(self):
        files = {"file": ("bad.jpg", b"\x00\x01not-an-image\xff\xd8\xff", "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400


# ─── List + Get by id + Supabase persistence ───────────────────────────────
class TestAnalysesList:
    def test_list_analyses(self):
        r = requests.get(f"{API}/analyses?limit=5", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 1
        for it in arr:
            assert it.get("image_data") is None  # stripped from list
            assert it["warning"] == MANDATORY_WARNING
            assert it["classification"] in VALID_CLASSIFICATIONS
        ts = [it["created_at"] for it in arr]
        assert ts == sorted(ts, reverse=True)

    def test_get_by_id_includes_image(self):
        aid = getattr(pytest, "last_id", None)
        if not aid:
            pytest.skip("no analysis id from previous test")
        r = requests.get(f"{API}/analyses/{aid}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == aid
        assert isinstance(d["image_data"], str) and len(d["image_data"]) > 100

    def test_get_invalid_id_returns_404(self):
        r = requests.get(f"{API}/analyses/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404
