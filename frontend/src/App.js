import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Home from '@/pages/Home';
import CameraScanner from '@/components/CameraScanner';
import Results from '@/pages/Results';
import History from '@/pages/History';
import Upload from '@/pages/Upload';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/ErrorBoundary';

function App() {
  useEffect(() => {
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());
    return () => {
      document.removeEventListener('gesturestart', (e) => e.preventDefault());
      document.removeEventListener('gesturechange', (e) => e.preventDefault());
      document.removeEventListener('gestureend', (e) => e.preventDefault());
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="App min-h-screen bg-background antialiased">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/scan" element={<CameraScanner />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/results/:id" element={<Results />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
      </div>
    </ErrorBoundary>
  );
}

export default App;
