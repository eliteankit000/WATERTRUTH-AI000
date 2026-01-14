import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Droplets } from 'lucide-react';

export default function Analysis() {
  const navigate = useNavigate();

  useEffect(() => {
    // This page is not actively used in the flow
    // Users are redirected directly to results
    navigate('/');
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-accent to-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-6 p-8"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-primary/10 rounded-full wave-animation">
            <Droplets className="w-16 h-16 text-primary" strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-3xl font-bold">Analyzing Water Sample...</h2>
        <p className="text-muted-foreground max-w-md">
          Our AI is examining visual patterns, surface texture, and color consistency
        </p>
        <div className="flex justify-center gap-2 mt-8">
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </motion.div>
    </div>
  );
}