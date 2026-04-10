import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, AlertCircle, CheckCircle, Loader2, Camera, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const QUALITY_THRESHOLDS = {
  BLUR_MIN: 20,
  BRIGHTNESS_MIN: 20,
  BRIGHTNESS_MAX: 245,
  AUTO_CAPTURE_QUALITY: 60,
  WATER_CONFIDENCE_MIN: 60,  // stricter threshold
};

// ─── Image compression ────────────────────────────────────────────────────────
const compressImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = (height / width) * maxDim; width = maxDim; }
        else { width = (width / height) * maxDim; height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('toBlob returned null')),
        'image/jpeg', 0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });

const vibrate = (p = [50]) => { if ('vibrate' in navigator) navigator.vibrate(p); };

// ─── RGB → HSV ────────────────────────────────────────────────────────────────
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// ─── WATER DETECTOR ───────────────────────────────────────────────────────────
/**
 * KEY FIX: The old isDarkMurky matched ANY grey surface (walls, cement, floors).
 *
 * The discriminator that actually separates water from non-water:
 *   → Water (even dirty/dark) has b >= r * 0.85  (cool or neutral tint)
 *   → Cement/concrete/walls always have b < r * 0.85  (warm grey tint)
 *
 * Water colour profiles supported:
 *   1. Blue ocean/pool/lake        — h:175-245, s:0.20-0.90
 *   2. Clear/tap water (blue-grey) — h:170-260, s:0.03-0.25, cool tint
 *   3. Brown/muddy river/nala      — h:10-45,   s:0.20-0.75, v:0.08-0.68
 *   4. Green stagnant/algae        — h:75-160,  s:0.12-0.58
 *   5. White foam / rapids         — s<0.12, v>0.82
 *   6. Dark flood/dirty water      — s<0.22, v<0.42, AND b >= r*0.85 (COOL tint only)
 *
 * Explicitly EXCLUDED:
 *   - Warm grey cement/concrete   b < r*0.88  ← THIS WAS THE BUG
 *   - Neutral grey walls/floors   b < r*0.90 with s<0.10
 *   - Skin tones
 *   - Vivid grass/plants
 *   - Bright warm red/orange/yellow
 */
