/**
 * Shared analyzeImage utility — used by BOTH the camera scanner and the
 * file-upload page. Single source of truth for the /api/analyze call.
 *
 * Usage:
 *   const result = await analyzeImage(fileOrBlob, { onProgress });
 *   // result matches the WaterTruth output contract exactly:
 *   // {
 *   //   system_check, id, visual_analysis {color,clarity,particles,surface,source_context},
 *   //   classification, drinkability, confidence, recommendation, warning,
 *   //   created_at, image_data
 *   // }
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const TIMEOUT_MS       = 60_000;   // GPT-5.2 vision can take ~5-15s
const SLOW_NETWORK_MS  = 8_000;    // "taking longer than usual..." threshold
const MAX_DIMENSION    = 1600;     // resize large images before upload
const JPEG_QUALITY     = 0.65;     // per spec Section 6

/** Convert a File/Blob to a resized, JPEG-compressed Blob. */
async function compressToJpeg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) { height = (height / width) * MAX_DIMENSION; width = MAX_DIMENSION; }
        else                { width  = (width  / height) * MAX_DIMENSION; height = MAX_DIMENSION; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(width);
      canvas.height = Math.round(height);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas compression failed'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/** Convert a base64 data URL or raw string → Blob. */
function base64ToBlob(base64, mime = 'image/jpeg') {
  const clean   = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary  = atob(clean);
  const buffer  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

/**
 * Main shared analysis function.
 * @param {File|Blob|string} input            File, Blob, or base64 string (with or without data URL prefix)
 * @param {{ onSlowNetwork?: () => void }} [options]
 * @returns {Promise<object>} WaterTruth AI analysis result
 */
export async function analyzeImage(input, options = {}) {
  // 1. Normalise to a Blob
  let blob;
  if (typeof input === 'string')          blob = base64ToBlob(input);
  else if (input instanceof Blob)         blob = input;
  else throw new Error('analyzeImage: input must be a File, Blob, or base64 string');

  // 2. Compress to JPEG quality 0.65 (per spec Section 6)
  const compressed = await compressToJpeg(blob);

  // 3. Build multipart form
  const form = new FormData();
  form.append('file', new File([compressed], 'water_sample.jpg', { type: 'image/jpeg' }));

  // 4. Slow-network watchdog
  const slowTimer = options.onSlowNetwork
    ? setTimeout(options.onSlowNetwork, SLOW_NETWORK_MS)
    : null;

  try {
    const res = await axios.post(`${API}/analyze`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT_MS,
    });
    return res.data;
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
  }
}

/**
 * Map server errors → friendly messages for the UI. (Spec Section 7.)
 */
export function friendlyAnalyzeError(err) {
  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'Analysis took too long. Please try again or check your connection.';
  }
  const status = err?.response?.status;
  if (status === 400) return err.response?.data?.detail || 'The image could not be read. Try a different photo.';
  if (status === 404) return 'Analysis service not found. Please try again.';
  if (status === 429) return 'Too many requests — please wait a moment before scanning again.';
  if (status && status >= 500) return 'Analysis service is temporarily unavailable. Please try again shortly.';
  if (!navigator.onLine)  return 'You appear to be offline. Reconnect and try again.';
  return 'Analysis failed. Please try again or upload an image manually.';
}
