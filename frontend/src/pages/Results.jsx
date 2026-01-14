import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Droplets, AlertTriangle, CheckCircle, AlertCircle, TrendingUp, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const response = await axios.get(`${API}/analyses/${id}`);
        setAnalysis(response.data);
      } catch (error) {
        console.error('Error fetching analysis:', error);
        toast.error('Failed to load analysis results');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-16 h-16 mx-auto text-destructive" />
          <h2 className="text-2xl font-bold">Analysis Not Found</h2>
          <Button onClick={() => navigate('/')}>Return Home</Button>
        </div>
      </div>
    );
  }

  const getRiskColor = (level) => {
    switch (level) {
      case 'LOW':
        return 'risk-badge-low';
      case 'MEDIUM':
        return 'risk-badge-medium';
      case 'HIGH':
        return 'risk-badge-high';
      default:
        return '';
    }
  };

  const getRiskIcon = (level) => {
    switch (level) {
      case 'LOW':
        return <CheckCircle className="w-5 h-5" strokeWidth={1.5} />;
      case 'MEDIUM':
        return <AlertCircle className="w-5 h-5" strokeWidth={1.5} />;
      case 'HIGH':
        return <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="backdrop-blur-md bg-white/80 border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <Button
            data-testid="back-home-btn"
            variant="ghost"
            onClick={() => navigate('/')}
            className="hover:bg-accent hover:text-accent-foreground rounded-full"
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-primary" strokeWidth={1.5} />
            <span className="font-semibold">WaterTruth AI</span>
          </div>
        </div>
      </div>

      {/* Results Content */}
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Analysis Results</h1>
          <p className="text-muted-foreground">Visual water safety assessment completed</p>
        </motion.div>

        {/* Risk Level Card - Hero Element */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card data-testid="risk-level-card" className="bg-card border-2 shadow-xl">
            <CardContent className="p-8 md:p-12">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className={`p-4 rounded-full ${getRiskColor(analysis.risk_level)} inline-flex`}>
                    {getRiskIcon(analysis.risk_level)}
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Risk Level</h2>
                  <Badge data-testid="risk-badge" className={`text-xl px-6 py-2 ${getRiskColor(analysis.risk_level)}`}>
                    {analysis.risk_level}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Confidence Score</p>
                  <div className="flex items-center gap-4 max-w-md mx-auto">
                    <Progress data-testid="confidence-progress" value={analysis.confidence} className="h-3" />
                    <span data-testid="confidence-score" className="text-2xl font-bold text-primary">{analysis.confidence}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bento Grid - Visual Features & Explanation */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Visual Features */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card data-testid="visual-features-card" className="h-full bg-card border border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  Visual Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <FeatureBar
                    label="Optical Reflection"
                    value={analysis.visual_features.optical_reflection}
                  />
                  <FeatureBar
                    label="Refraction Distortion"
                    value={analysis.visual_features.refraction_distortion}
                  />
                  <FeatureBar
                    label="Surface Texture"
                    value={analysis.visual_features.surface_texture}
                  />
                  <FeatureBar
                    label="Turbidity"
                    value={analysis.visual_features.turbidity}
                  />
                  <FeatureBar
                    label="Color Deviation"
                    value={analysis.visual_features.color_deviation}
                  />
                </div>
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Overall Quality</span>
                    <span className="text-2xl font-bold text-primary">
                      {analysis.visual_features.overall_quality}/100
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* AI Explanation */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-6"
          >
            <Card data-testid="ai-explanation-card" className="bg-card border border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="ai-explanation-text" className="text-muted-foreground leading-relaxed">
                  {analysis.ai_explanation}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="recommendation-card" className="bg-accent/50 border border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="recommendation-text" className="text-foreground leading-relaxed">
                  {analysis.recommendation}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="bg-muted border border-border">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong>Disclaimer:</strong> This analysis is based on visual patterns only and does not include chemical testing. 
                Results should not replace professional laboratory water quality testing. Always follow local water safety guidelines.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Action Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center pt-6"
        >
          <Button
            data-testid="analyze-another-btn"
            onClick={() => navigate('/')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-medium transition-transform active:scale-95 shadow-lg shadow-primary/20"
          >
            Analyze Another Sample
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function FeatureBar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/100</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}