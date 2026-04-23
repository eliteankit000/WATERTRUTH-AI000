import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert, FlaskConical, Droplets, Activity, ScanLine, Eye, FileText, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

function Field({ k, v }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-100 py-2 last:border-b-0">
      <div className="wt-label">{k}</div>
      <div className="font-mono text-sm text-zinc-900 text-right max-w-[60%] break-words">{v}</div>
    </div>
  );
}

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    axios.get(`${API}/analyses/${id}`)
      .then(r => setAnalysis(r.data))
      .catch(e => { console.error(e); toast.error('Failed to load analysis'); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-zinc-200 border-t-sky-500 rounded-full animate-spin mx-auto" />
          <div className="wt-label">LOADING ANALYSIS…</div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <ShieldAlert className="w-12 h-12 mx-auto text-red-600" strokeWidth={1.5} />
          <h2 className="font-display text-2xl font-semibold">Analysis not found</h2>
          <button
            onClick={() => navigate('/')}
            className="bg-zinc-950 text-white h-11 px-6 rounded-sm font-medium"
          >
            Return home
          </button>
        </div>
      </div>
    );
  }

  const c  = analysis.classification;
  const va = analysis.visual_analysis;
  const when = new Date(analysis.created_at);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            data-testid="back-home-btn"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950"
          >
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-zinc-950" />
            <span className="font-display font-semibold text-sm">WaterTruth · Report</span>
          </div>
          <button
            onClick={() => navigate('/scan')}
            data-testid="analyze-another-btn"
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> New scan
          </button>
        </div>
      </header>

      {/* Mandatory warning banner — top of results, unmissable */}
      <div
        data-testid="mandatory-safety-warning"
        className="bg-red-50 border-b-4 border-red-600 px-6 py-4"
      >
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] text-red-700 mb-1">MANDATORY SAFETY NOTICE</div>
            <p className="text-sm text-red-900 leading-snug font-medium">{analysis.warning}</p>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 md:py-12 grid grid-cols-12 gap-5">
        {/* ── Meta row ──────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="col-span-12 flex flex-wrap items-center gap-4 justify-between"
        >
          <div>
            <div className="wt-label">ANALYSIS · REF</div>
            <div className="font-mono text-sm text-zinc-900">{analysis.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div>
            <div className="wt-label">CAPTURED AT</div>
            <div className="font-mono text-sm text-zinc-900">{when.toLocaleString()}</div>
          </div>
          <div>
            <div className="wt-label">SOURCE</div>
            <div className="font-mono text-sm text-zinc-900">{va.source_context}</div>
          </div>
          <div>
            <div className="wt-label">MODEL</div>
            <div className="font-mono text-sm text-zinc-900">GPT-5.2 · VISION</div>
          </div>
        </motion.section>

        {/* ── Image + Classification + Drinkability (left) ─────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="col-span-12 lg:col-span-5 space-y-5"
        >
          {/* Captured image */}
          <div className="bg-white border border-zinc-200 rounded-sm">
            <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-200">
              <div className="wt-label">CAPTURE · FRAME</div>
              <Eye className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            {analysis.image_data ? (
              <img
                src={`data:image/jpeg;base64,${analysis.image_data}`}
                alt="Water sample"
                className="w-full h-auto block"
              />
            ) : (
              <div className="aspect-square bg-zinc-100 flex items-center justify-center text-zinc-400">
                No image
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-zinc-200 rounded-sm p-5">
            <div className="wt-label mb-2">CLASSIFICATION</div>
            <div
              data-testid="results-classification-badge"
              className={`inline-block px-3 py-1.5 font-mono text-sm tracking-widest wt-class-${c}`}
            >
              {c.replace(/_/g, ' ')}
            </div>
            <div className="mt-5 wt-label">DRINKABILITY VERDICT</div>
            <div data-testid="drinkability-verdict" className="mt-1 font-display text-xl sm:text-2xl font-semibold text-zinc-950">
              {analysis.drinkability}
            </div>
            <div className="mt-5 wt-label">CONFIDENCE</div>
            <div className="mt-2 flex items-center gap-3">
              <div className={`px-2.5 py-1 font-mono text-xs tracking-widest wt-conf-${analysis.confidence}`}>
                {analysis.confidence}
              </div>
              <div className="flex-1 h-2 bg-zinc-100 relative overflow-hidden rounded-full">
                <div
                  className={`absolute inset-y-0 left-0 ${
                    analysis.confidence.toUpperCase() === 'HIGH' ? 'w-full bg-zinc-950'
                    : analysis.confidence.toUpperCase() === 'MEDIUM' ? 'w-2/3 bg-amber-500'
                    : 'w-1/3 bg-red-500'
                  }`}
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Visual observations + JSON (right) ───────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="col-span-12 lg:col-span-7 space-y-5"
        >
          {/* Visual features */}
          <div className="bg-white border border-zinc-200 rounded-sm">
            <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <ScanLine className="w-3.5 h-3.5 text-sky-600" />
                <span className="wt-label">VISUAL OBSERVATIONS</span>
              </div>
              <div className="wt-label">STEP · 01</div>
            </div>
            <div className="p-5">
              <Field k="COLOR"          v={va.color} />
              <Field k="CLARITY"        v={va.clarity} />
              <Field k="PARTICLES"      v={va.particles} />
              <Field k="SURFACE"        v={va.surface} />
              <Field k="SOURCE CONTEXT" v={va.source_context} />
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-white border border-zinc-200 rounded-sm">
            <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-zinc-700" />
                <span className="wt-label">RECOMMENDATION</span>
              </div>
              <div className="wt-label">STEP · 05</div>
            </div>
            <div className="p-5">
              <p className="text-[15px] text-zinc-900 leading-relaxed">{analysis.recommendation}</p>
            </div>
          </div>

          {/* Raw JSON */}
          <details className="bg-zinc-950 text-zinc-100 border border-zinc-900 rounded-sm overflow-hidden group">
            <summary className="cursor-pointer select-none px-4 h-10 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">RAW JSON · OUTPUT CONTRACT</span>
              </div>
              <span className="text-zinc-500 text-xs group-open:hidden">EXPAND</span>
              <span className="text-zinc-500 text-xs hidden group-open:inline">COLLAPSE</span>
            </summary>
            <pre className="p-4 text-[12px] font-mono leading-relaxed overflow-x-auto">
{JSON.stringify(
  {
    visual_analysis: va,
    classification: c,
    drinkability: analysis.drinkability,
    confidence: analysis.confidence,
    recommendation: analysis.recommendation,
    warning: analysis.warning,
  },
  null, 2
)}
            </pre>
          </details>
        </motion.section>

        {/* Actions */}
        <div className="col-span-12 flex flex-wrap gap-3 justify-center pt-4">
          <button
            onClick={() => navigate('/scan')}
            className="inline-flex items-center gap-2 bg-zinc-950 text-white h-12 px-7 rounded-sm font-medium hover:bg-zinc-800"
          >
            <Droplets className="w-4 h-4" /> Scan another sample
          </button>
          <button
            onClick={() => navigate('/history')}
            className="inline-flex items-center gap-2 bg-white text-zinc-900 border border-zinc-200 h-12 px-6 rounded-sm font-medium hover:bg-zinc-50"
          >
            <FileText className="w-4 h-4" /> View history
          </button>
        </div>
      </main>
    </div>
  );
}
