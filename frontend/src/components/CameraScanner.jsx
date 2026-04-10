import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, AlertCircle, CheckCircle, Loader2, Camera } from 'lucide-react';
import { Card } from '@/components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const QUALITY_THRESHOLDS = {
  BLUR_MIN: 30,
  BRIGHTNESS_MIN: 30,
  BRIGHTNESS_MAX: 240,
  AUTO_CAPTURE_QUALITY: 40,
  WATER_CONFIDENCE_MIN: 20,
};

// FIX 1: Rewritten compressImage — avoids nested async FileReader issues
const compressImage = (blob) => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = (height / width) * maxDim; width = maxDim; }
        else { width = (width / height) * maxDim; height = maxDim; }
      }
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (compressed) => {
          if (compressed) resolve(compressed);
          else reject(new Error('Canvas toBlob returned null'));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed during compression'));
    };
    img.src = url;
  });
};

const vibrate = (pattern = [50]) => {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
};

export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const analyzerIntervalRef = useRef(null);
  const captureLockedRef = useRef(false); // FIX 2: single boolean lock — no more ref value juggling

  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [analyzing, setAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState({ quality: 0, blur: 0, brightness: 0, waterConfidence: 0 });
  const [permissionDenied, setPermissionDenied] = useState(false);

  const statusRef = useRef('initializing');
  const updateStatus = useCallback((s) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
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
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        captureLockedRef.current = false; // FIX 3: always unlock on new camera session
        updateStatus('detecting_water');
        setPermissionDenied(false);
        vibrate([50]);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setPermissionDenied(true);
      updateStatus('error');
      toast.error('Camera access denied');
      vibrate([200, 100, 200]);
    }
  }, [updateStatus]);

  const detectWaterSurface = useCallback((imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const blockSize = 16;
    let uniformBlocks = 0;
    let totalBlocks = 0;
    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        let sum = 0, sumSq = 0, count = 0;
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
            sum += lum; sumSq += lum * lum; count++;
          }
        }
        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        if (variance < 800) uniformBlocks++;
        totalBlocks++;
      }
    }
    const uniformityScore = totalBlocks > 0 ? (uniformBlocks / totalBlocks) * 100 : 0;

    let rSum = 0, gSum = 0, bSum = 0, rSumSq = 0, gSumSq = 0, bSumSq = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
      rSumSq += data[i] ** 2; gSumSq += data[i + 1] ** 2; bSumSq += data[i + 2] ** 2;
      n++;
    }
    const rMean = rSum / n, gMean = gSum / n, bMean = bSum / n;
    const avgVariance = ((rSumSq / n - rMean ** 2) + (gSumSq / n - gMean ** 2) + (bSumSq / n - bMean ** 2)) / 3;
    const coherenceScore = Math.max(0, 100 - avgVariance / 80);

    const avgBrightness = rMean * 0.299 + gMean * 0.587 + bMean * 0.114;
    let brightCount = 0;
    for (let i = 0; i < data.length; i += 16) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (Math.abs(lum - avgBrightness) < 60) brightCount++;
    }
    const brightnessConsistency = (brightCount / n) * 100;

    return Math.min(100, Math.max(0, uniformityScore * 0.5 + coherenceScore * 0.3 + brightnessConsistency * 0.2));
  }, []);

  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!video.videoWidth) return null;

    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4)
      totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const avgBrightness = totalBrightness / (data.length / 4);

    const grayscale = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4)
      grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

    let laplacianSum = 0;
    const w = canvas.width, h = canvas.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = Math.abs(4 * grayscale[idx] - grayscale[idx - 1] - grayscale[idx + 1] - grayscale[idx - w] - grayscale[idx + w]);
        laplacianSum += lap * lap;
      }
    }
    const blurScore = Math.sqrt(laplacianSum / ((w - 2) * (h - 2)));
    const waterConfidence = detectWaterSurface(imageData);

    let qualityScore = 0;
    if (avgBrightness >= QUALITY_THRESHOLDS.BRIGHTNESS_MIN && avgBrightness <= QUALITY_THRESHOLDS.BRIGHTNESS_MAX) qualityScore += 40;
    else if (avgBrightness > 10 && avgBrightness < 250) qualityScore += 20;
    if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 2) qualityScore += 35;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN) qualityScore += 20;
    else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 0.3) qualityScore += 8;
    if (waterConfidence >= QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) qualityScore += 25;
    else if (waterConfidence >= 10) qualityScore += 10;

    return { quality: Math.min(100, qualityScore), blur: blurScore, brightness: avgBrightness, waterConfidence };
  }, [detectWaterSurface]);

  // FIX 4: captureAndAnalyze — camera stops AFTER successful upload, restarts only on error
  const captureAndAnalyze = useCallback(async () => {
    if (captureLockedRef.current || analyzing) return;
    captureLockedRef.current = true;

    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      captureLockedRef.current = false;
      return;
    }

    setAnalyzing(true);
    updateStatus('analyzing');
    vibrate([50, 50, 50]);

    // Capture frame BEFORE stopping camera
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Stop camera now that we have the frame
    stopCamera();

    try {
      // FIX 5: toBlob wrapped in a promise with null check
      const rawBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null — canvas may be empty'))),
          'image/jpeg',
          0.95
        );
      });

      const compressedBlob = await compressImage(rawBlob);
      const file = new File([compressedBlob], 'water_scan.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      // FIX 6: log the exact error so you can see backend response
      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      vibrate([200]);
      navigate(`/results/${response.data.id}`);
    } catch (error) {
      // FIX 7: surface the real error message
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Unknown error';
      console.error('Analysis error:', msg, error);
      toast.error(`Analysis failed: ${msg}`);
      vibrate([200, 100, 200]);

      setAnalyzing(false);
      captureLockedRef.current = false;
      updateStatus('detecting_water');
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
      const frameMetrics = analyzeFrame();
      if (!frameMetrics) return;
      setMetrics(frameMetrics);

      let newStatus;
      if (frameMetrics.brightness < QUALITY_THRESHOLDS.BRIGHTNESS_MIN) newStatus = 'too_dark';
      else if (frameMetrics.brightness > QUALITY_THRESHOLDS.BRIGHTNESS_MAX) newStatus = 'too_bright';
      else if (frameMetrics.blur < QUALITY_THRESHOLDS.BLUR_MIN * 0.3) newStatus = 'too_blurry';
      else if (frameMetrics.waterConfidence < QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) newStatus = 'detecting_water';
      else if (frameMetrics.quality < QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY) newStatus = 'stabilizing';
      else newStatus = 'optimal';

      updateStatus(newStatus);

      // FIX 8: auto-capture uses the same lock — no duplicate captures
      if (newStatus === 'optimal' && !captureLockedRef.current) {
        vibrate([100]);
        setTimeout(() => captureAndAnalyze(), 600);
      }
    }, 400);

    return () => {
      clearInterval(analyzerIntervalRef.current);
      analyzerIntervalRef.current = null;
    };
  }, [cameraActive, analyzing, analyzeFrame, updateStatus, captureAndAnalyze]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const getStatusMessage = () => {
    switch (status) {
      case 'initializing': return 'Initializing camera...';
      case 'detecting_water': return 'Point camera at water surface';
      case 'too_blurry': return 'Hold camera steady...';
      case 'too_dark': return 'Need more light...';
      case 'too_bright': return 'Too bright, adjust angle...';
      case 'stabilizing': return 'Stabilizing...';
      case 'optimal': return 'Capturing...';
      case 'analyzing': return 'Analyzing water sample...';
      case 'error': return 'Camera access required';
      default: return 'Point camera at water surface';
    }
  };

  const getStatusIcon = () => {
    if (status === 'analyzing') return <Loader2 className="w-6 h-6 text-primary animate-spin" strokeWidth={1.5} />;
    if (status === 'optimal') return <CheckCircle className="w-6 h-6 text-green-500" strokeWidth={1.5} />;
    if (status === 'error') return <AlertCircle className="w-6 h-6 text-destructive" strokeWidth={1.5} />;
    return <Droplets className="w-6 h-6 text-primary" strokeWidth={1.5} />;
  };

  if (permissionDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-destructive/10 rounded-full">
              <AlertCircle className="w-12 h-12 text-destructive" strokeWidth={1.5} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Camera Access Required</h2>
            <p className="text-muted-foreground">
              WaterTruth AI needs camera access to scan water samples. Enable camera permissions and refresh.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-primary text-primary-foreground h-12 rounded-full font-medium"
          >
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
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-white" strokeWidth={1.5} />
              <span className="text-white font-semibold text-sm">WaterTruth AI</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="px-2 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-xs">
                Quality: {metrics.quality}%
              </div>
              <div className="text-white/70 text-xs">Water: {Math.round(metrics.waterConfidence)}%</div>
            </div>
          </div>
        </div>

        {/* Scanning frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-72 h-72">
            <div className="absolute inset-0 border-2 border-white/40 rounded-3xl">
              <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-3xl" />
              <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-3xl" />
              <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-3xl" />
              <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-3xl" />
            </div>
            {(status === 'detecting_water' || status === 'stabilizing') && (
              <motion.div
                className="absolute left-0 right-0 border-t-2 border-primary/60"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-3"
            >
              <div className="flex items-center justify-center gap-3">
                {getStatusIcon()}
                <span className="text-white text-base font-medium">{getStatusMessage()}</span>
              </div>

              {analyzing && (
                <div className="flex justify-center gap-2">
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <div key={i} className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                  ))}
                </div>
              )}

              {!analyzing && status !== 'error' && (
                <p className="text-white/60 text-xs max-w-xs mx-auto">
                  {status === 'detecting_water' && 'Frame any water — clear, murky, tap, river'}
                  {status === 'stabilizing' && 'Almost ready...'}
                  {status === 'optimal' && 'Perfect! Capturing now...'}
                  {status === 'too_blurry' && 'Hold camera steady'}
                  {status === 'too_dark' && 'Move to better lighting'}
                  {status === 'too_bright' && 'Adjust camera angle'}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Manual capture button */}
          {cameraActive && !analyzing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-auto flex justify-center mt-6"
            >
              <button
                onClick={captureAndAnalyze}  // FIX 9: direct call — lock is handled inside
                className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-full font-semibold text-sm shadow-2xl active:scale-95"
                style={{ transition: 'transform 0.15s' }}
              >
                <Camera className="w-4 h-4" />
                Capture Now
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
