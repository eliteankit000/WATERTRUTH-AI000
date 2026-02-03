import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Droplets, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CameraScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [analyzing, setAnalyzing] = useState(false);
  const [frameQuality, setFrameQuality] = useState(0);
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
        setStatus('ready');
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

  // Analyze frame quality (blur detection, lighting check)
  const analyzeFrameQuality = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return 0;

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

    // Calculate variance (blur indicator - lower variance = more blur)
    let variance = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pixelBrightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      variance += Math.pow(pixelBrightness - avgBrightness, 2);
    }
    variance = variance / (data.length / 4);

    // Quality scoring
    let qualityScore = 0;

    // Lighting check (optimal: 80-200)
    if (avgBrightness >= 80 && avgBrightness <= 200) {
      qualityScore += 40;
    } else if (avgBrightness >= 60 && avgBrightness <= 220) {
      qualityScore += 20;
    }

    // Sharpness check (variance > 500 indicates good sharpness)
    if (variance > 800) {
      qualityScore += 60;
    } else if (variance > 500) {
      qualityScore += 40;
    } else if (variance > 300) {
      qualityScore += 20;
    }

    return Math.min(100, qualityScore);
  }, []);

  // Auto-capture logic
  useEffect(() => {
    if (!cameraActive || analyzing || status !== 'ready') return;

    const interval = setInterval(() => {
      const quality = analyzeFrameQuality();
      setFrameQuality(quality);

      // Update status based on quality
      if (quality >= 70) {
        setStatus('optimal');
      } else if (quality >= 50) {
        setStatus('stabilizing');
      } else {
        setStatus('detecting');
      }

      // Auto-capture when quality is optimal
      if (quality >= 80 && status === 'optimal') {
        captureAndAnalyze();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cameraActive, analyzing, status, analyzeFrameQuality]);

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
      toast.error('Analysis failed. Please try again.');
      setAnalyzing(false);
      setStatus('ready');
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
      case 'detecting':
        return 'Point camera at water surface';
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
    if (status === 'optimal' || status === 'analyzing') {
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
              WaterTruth AI needs camera access to scan water samples. Please enable camera permissions in your browser settings and refresh the page.
            </p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
          >
            Retry
          </Button>
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
        <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-6 h-6 text-white" strokeWidth={1.5} />
              <span className="text-white font-semibold text-lg">WaterTruth AI</span>
            </div>
            <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-sm">
              {frameQuality}% Quality
            </div>
          </div>
        </div>

        {/* Center Guide Frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-80 h-80 border-4 border-white/50 rounded-3xl">
            {/* Corner markers */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-primary rounded-tl-3xl" />
            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-primary rounded-tr-3xl" />
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-primary rounded-bl-3xl" />
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-primary rounded-br-3xl" />
            
            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-white/70"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-full w-0.5 bg-white/70"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent">
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
                <span className="text-white text-xl font-medium">
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
                <p className="text-white/70 text-sm max-w-md mx-auto">
                  Position water within the frame. The system will automatically capture when conditions are optimal.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Manual Capture Override (for testing) */}
      {cameraActive && !analyzing && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center pointer-events-auto">
          <Button
            data-testid="manual-capture-btn"
            onClick={captureAndAnalyze}
            size="lg"
            className="bg-white text-black hover:bg-white/90 rounded-full shadow-2xl px-8 py-6"
          >
            <Camera className="w-5 h-5 mr-2" />
            Capture Now
          </Button>
        </div>
      )}
    </div>
  );
}