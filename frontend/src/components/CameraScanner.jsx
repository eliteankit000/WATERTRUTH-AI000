import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Loader2, Camera, X, Droplets, FlaskConical, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const THRESHOLDS = {
  BLUR_MIN:             20,
  BRIGHTNESS_MIN:       15,
  BRIGHTNESS_MAX:      248,
  AUTO_CAPTURE_QUALITY: 52,          // slightly more forgiving (was 60)
  WATER_CONFIDENCE_MIN: 42,
  STABLE_TICKS_REQUIRED: 2,          // must stay 'optimal' for N consecutive ticks (~900ms)
  HINT_AFTER_MS:       6_000,        // show manual-capture hint after 6s of stabilising
};

// ── RGB → HSV ────────────────────────────────────────────────────────────────
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

// ── Water detector (reused proven logic from previous version) ────────────────
function detectWater(imageData) {
  const { data, width, height } = imageData;
  const step = 4;
  let waterPx = 0, excludedPx = 0, sampledPx = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const { h, s, v } = rgbToHsv(R, G, B);
    const hasCoolTint    = B >= R * 0.82;
    const hasWarmTint    = B <  R * 0.82;
    const hasAnyBlueCast = B >= R * 0.55;

    const isBottledWater = s <= 0.28 && v >= 0.25 && v <= 0.95 && h >= 10 && h <= 220 && hasAnyBlueCast;
    const isTapWater     = s <= 0.20 && v >= 0.30 && v <= 0.95 && (hasCoolTint || s < 0.08);
    const isBlueWater    = h >= 170 && h <= 250 && s >= 0.18 && v >= 0.08;
    const isBrownWater   = h >= 8   && h <= 48  && s >= 0.06 && s <= 0.78 && v >= 0.06 && v <= 0.72;
    const isGreenWater   = h >= 72  && h <= 165 && s >= 0.10 && s <= 0.62 && v >= 0.06 && v <= 0.72;
    const isFoam         = s < 0.14 && v > 0.80;
    const isDarkWater    = s < 0.25 && v >= 0.03 && v <= 0.40 && hasAnyBlueCast;
    const isTurbidWater  = s <= 0.16 && v >= 0.55 && v <= 0.96 && hasCoolTint;

    const isCement      = hasWarmTint && s >= 0.04 && s <= 0.20 && v >= 0.22 && v <= 0.82 && B < R * 0.78;
    const isBeige       = h >= 20 && h <= 58 && s >= 0.18 && s <= 0.42 && v >= 0.38 && v <= 0.90 && hasWarmTint && B < R * 0.72;
    const isWood        = h >= 15 && h <= 42 && s >= 0.30 && s <= 0.85 && v >= 0.15 && v <= 0.72 && B < R * 0.62;
    const isNeutralWall = s >= 0.06 && s <= 0.18 && v >= 0.25 && v <= 0.85 && !hasCoolTint && B < R * 0.76;
    const isSkin        = h <= 30 && s >= 0.22 && s <= 0.80 && v >= 0.35 && B < R * 0.72;
    const isGrass       = h >= 78 && h <= 152 && s >= 0.38 && v >= 0.18;
    const isRedOrange   = (h <= 12 || h >= 348) && s >= 0.40;
    const isYellow      = h >= 45 && h <= 72 && s >= 0.52 && v >= 0.60;

    const isWater    = isBottledWater || isTapWater || isBlueWater || isBrownWater ||
                       isGreenWater   || isFoam     || isDarkWater || isTurbidWater;
    const isExcluded = isCement || isBeige || isWood || isNeutralWall || isSkin || isGrass || isRedOrange || isYellow;

    sampledPx++;
    if (isWater && !isExcluded) waterPx++;
    else if (isExcluded)        excludedPx++;
  }

  const waterRatio   = waterPx / sampledPx;
  const excludeRatio = excludedPx / sampledPx;
  if (waterRatio < 0.15) return { confidence: Math.min(38, waterRatio * 250), waterRatio };

  const colourScore   = Math.min(100, (waterRatio / 0.40) * 100);
  const penaltyFactor = Math.max(0, 1 - excludeRatio * 2.5);

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
    const vari = vals.reduce((a, v2) => a + (v2 - mean) ** 2, 0) / vals.length;
    if (vari < 1200) hUniform++;
    hTotal++;
  }
  const horizontalScore = hTotal > 0 ? (hUniform / hTotal) * 100 : 0;

  return {
    confidence: Math.min(100, Math.max(0, (colourScore * 0.65 + horizontalScore * 0.35) * penaltyFactor)),
    waterRatio,
  };
}

const compressImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maxDim = 1600;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = (height / width) * maxDim; width = maxDim; }
        else { width = (width / height) * maxDim; height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(width);
      canvas.height = Math.round(height);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });

const vibrate = (p = [50]) => { if ('vibrate' in navigator) navigator.vibrate(p); };

export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef            = useRef(null);
  const canvasRef           = useRef(null);
  const streamRef           = useRef(null);
  const analyzerIntervalRef = useRef(null);
  const captureLockedRef    = useRef(false);
  const optimalStreakRef    = useRef(0);      // consecutive 'optimal' ticks
  const scanStartRef        = useRef(Date.now());

  const [cameraActive,     setCameraActive]     = useState(false);
  const [status,           setStatus]           = useState('initializing');
  const [analyzing,        setAnalyzing]        = useState(false);
  const [metrics,          setMetrics]          = useState({ quality: 0, blur: 0, brightness: 0, waterConfidence: 0 });
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [waterDetected,    setWaterDetected]    = useState(false);
  const [showManualHint,   setShowManualHint]   = useState(false);

  const updateStatus = useCallback((s) => setStatus(s), []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (analyzerIntervalRef.current) { clearInterval(analyzerIntervalRef.current); analyzerIntervalRef.current = null; }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    } catch {
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
    if (avgBrightness >= THRESHOLDS.BRIGHTNESS_MIN && avgBrightness <= THRESHOLDS.BRIGHTNESS_MAX) qualityScore += 35;
    else if (avgBrightness > 8 && avgBrightness < 252) qualityScore += 15;

    if      (blurScore > THRESHOLDS.BLUR_MIN * 2)       qualityScore += 30;
    else if (blurScore > THRESHOLDS.BLUR_MIN)           qualityScore += 18;
    else if (blurScore > THRESHOLDS.BLUR_MIN * 0.3)     qualityScore += 6;

    if      (waterConfidence >= 65) qualityScore += 35;
    else if (waterConfidence >= 50) qualityScore += 28;
    else if (waterConfidence >= 42) qualityScore += 18;
    else if (waterConfidence >= 30) qualityScore += 8;
    else                            qualityScore  = Math.min(qualityScore, 18);

    return {
      quality: Math.min(100, qualityScore),
      blur: blurScore,
      brightness: avgBrightness,
      waterConfidence,
    };
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
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/jpeg', 0.95)
      );
      const compressedBlob = await compressImage(rawBlob);
      const formData = new FormData();
      formData.append('file', new File([compressedBlob], 'water_scan.jpg', { type: 'image/jpeg' }));

      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
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
      const hasWater = m.waterConfidence >= THRESHOLDS.WATER_CONFIDENCE_MIN;
      let newStatus;
      if      (m.brightness < THRESHOLDS.BRIGHTNESS_MIN)      newStatus = 'too_dark';
      else if (m.brightness > THRESHOLDS.BRIGHTNESS_MAX)      newStatus = 'too_bright';
      else if (m.blur       < THRESHOLDS.BLUR_MIN * 0.3)      newStatus = 'too_blurry';
      else if (!hasWater)                                      newStatus = 'no_water';
      else if (m.quality    < THRESHOLDS.AUTO_CAPTURE_QUALITY) newStatus = 'stabilizing';
      else                                                     newStatus = 'optimal';
      setWaterDetected(hasWater);
      updateStatus(newStatus);

      // Track consecutive optimal frames
      if (newStatus === 'optimal') optimalStreakRef.current += 1;
      else                          optimalStreakRef.current = 0;

      // After HINT_AFTER_MS of stabilising with water detected but no capture → show manual hint
      if (!showManualHint &&
          hasWater &&
          !captureLockedRef.current &&
          Date.now() - scanStartRef.current > THRESHOLDS.HINT_AFTER_MS) {
        setShowManualHint(true);
      }

      // FIX: do NOT pre-lock here. Let captureAndAnalyze self-lock once it actually runs.
      // Only fire when streak is reached AND nothing is already in-flight.
      if (
        optimalStreakRef.current >= THRESHOLDS.STABLE_TICKS_REQUIRED &&
        !captureLockedRef.current &&
        !analyzing
      ) {
        vibrate([100]);
        captureAndAnalyze();   // self-locks via its internal guard
      }
    }, 450);
    return () => { clearInterval(analyzerIntervalRef.current); analyzerIntervalRef.current = null; };
  }, [cameraActive, analyzing, analyzeFrame, updateStatus, captureAndAnalyze, showManualHint]);

  useEffect(() => { startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);

  // Spec §1: pause camera when tab is hidden, resume on return
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        stopCamera();
      } else if (!captureLockedRef.current && !analyzing) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [startCamera, stopCamera, analyzing]);

  const statusText = {
    initializing:    'INITIALISING SENSOR…',
    detecting_water: 'ALIGN FRAME · AWAITING WATER',
    no_water:       'NO WATER · POINT AT SOURCE',
    too_blurry:     'HOLD STEADY · MOTION DETECTED',
    too_dark:       'LOW LIGHT · INCREASE EXPOSURE',
    too_bright:     'OVER-EXPOSED · ADJUST ANGLE',
    stabilizing:    'WATER LOCKED · STABILISING…',
    optimal:        'FRAME OPTIMAL · CAPTURING',
    analyzing:      'TRANSMITTING TO GPT-5.2…',
    error:          'CAMERA ACCESS REQUIRED',
  };

  const ringColor = status === 'optimal' ? 'border-sky-400'
                  : waterDetected ? 'border-amber-400'
                  : 'border-red-500/60';

  if (permissionDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <div className="max-w-md bg-white border border-zinc-200 p-8 text-center space-y-5 rounded-sm">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" strokeWidth={1.75} />
          <div>
            <h2 className="font-display text-2xl font-semibold mb-2">Camera Access Required</h2>
            <p className="text-zinc-600 text-sm">Enable camera permissions in your browser and refresh.</p>
          </div>
          <button
            data-testid="cancel-scan-button"
            onClick={() => navigate('/')}
            className="w-full bg-zinc-950 text-white h-11 rounded-sm font-medium"
          >
            Return home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Top HUD ───────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/85 to-transparent pb-10 pt-3 px-4 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            data-testid="cancel-scan-button"
            onClick={() => { stopCamera(); navigate('/'); }}
            className="flex items-center gap-2 text-white/90 hover:text-white text-sm"
          >
            <X className="w-4 h-4" /> CANCEL
          </button>
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-white/80">
            <FlaskConical className="w-3.5 h-3.5 text-sky-300" />
            WATERTRUTH · SCAN MODE
          </div>
          <div className={`px-2 py-1 font-mono text-[10px] tracking-widest border ${
            waterDetected ? 'border-sky-400/60 text-sky-200 bg-sky-500/10'
                          : 'border-red-400/60 text-red-200 bg-red-500/10'
          }`}>
            {waterDetected ? 'WATER · DETECTED' : 'NO WATER'}
          </div>
        </div>
      </div>

      {/* ── Live metrics strip ────────────────────────────────────── */}
      <div className="absolute top-14 left-0 right-0 z-10 px-4">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2 font-mono text-[10px] tracking-[0.18em] text-white/80">
          {[
            ['QUALITY',    `${Math.round(metrics.quality)}`],
            ['WATER·CONF', `${Math.round(metrics.waterConfidence)}%`],
            ['BRIGHTNESS', `${Math.round(metrics.brightness)}`],
          ].map(([k, v]) => (
            <div key={k} className="bg-black/50 backdrop-blur-sm border border-white/10 px-2 py-1.5 flex justify-between">
              <span>{k}</span><span className="text-white">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scanning frame ────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`relative w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] border ${ringColor} transition-colors duration-300`}>
          {/* Corner brackets */}
          {[
            'top-0 left-0 border-t-2 border-l-2',
            'top-0 right-0 border-t-2 border-r-2',
            'bottom-0 left-0 border-b-2 border-l-2',
            'bottom-0 right-0 border-b-2 border-r-2',
          ].map((p, i) => (
            <div key={i} className={`absolute ${p} w-8 h-8 ${ringColor}`} />
          ))}

          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-px bg-white/40" />
            <div className="absolute w-px h-4 bg-white/40" />
          </div>

          {/* Scan line when stabilizing */}
          {waterDetected && status === 'stabilizing' && (
            <div className="absolute left-0 right-0 h-[2px] bg-sky-400/80 wt-scan-line shadow-[0_0_10px_2px_rgba(56,189,248,0.6)]" />
          )}

          {/* Capture pulse */}
          {status === 'optimal' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="w-16 h-16 bg-sky-500/25 border border-sky-400 rounded-full wt-pulse-ring flex items-center justify-center">
                <Droplets className="w-7 h-7 text-sky-300" />
              </div>
            </motion.div>
          )}

          {/* No-water cross */}
          {status === 'no_water' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="p-3 bg-red-500/15 border border-red-400/40">
                <X className="w-8 h-8 text-red-400" strokeWidth={2} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom HUD ────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/85 to-transparent pt-10 pb-6 px-4 z-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 justify-center mb-4">
            {analyzing ? <Loader2 className="w-4 h-4 text-sky-300 animate-spin" />
              : status === 'optimal' ? <CheckCircle className="w-4 h-4 text-sky-300" />
              : <Droplets className="w-4 h-4 text-white/70" />}
            <AnimatePresence mode="wait">
              <motion.span
                key={status}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="font-mono text-xs tracking-[0.22em] text-white/90"
              >
                {statusText[status] || 'AWAITING…'}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Mandatory warning bar */}
          <div className="mx-auto max-w-2xl bg-red-600/95 border-l-4 border-red-300 px-3 py-2 flex items-start gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-white mt-0.5 shrink-0" />
            <p className="text-[11px] text-white leading-snug tracking-wide font-medium">
              VISUAL ANALYSIS ONLY · NEVER A SUBSTITUTE FOR LABORATORY TESTING
            </p>
          </div>

          {/* Manual-capture hint — shown if stabilising >6s */}
          {showManualHint && waterDetected && !analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl mb-3 text-center"
            >
              <p className="font-mono text-[11px] tracking-[0.18em] text-amber-200">
                ▸ AUTO-CAPTURE TAKING LONGER THAN USUAL · TAP BUTTON TO CAPTURE NOW
              </p>
            </motion.div>
          )}

          {/* Capture button */}
          {cameraActive && !analyzing && (
            <div className="flex justify-center">
              <button
                data-testid="capture-frame-button"
                onClick={() => {
                  if (!waterDetected) {
                    toast.warning('No water in frame — aim at a water source first');
                    vibrate([100, 50, 100]);
                    return;
                  }
                  captureAndAnalyze();
                }}
                className={`inline-flex items-center gap-2 px-7 h-12 rounded-sm font-medium text-sm border transition-colors
                  ${waterDetected
                    ? `bg-sky-500 text-white border-sky-400 hover:bg-sky-400 ${showManualHint ? 'wt-pulse-ring' : ''}`
                    : 'bg-white/10 text-white/40 border-white/10 cursor-not-allowed'}`}
              >
                <Camera className="w-4 h-4" />
                {waterDetected ? 'CAPTURE & ANALYSE' : 'AIM AT WATER TO ENABLE'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
