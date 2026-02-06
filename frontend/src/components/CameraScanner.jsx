import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Detection thresholds
const QUALITY_THRESHOLDS = {
  BLUR_MIN: 100,
  BRIGHTNESS_MIN: 60,
  BRIGHTNESS_MAX: 220,
  AUTO_CAPTURE_QUALITY: 85,
  WATER_CONFIDENCE_MIN: 60
};

export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureAttemptRef = useRef(0);
  
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [analyzing, setAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState({
    quality: 0,
    blur: 0,
    brightness: 0,
    waterConfidence: 0
  });
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Camera initialization
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        setStatus('detecting_water');
        setPermissionDenied(false);
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setPermissionDenied(true);
      setStatus('error');
      toast.error('Camera access denied. Please enable camera permissions.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Detect water surface (basic heuristic)
  const detectWaterSurface = useCallback((imageData) => {
    const data = imageData.data;
    let bluePixels = 0;
    let uniformRegions = 0;
    
    // Check for blue/cyan tones (water often has blue tint)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Check if pixel has blue/cyan characteristics
      if (b > r && b > g - 20) {
        bluePixels++;
      }
    }
    
    const blueRatio = bluePixels / (data.length / 4);
    
    // Check for uniform regions (water tends to be more uniform)
    const blockSize = 20;
    const width = imageData.width;
    const height = imageData.height;
    
    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        let variance = 0;
        let mean = 0;
        let count = 0;
        
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            mean += brightness;
            count++;
          }
        }
        mean /= count;
        
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            variance += Math.pow(brightness - mean, 2);
          }
        }
        variance /= count;
        
        if (variance < 500) {
          uniformRegions++;
        }
      }
    }
    
    const totalBlocks = Math.floor(height / blockSize) * Math.floor(width / blockSize);
    const uniformRatio = uniformRegions / totalBlocks;
    
    // Water confidence score
    const waterConfidence = Math.min(100, (blueRatio * 40 + uniformRatio * 60));
    
    return waterConfidence;
  }, []);

  // Analyze frame quality and detect water
  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    // Calculate Laplacian variance (blur detection)
    const grayscale = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    
    let laplacianSum = 0;
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = y * canvas.width + x;
        const laplacian = Math.abs(
          4 * grayscale[idx] -
          grayscale[idx - 1] -
          grayscale[idx + 1] -
          grayscale[idx - canvas.width] -
          grayscale[idx + canvas.width]
        );
        laplacianSum += laplacian * laplacian;
      }
    }
    const blurScore = Math.sqrt(laplacianSum / ((canvas.width - 2) * (canvas.height - 2)));

    // Detect water surface
    const waterConfidence = detectWaterSurface(imageData);

    // Calculate overall quality score
    let qualityScore = 0;

    // Lighting quality (0-35 points)
    if (avgBrightness >= QUALITY_THRESHOLDS.BRIGHTNESS_MIN && 
        avgBrightness <= QUALITY_THRESHOLDS.BRIGHTNESS_MAX) {
      qualityScore += 35;
    } else if (avgBrightness >= 40 && avgBrightness <= 240) {
      qualityScore += 20;
    }

    // Sharpness quality (0-35 points)
    if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 1.5) {
      qualityScore += 35;
    } else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN) {
      qualityScore += 20;
    } else if (blurScore > QUALITY_THRESHOLDS.BLUR_MIN * 0.5) {
      qualityScore += 10;
    }

    // Water detection (0-30 points)
    if (waterConfidence >= QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) {
      qualityScore += 30;
    } else if (waterConfidence >= 40) {
      qualityScore += 15;
    }

    return {
      quality: Math.min(100, qualityScore),
      blur: blurScore,
      brightness: avgBrightness,
      waterConfidence: waterConfidence
    };
  }, [detectWaterSurface]);

  // Automatic capture logic (no button)
  useEffect(() => {
    if (!cameraActive || analyzing) return;

    const interval = setInterval(() => {
      const frameMetrics = analyzeFrame();
      if (!frameMetrics) return;

      setMetrics(frameMetrics);

      // Update status based on metrics
      if (frameMetrics.waterConfidence < QUALITY_THRESHOLDS.WATER_CONFIDENCE_MIN) {
        setStatus('detecting_water');
      } else if (frameMetrics.blur < QUALITY_THRESHOLDS.BLUR_MIN) {
        setStatus('too_blurry');
      } else if (frameMetrics.brightness < QUALITY_THRESHOLDS.BRIGHTNESS_MIN) {
        setStatus('too_dark');
      } else if (frameMetrics.brightness > QUALITY_THRESHOLDS.BRIGHTNESS_MAX) {
        setStatus('too_bright');
      } else if (frameMetrics.quality < QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY) {
        setStatus('stabilizing');
      } else {
        setStatus('optimal');
      }

      // AUTO-CAPTURE when optimal (NO BUTTON)
      if (frameMetrics.quality >= QUALITY_THRESHOLDS.AUTO_CAPTURE_QUALITY && 
          status === 'optimal' && 
          captureAttemptRef.current === 0) {
        captureAttemptRef.current = 1;
        setTimeout(() => {
          captureAndAnalyze();
        }, 500); // Brief delay for stability
      }
    }, 300);

    return () => clearInterval(interval);
  }, [cameraActive, analyzing, status, analyzeFrame]);

  // Capture and analyze
  const captureAndAnalyze = async () => {
    if (!videoRef.current || analyzing) return;

    setAnalyzing(true);
    setStatus('analyzing');

    try {
      // Capture frame
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      const file = new File([blob], 'water_scan.jpg', { type: 'image/jpeg' });

      // Stop camera
      stopCamera();

      // Send to API
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Navigate to results
      navigate(`/results/${response.data.id}`);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed. Retrying...');
      captureAttemptRef.current = 0;
      setAnalyzing(false);
      setStatus('detecting_water');
      startCamera();
    }
  };

  // Initialize camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Status message
  const getStatusMessage = () => {
    switch (status) {
      case 'initializing':
        return 'Initializing camera...';
      case 'detecting_water':
        return 'Point camera at water surface';
      case 'too_blurry':
        return 'Hold camera steady...';
      case 'too_dark':
        return 'Need more light...';
      case 'too_bright':
        return 'Too bright, adjust angle...';
      case 'stabilizing':
        return 'Stabilizing image...';
      case 'optimal':
        return 'Capturing...';
      case 'analyzing':
        return 'Analyzing water sample...';
      case 'error':
        return 'Camera access required';
      default:
        return 'Point camera at water surface';
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
              WaterTruth AI needs camera access to scan water samples. Please enable camera permissions in your browser settings and refresh.
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
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      {/* Hidden canvas for frame analysis */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Status Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-white" strokeWidth={1.5} />
              <span className="text-white font-semibold">WaterTruth AI</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-xs">
                Quality {metrics.quality}%
              </div>
              {metrics.waterConfidence > 0 && (
                <div className="text-white/70 text-xs">
                  Water {Math.round(metrics.waterConfidence)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Guide Frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-72 h-72 md:w-80 md:h-80">
            {/* Scanning reticle */}
            <div className="absolute inset-0 border-2 border-white/40 rounded-3xl">
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-3xl" />
              <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-3xl" />
              <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-3xl" />
              <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-3xl" />
            </div>
            
            {/* Scanning animation when detecting */}
            {(status === 'detecting_water' || status === 'stabilizing') && (
              <motion.div
                className="absolute inset-0 border-t-2 border-primary/60"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </div>
        </div>

        {/* Bottom Status */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-4"
            >
              <div className="flex items-center justify-center gap-3">
                {getStatusIcon()}
                <span className="text-white text-lg font-medium">
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
                <p className="text-white/60 text-sm max-w-xs mx-auto">
                  {status === 'detecting_water' && 'Position water within the frame'}
                  {status === 'stabilizing' && 'Almost ready...'}
                  {status === 'optimal' && 'Perfect! Capturing now...'}
                  {(status === 'too_blurry' || status === 'too_dark' || status === 'too_bright') && 'Adjust camera position'}
                </p>
              )}

              {/* NO CAPTURE BUTTON - FULLY AUTOMATIC */}
              {!analyzing && status !== 'error' && (
                <div className="text-white/40 text-xs pt-2">
                  Automatic capture enabled
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}