function detectWater(imageData) {
  const { data, width, height } = imageData;
  const total = width * height;
  const step = 4;

  let waterPx = 0, excludedPx = 0, sampledPx = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const { h, s, v } = rgbToHsv(R, G, B);

    // ── THE KEY DISCRIMINATOR ────────────────────────────────────────────
    // Water has cool/neutral tint: blue channel is NOT much lower than red.
    // Cement walls/floors are WARM grey: blue is noticeably lower than red.
    const hasCoolTint = B >= R * 0.85;   // true for water, false for cement
    const hasWarmTint = B < R * 0.84;    // true for walls/floors/warm surfaces

    // ── Water colour ranges ──────────────────────────────────────────────

    // 1. Blue water — ocean, pool, lake, sky reflection
    const isBlueWater = h >= 175 && h <= 245 && s >= 0.20 && s <= 0.90 && v >= 0.10;

    // 2. Clear/tap water — blue-grey, low saturation, MUST have cool tint
    const isClearWater = h >= 170 && h <= 260 && s >= 0.03 && s <= 0.25
                      && v >= 0.20 && v <= 0.92 && hasCoolTint;

    // 3. Brown/muddy water — river, nala, flooded drain — requires real saturation
    const isBrownWater = h >= 10 && h <= 45 && s >= 0.22 && s <= 0.75
                      && v >= 0.08 && v <= 0.68;

    // 4. Green stagnant water — algae, pond, tank
    const isGreenWater = h >= 75 && h <= 160 && s >= 0.12 && s <= 0.58
                      && v >= 0.08 && v <= 0.68;

    // 5. White foam — rapids, churned water
    const isFoam = s < 0.12 && v > 0.82;

    // 6. Dark flood/dirty water — ONLY if cool tint (not warm grey!)
    //    This is what was matching walls before. Now gated by hasCoolTint.
    const isDarkWater = s < 0.22 && v >= 0.04 && v <= 0.42 && hasCoolTint;

    // ── EXCLUSIONS ───────────────────────────────────────────────────────

    // Cement, concrete, plaster walls — warm grey (B < R), low saturation
    const isCement = hasWarmTint && s < 0.20 && v >= 0.20 && v <= 0.80;

    // Neutral grey walls/floors with no cool tint
    const isNeutralWall = s < 0.10 && v >= 0.20 && v <= 0.82 && !hasCoolTint;

    // Skin tones — warm, medium saturation, medium-high value
    const isSkin = h >= 0 && h <= 32 && s >= 0.22 && s <= 0.78 && v >= 0.35;

    // Vivid grass / leaves / plants
    const isGrass = h >= 80 && h <= 150 && s >= 0.40 && v >= 0.18;

    // Bright warm red/orange (painted walls, objects)
    const isRedOrange = (h <= 15 || h >= 345) && s >= 0.40;

    // Bright yellow (not water)
    const isYellow = h >= 45 && h <= 75 && s >= 0.50 && v >= 0.58;

    // Beige/tan walls and floors
    const isBeige = h >= 22 && h <= 58 && s >= 0.08 && s <= 0.35
                  && v >= 0.40 && v <= 0.88 && hasWarmTint;

    const isWater = isBlueWater || isClearWater || isBrownWater
                  || isGreenWater || isFoam || isDarkWater;

    const isExcluded = isCement || isNeutralWall || isSkin
                     || isGrass || isRedOrange || isYellow || isBeige;

    sampledPx++;
    if (isWater && !isExcluded) waterPx++;
    else if (isExcluded)        excludedPx++;
  }

  const waterRatio   = waterPx    / sampledPx;
  const excludeRatio = excludedPx / sampledPx;

  // Hard gate: at least 20% of pixels must be water-coloured
  if (waterRatio < 0.20) {
    return { confidence: Math.min(40, waterRatio * 200), waterRatio };
  }

  const colourScore   = Math.min(100, (waterRatio / 0.45) * 100);
  const penaltyFactor = Math.max(0, 1 - excludeRatio * 3.0); // heavier penalty

  // ── Horizontal uniformity ─────────────────────────────────────────────
  const rowStep = Math.max(1, Math.floor(height / 20));
  const colStep = Math.max(1, Math.floor(width  / 40));
  let hUniform = 0, hTotal = 0;
  for (let y = rowStep; y < height - rowStep; y += rowStep) {
    const vals = [];
    for (let x = 0; x < width; x += colStep) {
      const idx = (y * width + x) * 4;
      vals.push(data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const vari = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    if (vari < 1000) hUniform++;
    hTotal++;
  }
  const horizontalScore = hTotal > 0 ? (hUniform / hTotal) * 100 : 0;

  // ── Texture score (water = low-medium Laplacian) ──────────────────────
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4)
    gray[i / 4] = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
  let lapSum = 0, lapCount = 0;
  for (let y = 1; y < height - 1; y += 2)
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      lapSum += Math.abs(4*gray[idx] - gray[idx-1] - gray[idx+1]
                        - gray[idx-width] - gray[idx+width]);
      lapCount++;
    }
  const avgLap = lapCount > 0 ? lapSum / lapCount : 0;
  // Water: Laplacian 1-35. Walls also have low Laplacian, so this isn't decisive alone.
  let textureScore = 0;
  if (avgLap >= 1  && avgLap <= 35) textureScore = 100;
  else if (avgLap > 35 && avgLap <= 65) textureScore = Math.max(0, 70 - (avgLap - 35) * 2);
  else if (avgLap < 1) textureScore = 20;

  const raw = (
    colourScore     * 0.60 +   // colour is the primary signal
    horizontalScore * 0.25 +
    textureScore    * 0.15
  ) * penaltyFactor;

  return {
    confidence: Math.min(100, Math.max(0, raw)),
    waterRatio,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef            = useRef(null);
  const canvasRef           = useRef(null);
  const streamRef           = useRef(null);
  const analyzerIntervalRef = useRef(null);
  const captureLockedRef    = useRef(false);

  const [cameraActive,     setCameraActive]     = useState(false);
  const [status,           setStatus]           = useState('initializing');
  const [analyzing,        setAnalyzing]        = useState(false);
  const [metrics,          setMetrics]          = useState({ quality: 0, blur: 0, brightness: 0, waterConfidence: 0 });
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [waterDetected,    setWaterDetected]    = useState(false);

  const updateStatus = useCallback((s) => setStatus(s), []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (analyzerIntervalRef.current) {
      clearInterval(analyzerIntervalRef.current);
      analyzerIntervalRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        captureLockedRef.current = false;
        setWaterDetected(false);
        updateStatus('detecting_water');
        setPermissionDenied(false);
        vibrate([50]);
      }
    } catch (err) {
      setPermissionDenied(true);
      updateStatus('error');
      toast.error('Camera access denied');
    }
  }, [updateStatus]);

  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!video.videoWidth) return null;

    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4)
      totalBrightness += data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
    const avgBrightness = totalBrightness / (data.length / 4);

    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4)
      gray[i/4] = data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
    let lapSum = 0;
    const w = canvas.width, h = canvas.height;
    for (let y = 1; y < h-1; y++)
      for (let x = 1; x < w-1; x++) {
        const idx = y*w+x;
        const lap = Math.abs(4*gray[idx]-gray[idx-1]-gray[idx+1]-gray[idx-w]-gray[idx+w]);
        lapSum += lap*lap;
      }
    const blurScore = Math.sqrt(lapSum / ((w-2)*(h-2)));

    const { confidence: waterConfidence } = detectWater(imageData);

    let qualityScore = 0;
    if (avgBrightness >= QUALITY_THRESHOLDS.BRIGHTNESS_MIN && avgBrightness <= QUALITY_THRESHOLDS.BRIGHTNESS_MAX) qualityScore += 35;
    else if (avgBrightness > 10 && avgBrightness < 250) qualityScore += 15;
    if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 2)        qualityScore += 30;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN)       qualityScore += 18;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 0.3) qualityScore += 6;

    // Water confidence gates quality completely
    if (waterConfidence >= 70)      qualityScore += 35;
    else if (waterConfidence >= 60) qualityScore += 25;
    else if (waterConfidence >= 45) qualityScore += 10;
    else                            qualityScore = Math.min(qualityScore, 15); // hard cap if no water

    return { quality: Math.min(100, qualityScore), blur: blurScore, brightness: avgBrightness, waterConfidence };
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (captureLockedRef.current || analyzing) return;
    captureLockedRef.current = true;

    const video = videoRef.current;
    if (!video || !video.videoWidth) { captureLockedRef.current = false; return; }

    setAnalyzing(true);
    updateStatus('analyzing');
    vibrate([50, 50, 50]);

    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopCamera();

    try {
      const rawBlob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('toBlob returned null')),
          'image/jpeg', 0.95
        )
      );
      const compressedBlob = await compressImage(rawBlob);
      const formData = new FormData();
      formData.append('file', new File([compressedBlob], 'water_scan.jpg', { type: 'image/jpeg' }));

      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      vibrate([200]);
      navigate(`/results/${response.data.id}`);
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || 'Unknown error';
      console.error('Analysis error:', msg, error);
      toast.error(`Analysis failed: ${msg}`);
      vibrate([200, 100, 200]);
      setAnalyzing(false);
      captureLockedRef.current = false;
      updateStatus('detecting_water');
      setWaterDetected(false);
      startCamera();
    }
  }, [analyzing, navigate, stopCamera, startCamera, updateStatus]);

  // Frame analysis loop
  useEffect(() => {
    if (!cameraActive || analyzing) {
      clearInterval(analyzerIntervalRef.current);
      analyzerIntervalRef.current = null;
      return;
    }

    analyzerIntervalRef.current = setInterval(() => {
      const m = analyzeFrame();
      if (!m) return;
      setMetrics(m);

      const hasWater = m.waterConfidence >= QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN;
      let newStatus;

      if (m.brightness < QUALITY_THRESHOLDS.BRIGHTNESS_MIN)      newStatus = 'too_dark';
      else if (m.brightness > QUALITY_THRESHOLDS.BRIGHTNESS_MAX) newStatus = 'too_bright';
      else if (m.blur < QUALITY_THRESHOLDS.BLUR_MIN * 0.3)       newStatus = 'too_blurry';
      else if (!hasWater)                                         newStatus = 'no_water';
      else if (m.quality < QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY) newStatus = 'stabilizing';
      else                                                        newStatus = 'optimal';

      setWaterDetected(hasWater);
      updateStatus(newStatus);

      if (newStatus === 'optimal' && !captureLockedRef.current) {
        captureLockedRef.current = true;
        vibrate([100]);
        setTimeout(() => captureAndAnalyze(), 600);
      }
    }, 400);

    return () => { clearInterval(analyzerIntervalRef.current); analyzerIntervalRef.current = null; };
  }, [cameraActive, analyzing, analyzeFrame, updateStatus, captureAndAnalyze]);

  useEffect(() => { startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);

  const getStatusMessage = () => {
    switch (status) {
      case 'initializing':    return 'Initializing camera...';
      case 'no_water':        return 'No water detected — aim at water';
      case 'detecting_water': return 'Point camera at water surface';
      case 'too_blurry':      return 'Hold camera steady...';
      case 'too_dark':        return 'Need more light...';
      case 'too_bright':      return 'Too bright, adjust angle...';
      case 'stabilizing':     return 'Water found! Hold steady...';
      case 'optimal':         return 'Water confirmed — capturing!';
      case 'analyzing':       return 'Analyzing water sample...';
      case 'error':           return 'Camera access required';
      default:                return 'Point camera at water surface';
    }
  };

  const getStatusIcon = () => {
    if (status === 'analyzing')   return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" strokeWidth={1.5} />;
    if (status === 'optimal')     return <CheckCircle className="w-6 h-6 text-green-400" strokeWidth={1.5} />;
    if (status === 'stabilizing') return <Droplets className="w-6 h-6 text-blue-400 animate-pulse" strokeWidth={1.5} />;
    if (status === 'no_water')    return <X className="w-6 h-6 text-red-400" strokeWidth={2} />;
    if (status === 'error')       return <AlertCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />;
    return <Droplets className="w-6 h-6 text-white/60" strokeWidth={1.5} />;
  };

  const frameColor  = waterDetected ? (status === 'optimal' ? 'border-green-400' : 'border-blue-400') : 'border-red-400/50';
  const cornerColor = waterDetected ? (status === 'optimal' ? 'border-green-400' : 'border-blue-400') : 'border-white/25';

  if (permissionDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md text-center space-y-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" strokeWidth={1.5} />
          <div>
            <h2 className="text-2xl font-bold mb-2">Camera Access Required</h2>
            <p className="text-muted-foreground">Enable camera permissions and refresh.</p>
          </div>
          <button onClick={() => window.location.reload()}
            className="w-full bg-primary text-primary-foreground h-12 rounded-full font-medium">
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <video ref={videoRef} autoPlay playsInline muted
        className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 pointer-events-none">

        {/* ── Top bar ── */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-white" strokeWidth={1.5} />
              <span className="text-white font-semibold text-sm">WaterTruth AI</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md border transition-all duration-300
                ${waterDetected
                  ? 'bg-green-500/25 text-green-300 border-green-500/50'
                  : 'bg-red-500/20  text-red-300   border-red-500/40'}`}>
                {waterDetected ? '💧 Water Detected' : '❌ No Water'}
              </div>
              <div className="px-2 py-1 bg-white/15 backdrop-blur-md rounded-full text-white/70 text-xs">
                Water: {Math.round(metrics.waterConfidence)}%
              </div>
            </div>
          </div>
        </div>

        {/* ── Scanning frame ── */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-72 h-72">
            <div className={`absolute inset-0 border-2 rounded-3xl transition-colors duration-300 ${frameColor}`}>
              <div className={`absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl transition-colors duration-300 ${cornerColor}`} />
              <div className={`absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl transition-colors duration-300 ${cornerColor}`} />
              <div className={`absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl transition-colors duration-300 ${cornerColor}`} />
              <div className={`absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl transition-colors duration-300 ${cornerColor}`} />
            </div>

            {/* Scan line — water found, stabilizing */}
            {waterDetected && status === 'stabilizing' && (
              <motion.div
                className="absolute left-0 right-0 border-t-2 border-blue-400/80"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
            )}

            {/* Green pulse — ready to capture */}
            {status === 'optimal' && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                <div className="p-4 bg-green-500/30 rounded-full">
                  <Droplets className="w-10 h-10 text-green-400" strokeWidth={1.5} />
                </div>
              </motion.div>
            )}

            {/* Red X — no water */}
            {status === 'no_water' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-4 bg-red-500/15 rounded-full">
                  <X className="w-10 h-10 text-red-400/80" strokeWidth={2} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Water type hint chips ── */}
        {(status === 'no_water' || status === 'detecting_water') && !analyzing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute left-0 right-0 flex justify-center"
            style={{ top: 'calc(50% + 158px)' }}
          >
            <div className="flex gap-2 flex-wrap justify-center px-8 max-w-xs">
              {['🚰 Tap', '🌊 Ocean', '🏞️ River', '💧 Nala', '🪣 Bucket', '🟤 Muddy'].map(label => (
                <span key={label}
                  className="px-2 py-1 bg-white/10 backdrop-blur-md rounded-full text-white/60 text-xs border border-white/10">
                  {label}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Bottom controls ── */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="text-center space-y-2"
            >
              <div className="flex items-center justify-center gap-3">
                {getStatusIcon()}
                <span className="text-white text-base font-medium">{getStatusMessage()}</span>
              </div>

              {analyzing && (
                <div className="flex justify-center gap-2 mt-1">
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${d}s` }} />
                  ))}
                </div>
              )}

              {!analyzing && (
                <p className="text-white/55 text-xs max-w-xs mx-auto leading-relaxed">
                  {status === 'no_water'        && 'Aim at any water — tap, river, ocean, nala, muddy or dirty'}
                  {status === 'detecting_water' && 'Point directly at any water surface'}
                  {status === 'stabilizing'     && 'Water detected! Hold steady to capture...'}
                  {status === 'optimal'         && 'Real water confirmed — auto-capturing now!'}
                  {status === 'too_blurry'      && 'Hold camera steady'}
                  {status === 'too_dark'        && 'Move to better lighting'}
                  {status === 'too_bright'      && 'Adjust camera angle'}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Capture button */}
          {cameraActive && !analyzing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-auto flex flex-col items-center gap-2 mt-5"
            >
              <button
                onClick={() => {
                  if (!waterDetected) {
                    toast.warning('No water in frame — aim camera at water first');
                    vibrate([100, 50, 100]);
                    return;
                  }
                  captureAndAnalyze();
                }}
                className={`flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-sm
                  shadow-2xl transition-all duration-200 active:scale-95
                  ${waterDetected
                    ? 'bg-blue-500 text-white shadow-blue-500/40 hover:bg-blue-400'
                    : 'bg-white/12 text-white/35 border border-white/15 cursor-not-allowed'}`}
              >
                <Camera className="w-4 h-4" />
                {waterDetected ? 'Capture Water' : 'Aim at Water First'}
              </button>
              {!waterDetected && (
                <p className="text-red-400/65 text-xs">Button activates when real water is in frame</p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
