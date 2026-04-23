import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FlaskConical, Upload as UploadIcon, X, Image as ImageIcon, Camera } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import ResultCard from '@/components/ResultCard';
import { analyzeImage, friendlyAnalyzeError } from '@/lib/analyzeImage';

const MAX_FILE_MB     = 12;
const ACCEPTED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function Upload() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState(null);     // object URL
  const [analysis,  setAnalysis]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [slow,      setSlow]      = useState(false);
  const [error,     setError]     = useState(null);
  const [dragOver,  setDragOver]  = useState(false);

  // Cleanup blob URLs on unmount / replacement
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = useCallback((selected) => {
    setError(null);
    setAnalysis(null);
    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type.toLowerCase())) {
      setError('Unsupported format. Use JPG, PNG, or WEBP.');
      return;
    }
    const sizeMb = selected.size / 1024 / 1024;
    if (sizeMb > MAX_FILE_MB) {
      setError(`Image is too large (${sizeMb.toFixed(1)}MB). Max ${MAX_FILE_MB}MB.`);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }, [preview]);

  const runAnalysis = async () => {
    if (!file || loading) return;
    setLoading(true);
    setSlow(false);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeImage(file, {
        onSlowNetwork: () => setSlow(true),
      });
      setAnalysis(result);
    } catch (err) {
      console.error('[Upload] analyze failed:', err);
      setError(friendlyAnalyzeError(err));
    } finally {
      setLoading(false);
      setSlow(false);
    }
  };

  const clearAll = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setAnalysis(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── drag & drop ──
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
  };

  const statusKey = loading ? 'processing' : analysis ? 'scanning' : error ? 'stopped' : 'idle';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950"
          >
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-zinc-950" />
            <span className="font-display font-semibold text-sm">WaterTruth · Upload</span>
          </div>
          <button
            data-testid="upload-to-camera-btn"
            onClick={() => navigate('/scan')}
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950 text-sm"
          >
            <Camera className="w-4 h-4" /><span className="hidden sm:inline">Camera</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Title + status */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-zinc-950">
              Upload a water image
            </h1>
            <p className="text-zinc-600 text-sm sm:text-[15px] mt-1 max-w-xl">
              Same GPT-5.2 visual analysis as the live scanner — choose this when you already have a photo
              or can't use the camera.
            </p>
          </div>
          <StatusBadge status={statusKey} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ── Upload + preview (left) ─────────────────────── */}
          <section className="lg:col-span-6 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`bg-white border-2 border-dashed rounded-sm transition-colors ${
                dragOver ? 'border-sky-500 bg-sky-50' : 'border-zinc-300'
              }`}
            >
              {!preview && (
                <label
                  htmlFor="wt-file-input"
                  className="flex flex-col items-center justify-center px-6 py-10 sm:py-16 cursor-pointer text-center"
                >
                  <div className="w-12 h-12 bg-zinc-950 flex items-center justify-center rounded-sm mb-4">
                    <UploadIcon className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div className="font-display font-semibold text-zinc-950 text-base sm:text-lg">
                    Tap to pick an image
                  </div>
                  <div className="text-zinc-600 text-sm mt-1">or drag & drop here</div>
                  <div className="wt-label mt-4">JPG · PNG · WEBP · max {MAX_FILE_MB}MB</div>
                </label>
              )}

              {preview && (
                <div className="relative">
                  <img
                    src={preview}
                    alt="Selected water sample"
                    data-testid="upload-preview-image"
                    className="w-full h-auto block max-h-[70vh] object-contain bg-black/5"
                  />
                  <button
                    data-testid="upload-clear-btn"
                    onClick={clearAll}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black/90"
                    aria-label="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <input
                id="wt-file-input"
                ref={inputRef}
                data-testid="upload-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </motion.div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                data-testid="upload-analyze-btn"
                onClick={runAnalysis}
                disabled={!file || loading}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-zinc-950 text-white h-12 rounded-sm font-medium hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                {loading ? 'Analysing…' : 'Analyse with GPT-5.2'}
              </button>
              {file && !loading && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-zinc-900 border border-zinc-200 h-12 px-5 rounded-sm font-medium hover:bg-zinc-50"
                >
                  Replace
                </button>
              )}
            </div>

            {file && (
              <div className="font-mono text-[11px] text-zinc-500 flex justify-between">
                <span className="truncate max-w-[60%]">{file.name}</span>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
          </section>

          {/* ── Result (right) ──────────────────────────────── */}
          <section className="lg:col-span-6">
            <ResultCard
              analysis={analysis}
              loading={loading}
              slow={slow}
              error={error}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
