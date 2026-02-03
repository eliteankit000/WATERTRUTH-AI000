import { motion } from 'framer-motion';
import { Droplets, ShieldCheck, Microscope, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="hero-gradient py-24">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center space-y-6"
          >
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-primary/10 rounded-full">
                <Droplets className="w-12 h-12 text-primary" strokeWidth={1.5} />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground">
              WaterTruth AI
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Instant visual water safety analysis using live camera scanning. Point your camera at water, get AI-powered risk assessment in seconds.
            </p>
          </motion.div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-12 text-center"
          >
            <Button
              data-testid="start-camera-btn"
              onClick={() => navigate('/scan')}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-14 px-12 rounded-full font-medium text-lg transition-transform active:scale-95 shadow-xl shadow-primary/30"
            >
              <Camera className="w-5 h-5 mr-2" />
              Start Camera Scan
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              Camera access required for water analysis
            </p>
          </motion.div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real-time visual analysis powered by AI, no chemical testing required
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="feature-card h-full bg-card border border-border/50 shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div className="p-3 bg-primary/10 rounded-lg w-fit">
                    <Camera className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-semibold">1. Live Camera Scan</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Point your mobile camera at any water source. The system auto-captures when conditions are optimal.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="feature-card h-full bg-card border border-border/50 shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div className="p-3 bg-primary/10 rounded-lg w-fit">
                    <Microscope className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-semibold">2. Visual Analysis</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    AI analyzes visual features: optical reflection, surface texture, color patterns, and light behavior.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="feature-card h-full bg-card border border-border/50 shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div className="p-3 bg-primary/10 rounded-lg w-fit">
                    <ShieldCheck className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-semibold">3. Instant Results</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Get risk assessment (Low/Medium/High) with AI explanation and safety recommendations.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Disclaimer Section */}
      <div className="py-16 bg-muted">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <Card className="bg-card border-2 border-border">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <ShieldCheck className="w-6 h-6 text-primary" strokeWidth={1.5} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Important Disclaimer</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    WaterTruth AI provides visual risk estimation only and does not chemically test water. 
                    This system does not identify specific contaminants, bacteria, or diseases. Results should 
                    not be used as a substitute for laboratory testing or professional water quality analysis. 
                    Always follow local water safety guidelines and regulations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 bg-background border-t border-border">
        <div className="max-w-5xl mx-auto px-6 md:px-12 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 WaterTruth AI. Visual water safety analysis powered by artificial intelligence.</p>
        </div>
      </div>
    </div>
  );
}