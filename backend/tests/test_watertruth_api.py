"""WaterTruth AI backend API tests — fallback mode (no OpenAI, no DATABASE_URL)."""
import io
import os
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to reading from frontend .env so tests work when run locally
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

DRINKABILITY_MAP = {
    "CLEAN": "UNCERTAIN — VISUAL ONLY",
    "SLIGHTLY_CONTAMINATED": "UNCERTAIN — TESTING REQUIRED",
    "DIRTY": "NOT SAFE TO DRINK",
    "HIGHLY_POLLUTED": "NOT SAFE TO DRINK",
    "NO_WATER_DETECTED": "N/A",
}


def _make_jpeg_bytes(w=320, h=240) -> bytes:
    """Create a non-uniform JPEG with real visual features."""
    img = Image.new("RGB", (w, h), (80, 140, 200))
    d = ImageDraw.Draw(img)
    # Add shapes/edges/texture
    d.rectangle([20, 20, 120, 120], fill=(50, 90, 150), outline=(0, 0, 0), width=3)
    d.ellipse([150, 50, 280, 180], fill=(200, 220, 240), outline=(30, 30, 30), width=2)
    d.line([(0, 0), (w, h)], fill=(255, 255, 255), width=2)
    d.line([(0, h), (w, 0)], fill=(10, 10, 10), width=2)
    for i in range(0, w, 20):
        d.line([(i, 0), (i, h)], fill=(120, 160, 210), width=1)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@pytest.fixture(scope="module")
def jpeg_bytes():
    return _make_jpeg_bytes()


# ─── Health ──────────────────────────────────────────────────────────────────
class TestHealth:
    def test_health_returns_fallback_state(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "healthy"
        assert d["service"] == "WaterTruth AI"
        assert d["database"] == "in-memory (fallback)"
        assert d["ai"] == "not configured (fallback)"
        assert d["model"] == "n/a"
        assert "memory_store_count" in d


# ─── Analyze: happy path in fallback mode ────────────────────────────────────
class TestAnalyze:
    def test_analyze_valid_jpeg_returns_strict_schema(self, jpeg_bytes):
        files = {"file": ("sample.jpg", jpeg_bytes, "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()

        # Top-level keys
        for k in ["id", "visual_analysis", "classification", "drinkability",
                  "confidence", "recommendation", "warning", "created_at", "image_data"]:
            assert k in d, f"missing key {k}"

        # visual_analysis sub-keys
        va = d["visual_analysis"]
        for k in ["color", "clarity", "particles", "surface", "source_context"]:
            assert k in va and isinstance(va[k], str) and va[k]

        # In fallback: classification=NO_WATER_DETECTED, drinkability=N/A, confidence=LOW
        assert d["classification"] == "NO_WATER_DETECTED"
        assert d["drinkability"] == "N/A"
        assert d["confidence"] == "LOW"
        assert "OPENAI_API_KEY" in d["recommendation"] or "OpenAI" in d["recommendation"]

        # Mandatory warning verbatim
        assert d["warning"] == MANDATORY_WARNING

        # image_data is base64 & created_at is ISO string
        assert isinstance(d["image_data"], str) and len(d["image_data"]) > 100
        assert isinstance(d["created_at"], str)
        assert "T" in d["created_at"]  # ISO 8601

        # Stash for downstream tests
        pytest.last_analysis_id = d["id"]
        pytest.last_analysis = d

    def test_analyze_rejects_non_image(self):
        files = {"file": ("foo.txt", b"plain text data", "text/plain")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400, r.text

    def test_analyze_rejects_empty_file(self):
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400, r.text

    def test_analyze_rejects_corrupted_image(self):
        files = {"file": ("bad.jpg", b"\x00\x01not-an-image\xff\xd8\xff", "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=15)
        assert r.status_code == 400, r.text

    def test_drinkability_matches_classification(self, jpeg_bytes):
        """Fallback always yields NO_WATER_DETECTED, so drinkability must be N/A."""
        files = {"file": ("x.jpg", jpeg_bytes, "image/jpeg")}
        r = requests.post(f"{API}/analyze", files=files, timeout=45)
        assert r.status_code == 200
        d = r.json()
        assert DRINKABILITY_MAP[d["classification"]] == d["drinkability"]
        assert d["warning"] == MANDATORY_WARNING


# ─── List + Get by id ───────────────────────────────────────────────────────
class TestAnalysesList:
    def test_list_analyses_limit_5(self, jpeg_bytes):
        # Ensure at least 1 exists
        requests.post(f"{API}/analyze",
                      files={"file": ("s.jpg", jpeg_bytes, "image/jpeg")}, timeout=45)

        r = requests.get(f"{API}/analyses?limit=5", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 1
        assert len(arr) <= 5

        # No image_data in list responses
        for it in arr:
            assert it.get("image_data") is None
            assert it["warning"] == MANDATORY_WARNING
            assert it["classification"] in DRINKABILITY_MAP

        # Sorted newest first
        ts = [it["created_at"] for it in arr]
        assert ts == sorted(ts, reverse=True)

    def test_get_analysis_by_id_includes_image(self, jpeg_bytes):
        files = {"file": ("s2.jpg", jpeg_bytes, "image/jpeg")}
        created = requests.post(f"{API}/analyze", files=files, timeout=45).json()
        aid = created["id"]

        r = requests.get(f"{API}/analyses/{aid}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == aid
        assert isinstance(d["image_data"], str) and len(d["image_data"]) > 100
        assert d["warning"] == MANDATORY_WARNING

    def test_get_analysis_invalid_id_returns_404(self):
        r = requests.get(f"{API}/analyses/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404
