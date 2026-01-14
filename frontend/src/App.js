import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from '@/pages/Home';
import Analysis from '@/pages/Analysis';
import Results from '@/pages/Results';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <div className="App min-h-screen bg-background font-sans antialiased">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/results/:id" element={<Results />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;