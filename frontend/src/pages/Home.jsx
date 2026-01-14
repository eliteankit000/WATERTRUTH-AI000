import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Droplets, ShieldCheck, Microscope, Upload, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Home() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/analyze`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      navigate(`/results/${response.data.id}`);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to analyze image. Please try again.');
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

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
              Instant visual water safety analysis. Upload a photo, get AI-powered risk assessment in seconds.
            </p>
          </motion.div>

          {/* Upload Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-12"
          >
            <Card className="glass-card shadow-xl">
              <CardContent className="p-8 md:p-12">
                <div
                  data-testid="upload-dropzone"
                  className={`upload-dropzone rounded-xl p-12 text-center ${isDragging ? 'dragover' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {uploading ? (
                    <div className="space-y-4">
                      <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
                      <p className="text-muted-foreground">Analyzing water sample...</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" strokeWidth={1.5} />
                      <h3 className="text-xl font-semibold mb-2">Upload Water Image</h3>
                      <p className="text-muted-foreground mb-6">
                        Drag and drop your water photo here, or click to browse
                      </p>
                      <div className="flex gap-4 justify-center flex-wrap">
                        <Button
                          data-testid="browse-files-btn"
                          className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-medium transition-transform active:scale-95 shadow-lg shadow-primary/20"
                          onClick={() => document.getElementById('file-input').click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Browse Files
                        </Button>
                        <Button
                          data-testid="use-camera-btn"
                          variant="secondary"
                          className="h-12 px-8 rounded-full font-medium"
                          onClick={() => document.getElementById('camera-input').click()}
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Use Camera
                        </Button>
                      </div>
                      <input
                        id="file-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files[0])}
                      />
                      <input
                        id="camera-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files[0])}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
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
              Advanced visual analysis powered by AI, no chemical testing required
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
                    <Upload className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-semibold">1. Upload Photo</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Capture or upload a clear photo of your water sample from any source
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
                  <h3 className="text-xl font-semibold">2. AI Analysis</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Our AI analyzes visual features like reflection, texture, and color patterns
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
                  <h3 className="text-xl font-semibold">3. Get Results</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Receive instant risk assessment with detailed explanation and recommendations
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