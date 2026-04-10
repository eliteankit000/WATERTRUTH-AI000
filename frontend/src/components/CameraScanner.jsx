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
  AUTO_CAPTURE_QUALITY: 55,   // raised — only capture when confident
  WATER_CONFIDENCE_MIN: 50,   // raised from 20 → must actually look like water
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

// ─── REAL WATER DETECTOR ──────────────────────────────────────────────────────
/**
 * Detects ALL water types: clear tap, ocean, river, nala, muddy, stagnant, flood.
 * Returns confidence 0-100.
 *
 * Signals used:
 *  1. Water-colour pixels  (blue/teal/brown/grey/dark/murky/foam)
 *  2. Non-water exclusion  (skin, vivid grass, vivid red, bright yellow)
 *  3. Horizontal uniformity (water surfaces are horizontally consistent)
 *  4. Texture check         (water has low-medium texture, not cloth/grass)
 */
function detectWater(imageData) {
  const { data, width, height } = imageData;
  const total = width * height;
  const step  = 4; // sample every 4th pixel

  let waterPixels = 0, nonWaterPixels = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, v } = rgbToHsv(r, g, b);

    // ── Water colour ranges ──────────────────────────────────────────────
    const isClearWater  = s < 0.35 && v > 0.2  && v < 0.95 && h >= 170 && h <= 260;   // tap/clear
    const isBlueWater   = h >= 175 && h <= 255  && s >= 0.15 && s <= 0.85 && v > 0.15; // ocean/pool
    const isBrownWater  = h >= 10  && h <= 50   && s >= 0.15 && s <= 0.75 && v >= 0.1 && v <= 0.75; // river/nala
    const isDarkMurky   = s < 0.25 && v < 0.55  && v > 0.05;                           // dirty/flood
    const isGreenWater  = h >= 60  && h <= 160  && s >= 0.1  && s <= 0.6  && v >= 0.1 && v <= 0.7;  // stagnant/algae
    const isFoam        = s < 0.15 && v > 0.75;                                        // rapids/foam

    // ── Non-water exclusions ─────────────────────────────────────────────
    const isSkin        = h >= 0   && h <= 30   && s >= 0.25 && s <= 0.75 && v >= 0.4;  // skin tones
    const isGrass       = h >= 80  && h <= 150  && s >= 0.35 && v >= 0.2;               // grass/plants
    const isVividRed    = (h <= 10 || h >= 340) && s >= 0.4;                            // red walls/objects
    const isYellow      = h >= 45  && h <= 75   && s >= 0.5  && v >= 0.6;               // bright yellow

    const isWater    = isClearWater || isBlueWater || isBrownWater ||
                       isDarkMurky  || isGreenWater || isFoam;
    const isNotWater = isSkin || isGrass || isVividRed || isYellow;

    if (isWater && !isNotWater) waterPixels++;
    else if (isNotWater) nonWaterPixels++;
  }

  const sampled     = Math.floor(total / step);
  const waterRatio  = waterPixels    / sampled;
  const badRatio    = nonWaterPixels / sampled;

  // Need ≥25% water-coloured pixels to consider it water
  const colourScore   = Math.min(100, (waterRatio / 0.40) * 100);
  const penaltyFactor = Math.max(0, 1 - badRatio * 2.5);

  // ── Horizontal uniformity ─────────────────────────────────────────────
  const rowStep  = Math.max(1, Math.floor(height / 20));
  const colStep  = Math.max(1, Math.floor(width  / 40));
  let hUniform = 0, hTotal = 0;

  for (let y = rowStep; y < height - rowStep; y += rowStep) {
    const vals = [];
    for (let x = 0; x < width; x += colStep) {
      const idx = (y * width + x) * 4;
      vals.push(data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const vari = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    if (vari < 1200) hUniform++;
    hTotal++;
  }
  const horizontalScore = hTotal > 0 ? (hUniform / hTotal) * 100 : 0;

  // ── Texture complexity ────────────────────────────────────────────────
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4)
    gray[i / 4] = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;

  let lapSum = 0, lapCount = 0;
  for (let y = 1; y < height - 1; y += 2)
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      lapSum += Math.abs(4*gray[idx] - gray[idx-1] - gray[idx+1] - gray[idx-width] - gray[idx+width]);
      lapCount++;
    }
  const avgLap = lapCount > 0 ? lapSum / lapCount : 0;
  let textureScore = 0;
  if (avgLap >= 2  && avgLap <= 40)  textureScore = 100;
  else if (avgLap > 40 && avgLap <= 70) textureScore = Math.max(0, 60 - (avgLap - 40));
  else if (avgLap < 2)               textureScore = avgLap * 30;

  // ── Final score ───────────────────────────────────────────────────────
  const raw = (
    colourScore     * 0.55 +
    horizontalScore * 0.25 +
    textureScore    * 0.20
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
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (analyzerIntervalRef.current) { clearInterval(analyzerIntervalRef.current); analyzerIntervalRef.current = null; }
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
      totalBrightness += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    const avgBrightness = totalBrightness / (data.length / 4);

    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4)
      gray[i/4] = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
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
    if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 2)       qualityScore += 30;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN)      qualityScore += 18;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 0.3)qualityScore += 6;
    // Water confidence is the gate — if no water, quality stays low regardless
    if (waterConfidence >= 60)      qualityScore += 35;
    else if (waterConfidence >= 50) qualityScore += 25;
    else if (waterConfidence >= 35) qualityScore += 10;
    else                            qualityScore  = Math.min(qualityScore, 20); // cap low if no water

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

      let newStatus;
      const hasWater = m.waterConfidence >= QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN;

      if (m.brightness < QUALITY_THRESHOLDS.BRIGHTNESS_MIN)      newStatus = 'too_dark';
      else if (m.brightness > QUALITY_THRESHOLDS.BRIGHTNESS_MAX) newStatus = 'too_bright';
      else if (m.blur < QUALITY_THRESHOLDS.BLUR_MIN * 0.3)       newStatus = 'too_blurry';
      else if (!hasWater)                                         newStatus = 'no_water';
      else if (m.quality < QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY) newStatus = 'stabilizing';
      else                                                        newStatus = 'optimal';

      setWaterDetected(hasWater);
      updateStatus(newStatus);

      // Auto-capture ONLY when water is confirmed
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
    if (status === 'analyzing')  return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" strokeWidth={1.5} />;
    if (status === 'optimal')    return <CheckCircle className="w-6 h-6 text-green-400" strokeWidth={1.5} />;
    if (status === 'stabilizing')return <Droplets className="w-6 h-6 text-blue-400 animate-pulse" strokeWidth={1.5} />;
    if (status === 'no_water')   return <X className="w-6 h-6 text-red-400" strokeWidth={2} />;
    if (status === 'error')      return <AlertCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />;
    return <Droplets className="w-6 h-6 text-white/60" strokeWidth={1.5} />;
  };

  const frameColor  = waterDetected ? (status === 'optimal' ? 'border-green-400' : 'border-blue-400') : 'border-red-400/50';
  const cornerColor = waterDetected ? (status === 'optimal' ? 'border-green-400' : 'border-blue-400') : 'border-white/30';

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
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
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
              <div className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md border
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

            {/* Scan line — only when water confirmed */}
            {waterDetected && status === 'stabilizing' && (
              <motion.div
                className="absolute left-0 right-0 border-t-2 border-blue-400/80"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
            )}

            {/* Green check pulse on optimal */}
            {status === 'optimal' && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                <div className="p-4 bg-green-500/30 rounded-full">
                  <Droplets className="w-10 h-10 text-green-400" strokeWidth={1.5} />
                </div>
              </motion.div>
            )}

            {/* Red X when no water */}
            {status === 'no_water' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-4 bg-red-500/20 rounded-full">
                  <X className="w-10 h-10 text-red-400/80" strokeWidth={2} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Water type chips — shown when not yet detected ── */}
        {(status === 'no_water' || status === 'detecting_water') && !analyzing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute left-0 right-0 flex justify-center"
            style={{ top: 'calc(50% + 160px)' }}
          >
            <div className="flex gap-2 flex-wrap justify-center px-8 max-w-xs">
              {['🚰 Tap', '🌊 Ocean', '🏞️ River', '💧 Nala', '🪣 Bucket', '🟤 Muddy'].map(label => (
                <span key={label}
                  className="px-2 py-1 bg-white/10 backdrop-blur-md rounded-full text-white/65 text-xs border border-white/10">
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
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
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
                  {status === 'no_water'     && 'Aim at any water — tap, river, ocean, nala, muddy or dirty'}
                  {status === 'detecting_water' && 'Point directly at any water surface'}
                  {status === 'stabilizing'  && 'Water found! Hold steady for capture...'}
                  {status === 'optimal'      && 'Auto-capturing confirmed water now...'}
                  {status === 'too_blurry'   && 'Hold camera steady'}
                  {status === 'too_dark'     && 'Move to better lighting'}
                  {status === 'too_bright'   && 'Adjust camera angle'}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Capture button — disabled style if no water */}
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
                className={`flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-sm shadow-2xl
                  transition-all duration-200 active:scale-95
                  ${waterDetected
                    ? 'bg-blue-500 text-white shadow-blue-500/40 hover:bg-blue-400'
                    : 'bg-white/15 text-white/40 border border-white/20'}`}
              >
                <Camera className="w-4 h-4" />
                {waterDetected ? 'Capture Water' : 'Aim at Water First'}
              </button>
              {!waterDetected && (
                <p className="text-red-400/70 text-xs">Button activates when water is in frame</p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
