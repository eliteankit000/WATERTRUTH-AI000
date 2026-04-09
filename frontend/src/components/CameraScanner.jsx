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
  BLUR_MIN: 30,           // lowered from 100 — easier to pass
  BRIGHTNESS_MIN: 30,     // lowered from 60
  BRIGHTNESS_MAX: 240,
  AUTO_CAPTURE_QUALITY: 40, // lowered from 85 — any reasonable image
  WATER_CONFIDENCE_MIN: 20  // lowered from 60 — detect any water type
};

// Image compression utility
const compressImage = async (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1920;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((compressedBlob) => resolve(compressedBlob), 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(blob);
  });
};

// Haptic feedback
const vibrate = (pattern = [50]) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureAttemptRef = useRef(0);
  const analyzerIntervalRef = useRef(null);
  const statusRef = useRef('initializing'); // mirror of status for use inside intervals

  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [analyzing, setAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState({ quality: 0, blur: 0, brightness: 0, waterConfidence: 0 });
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [readyToCapture, setReadyToCapture] = useState(false);

  // Keep statusRef in sync
  const updateStatus = useCallback((s) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        updateStatus('detecting_water');
        setPermissionDenied(false);
        vibrate([50]);
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setPermissionDenied(true);
      updateStatus('error');
      toast.error('Camera access denied');
      vibrate([200, 100, 200]);
    }
  }, [updateStatus]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (analyzerIntervalRef.current) {
      clearInterval(analyzerIntervalRef.current);
      analyzerIntervalRef.current = null;
    }
    setCameraActive(false);
  }, []);

  /**
   * FIXED: Water surface detection that works for ALL water types:
   * clear tap water, murky water, brown river water, water in a glass, etc.
   * Instead of requiring blue color, we look for:
   * - Surface uniformity (water is relatively smooth)
   * - Reflective / semi-transparent patterns
   * - Any liquid-like visual properties
   */
  const detectWaterSurface = useCallback((imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = data.length / 4;

    // 1. Uniformity score — water surfaces have large uniform-ish regions
    const blockSize = 16;
    let uniformBlocks = 0;
    let totalBlocks = 0;

    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        let sum = 0;
        let sumSq = 0;
        let count = 0;
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
            sum += lum;
            sumSq += lum * lum;
            count++;
          }
        }
        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        if (variance < 800) uniformBlocks++;
        totalBlocks++;
      }
    }
    const uniformityScore = totalBlocks > 0 ? (uniformBlocks / totalBlocks) * 100 : 0;

    // 2. Color coherence — water (of any color) tends to have coherent hue across regions
    let rSum = 0, gSum = 0, bSum = 0;
    let rSumSq = 0, gSumSq = 0, bSumSq = 0;
    const sampleStep = 4;
    let sampleCount = 0;
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      rSumSq += data[i] * data[i];
      gSumSq += data[i + 1] * data[i + 1];
      bSumSq += data[i + 2] * data[i + 2];
      sampleCount++;
    }
    const rMean = rSum / sampleCount;
    const gMean = gSum / sampleCount;
    const bMean = bSum / sampleCount;
    const rVar = (rSumSq / sampleCount) - rMean * rMean;
    const gVar = (gSumSq / sampleCount) - gMean * gMean;
    const bVar = (bSumSq / sampleCount) - bMean * bMean;
    const avgVariance = (rVar + gVar + bVar) / 3;
    // Lower variance = more color coherent = more water-like
    const coherenceScore = Math.max(0, 100 - (avgVariance / 80));

    // 3. Brightness consistency — water reflects light somewhat evenly
    let brightCount = 0;
    const avgBrightness = (rMean * 0.299 + gMean * 0.587 + bMean * 0.114);
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (Math.abs(lum - avgBrightness) < 60) brightCount++;
    }
    const brightnessConsistency = (brightCount / sampleCount) * 100;

    // Combine: uniformity is most important for water detection
    const confidence = uniformityScore * 0.5 + coherenceScore * 0.3 + brightnessConsistency * 0.2;
    return Math.min(100, Math.max(0, confidence));
  }, []);

  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;
    if (!video.videoWidth) return null;

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    // Blur (Laplacian variance — simplified)
    const grayscale = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    let laplacianSum = 0;
    const w = canvas.width;
    const h = canvas.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = Math.abs(
          4 * grayscale[idx] -
          grayscale[idx - 1] -
          grayscale[idx + 1] -
          grayscale[idx - w] -
          grayscale[idx + w]
        );
        laplacianSum += lap * lap;
      }
    }
    const blurScore = Math.sqrt(laplacianSum / ((w - 2) * (h - 2)));

    const waterConfidence = detectWaterSurface(imageData);

    // Quality scoring (more lenient)
    let qualityScore = 0;
    if (avgBrightness >= QUALITY_THRESHOLDS.BRIGHTNESS_MIN && avgBrightness <= QUALITY_THRESHOLDS.BRIGHTNESS_MAX) {
      qualityScore += 40;
    } else if (avgBrightness > 10 && avgBrightness < 250) {
      qualityScore += 20;
    }
    if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 2) {
      qualityScore += 35;
    } else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN) {
      qualityScore += 20;
    } else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 0.3) {
      qualityScore += 8;
    }
    if (waterConfidence >= QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) {
      qualityScore += 25;
    } else if (waterConfidence >= 10) {
      qualityScore += 10;
    }

    return {
      quality: Math.min(100, qualityScore),
      blur: blurScore,
      brightness: avgBrightness,
      waterConfidence
    };
  }, [detectWaterSurface]);

  // Capture and send to backend
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || analyzing) return;

    setAnalyzing(true);
    updateStatus('analyzing');
    vibrate([50, 50, 50]);

    try {
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      const compressedBlob = await compressImage(blob);
      const file = new File([compressedBlob], 'water_scan.jpg', { type: 'image/jpeg' });

      stopCamera();

      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000
      });

      vibrate([200]);
      navigate(`/results/${response.data.id}`);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed. Retrying...');
      vibrate([200, 100, 200]);
      captureAttemptRef.current = 0;
      setAnalyzing(false);
      setReadyToCapture(false);
      updateStatus('detecting_water');
      startCamera();
    }
  }, [analyzing, navigate, stopCamera, startCamera, updateStatus]);

  // Frame analysis loop — uses ref for status to avoid stale closure
  useEffect(() => {
    if (!cameraActive || analyzing) {
      if (analyzerIntervalRef.current) {
        clearInterval(analyzerIntervalRef.current);
        analyzerIntervalRef.current = null;
      }
      return;
    }

    analyzerIntervalRef.current = setInterval(() => {
      const frameMetrics = analyzeFrame();
      if (!frameMetrics) return;

      setMetrics(frameMetrics);

      // Determine status based on metrics
      let newStatus;
      if (frameMetrics.brightness < QUALITY_THRESHOLDS.BRIGHTNESS_MIN) {
        newStatus = 'too_dark';
      } else if (frameMetrics.brightness > QUALITY_THRESHOLDS.BRIGHTNESS_MAX) {
        newStatus = 'too_bright';
      } else if (frameMetrics.blur < QUALITY_THRESHOLDS.BLUR_MIN * 0.3) {
        newStatus = 'too_blurry';
      } else if (frameMetrics.waterConfidence < QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) {
        newStatus = 'detecting_water';
      } else if (frameMetrics.quality < QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY) {
        newStatus = 'stabilizing';
      } else {
        newStatus = 'optimal';
      }

      updateStatus(newStatus);

      // Auto-capture using ref to avoid stale closure
      if (
        newStatus === 'optimal' &&
        captureAttemptRef.current === 0
      ) {
        captureAttemptRef.current = 1;
        setReadyToCapture(true);
        vibrate([100]);
        setTimeout(() => {
          captureAttemptRef.current = 2; // mark as triggered
        }, 300);
      }
    }, 400);

    return () => {
      if (analyzerIntervalRef.current) {
        clearInterval(analyzerIntervalRef.current);
        analyzerIntervalRef.current = null;
      }
    };
  }, [cameraActive, analyzing, analyzeFrame, updateStatus]);

  // Trigger capture when readyToCapture becomes true
  useEffect(() => {
    if (readyToCapture && !analyzing) {
      const timer = setTimeout(() => {
        captureAndAnalyze();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [readyToCapture, analyzing, captureAndAnalyze]);

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
    if (status === 'analyzing') {
      return <Loader2 className="w-6 h-6 text-primary animate-spin" strokeWidth={1.5} />;
    } else if (status === 'optimal') {
      return <CheckCircle className="w-6 h-6 text-green-500" strokeWidth={1.5} />;
    } else if (status === 'error') {
      return <AlertCircle className="w-6 h-6 text-destructive" strokeWidth={1.5} />;
    }
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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
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
              <div className="text-white/70 text-xs">
                Water: {Math.round(metrics.waterConfidence)}%
              </div>
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
                <span className="text-white text-base font-medium">
                  {getStatusMessage()}
                </span>
              </div>

              {analyzing && (
                <div className="flex justify-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
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

          {/* Manual capture button — always visible when camera is active and not analyzing */}
          {cameraActive && !analyzing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-auto flex justify-center mt-6"
            >
              <button
                onClick={() => {
                  if (captureAttemptRef.current === 0) {
                    captureAttemptRef.current = 1;
                    captureAndAnalyze();
                  }
                }}
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
