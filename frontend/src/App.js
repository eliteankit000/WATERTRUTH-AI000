import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Home from '@/pages/Home';
import CameraScanner from '@/components/CameraScanner';
import Results from '@/pages/Results';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import InstallPrompt from '@/components/InstallPrompt';
import NetworkStatus from '@/components/NetworkStatus';

function App() {
  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((registration) => {
            console.log('SW registered:', registration);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  if (confirm('New version available! Reload to update?')) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  }
                }
              });
            });
          })
          .catch((err) => console.log('SW registration failed:', err));
      });
    }

    // Prevent zoom on iOS
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());

    // Performance monitoring
    if (window.performance) {
      window.addEventListener('load', () => {
        const perfData = window.performance.timing;
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
        console.log('Page load time:', pageLoadTime + 'ms');
        
        // Send to analytics in production
        // analytics.track('page_load', { duration: pageLoadTime });
      });
    }

    // Wake lock for camera scanning (prevents screen from sleeping)
    if ('wakeLock' in navigator) {
      let wakeLock = null;
      const requestWakeLock = async () => {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake lock active');
        } catch (err) {
          console.log('Wake lock error:', err);
        }
      };
      
      // Request wake lock when camera is active
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && window.location.pathname === '/scan') {
          requestWakeLock();
        }
      });
    }

    return () => {
      document.removeEventListener('gesturestart', (e) => e.preventDefault());
      document.removeEventListener('gesturechange', (e) => e.preventDefault());
      document.removeEventListener('gestureend', (e) => e.preventDefault());
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="App min-h-screen bg-background font-sans antialiased">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/scan" element={<CameraScanner />} />
            <Route path="/results/:id" element={<Results />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
        <InstallPrompt />
        <NetworkStatus />
      </div>
    </ErrorBoundary>
  );
}

export default App;