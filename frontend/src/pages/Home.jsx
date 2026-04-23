import { motion } from 'framer-motion';
import { Camera, FlaskConical, ShieldAlert, ScanLine, FileText, ChevronRight, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function Home() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    axios.get(`${API}/analyses?limit=4`).then(r => setRecent(r.data || [])).catch(() => {});
    axios.get(`${API}/health`).then(r => setStatus(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-zinc-950 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <div className="leading-tight">
              <div className="font-display font-semibold text-sm tracking-tight">WaterTruth</div>
              <div className="wt-label" style={{ fontSize: 9 }}>VISUAL-ONLY ANALYST · v2</div>
            </div>
          </div>
          <nav className="flex items-center gap-5 text-sm">
            <button
              data-testid="nav-history-btn"
              onClick={() => navigate('/history')}
              className="text-zinc-600 hover:text-zinc-950 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" /> History
            </button>
            <div className="hidden sm:flex items-center gap-2 wt-label">
              <span className={`w-1.5 h-1.5 rounded-full ${status ? 'bg-sky-500' : 'bg-zinc-300'}`} />
              {status ? status.ai === 'configured' ? 'VISION · ONLINE' : 'VISION · FALLBACK' : 'CONNECTING…'}
            </div>
          </nav>
        </div>
      </header>

      {/* ── Marquee disclaimer strip ────────────────────────────────── */}
      <div className="bg-red-600 text-white overflow-hidden border-b border-red-700">
        <div className="wt-marquee flex gap-12 py-1.5 text-[11px] font-mono uppercase tracking-widest">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-12 shrink-0">
              <span>▲ Visual analysis only</span>
              <span>▲ Not a lab test</span>
              <span>▲ Never declares water safe</span>
              <span>▲ TDS · pH · bacteria screening required before any consumption</span>
              <span>▲ Environmental safety tool</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative border-b border-zinc-200">
        <div className="absolute inset-0 wt-grid-bg opacity-70" />
        <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-12 gap-10 items-end">

          <div className="md:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="flex items-center gap-2 mb-6"
            >
              <div className="px-2 py-1 bg-white border border-zinc-200 font-mono text-[10px] tracking-[0.25em] text-zinc-600">
                REF · CLINICAL-WATER-VISION · 2026
              </div>
              <div className="px-2 py-1 bg-sky-50 border border-sky-300 font-mono text-[10px] tracking-[0.25em] text-sky-700">
                GPT-5.2 · LIVE
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-zinc-950 leading-[1.04]"
            >
              Objective visual<br />
              assessment of water,<br />
              <span className="text-sky-600">in seconds.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-6 max-w-xl text-zinc-600 text-[15px] leading-relaxed"
            >
              Point your camera at any water source. <span className="font-medium text-zinc-950">WaterTruth</span> inspects colour,
              clarity, particles and surface, then returns a classification, drinkability verdict,
              confidence score and safety recommendation — with the uncertainty honestly stated.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <button
                data-testid="start-scan-button"
                onClick={() => navigate('/scan')}
                className="group inline-flex items-center gap-3 bg-zinc-950 text-white font-medium px-7 h-12 rounded-sm hover:bg-zinc-800 transition-colors active:scale-[0.98]"
              >
                <Camera className="w-4 h-4" strokeWidth={2} />
                <span>Start Camera Scan</span>
                <ChevronRight className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/history')}
                className="inline-flex items-center gap-2 bg-white text-zinc-900 font-medium px-6 h-12 border border-zinc-200 rounded-sm hover:bg-zinc-50"
              >
                <FileText className="w-4 h-4" /> View Log
              </button>
            </motion.div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 wt-label">
              <span>▸ NO CHEMICAL TEST</span>
              <span>▸ NO MEDICAL CLAIM</span>
              <span>▸ VISUAL FEATURES ONLY</span>
            </div>
          </div>

          {/* Analysis preview card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="md:col-span-5"
          >
            <div className="bg-white border border-zinc-200 rounded-sm shadow-sm">
              <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-200">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-sky-600" />
                  <span className="wt-label">SAMPLE · OUTPUT SCHEMA</span>
                </div>
                <div className="wt-label">JSON</div>
              </div>
              <pre className="p-4 text-[12.5px] leading-relaxed font-mono text-zinc-800 overflow-x-auto">
{`{
  "visual_analysis": {
    "color":          "slightly brown",
    "clarity":        "moderately cloudy",
    "particles":      "trace",
    "surface":        "normal water",
    "source_context": "river"
  },
  "classification": "DIRTY",
  "drinkability":   "NOT SAFE TO DRINK",
  "confidence":     "MEDIUM",
  "recommendation": "Do not drink. Treat with
                     multi-stage filtration and
                     test before any use.",
  "warning":        "Visual inspection cannot
                     detect dissolved chemicals,
                     heavy metals, pathogens…"
}`}
              </pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works / Legend ───────────────────────────────────── */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Classification legend</h2>
            <div className="wt-label">COLOR MAPPING</div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { k: 'CLEAN',                 t: 'UNCERTAIN · VISUAL ONLY' },
              { k: 'SLIGHTLY_CONTAMINATED', t: 'TESTING REQUIRED' },
              { k: 'DIRTY',                 t: 'NOT SAFE TO DRINK' },
              { k: 'HIGHLY_POLLUTED',       t: 'NOT SAFE · HAZARDOUS' },
              { k: 'NO_WATER_DETECTED',     t: 'N/A' },
            ].map(item => (
              <div key={item.k} className="border border-zinc-200 bg-white p-4 rounded-sm">
                <div className={`inline-block px-2 py-1 font-mono text-[10px] tracking-widest wt-class-${item.k}`}>
                  {item.k.replace(/_/g, ' ')}
                </div>
                <div className="mt-3 wt-label">DRINKABILITY</div>
                <div className="font-mono text-xs text-zinc-900 mt-1">{item.t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recent analyses ─────────────────────────────────────────── */}
      {recent.length > 0 && (
        <section className="border-b border-zinc-200">
          <div className="max-w-7xl mx-auto px-6 py-14">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Recent log</h2>
              <button
                onClick={() => navigate('/history')}
                className="wt-label hover:text-zinc-900 flex items-center gap-1"
              >
                VIEW ALL <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recent.map(r => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/results/${r.id}`)}
                  className="text-left bg-white border border-zinc-200 rounded-sm p-4 hover:-translate-y-[2px] hover:shadow-md transition-all"
                >
                  <div className={`inline-block px-2 py-1 font-mono text-[10px] tracking-widest wt-class-${r.classification}`}>
                    {r.classification.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-3 font-mono text-xs text-zinc-500">{new Date(r.created_at).toLocaleString()}</div>
                  <div className="mt-2 text-sm text-zinc-900 line-clamp-2">{r.drinkability}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works steps ──────────────────────────────────────── */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-3 gap-0 md:divide-x md:divide-zinc-200">
          {[
            { n: '01', i: Camera, t: 'CAPTURE', d: 'Point your camera at any water source. We auto-capture when the frame is stable and water is detected.' },
            { n: '02', i: ScanLine, t: 'ANALYSE', d: 'GPT-5.2 inspects color, clarity, particles, surface and context. Only visible features are described.' },
            { n: '03', i: ShieldAlert, t: 'VERDICT', d: 'Structured classification + drinkability + confidence. CLEAN never maps to "safe" — only to "uncertain".' },
          ].map((s, i) => (
            <div key={i} className="p-6 md:p-8">
              <div className="flex items-center gap-3 wt-label">
                <span className="text-zinc-950">{s.n}</span>
                <span className="flex-1 h-px bg-zinc-200" />
                <s.i className="w-4 h-4 text-sky-600" />
              </div>
              <h3 className="mt-5 font-display font-semibold text-lg">{s.t}</h3>
              <p className="mt-2 text-zinc-600 text-sm leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mandatory footer disclaimer ─────────────────────────────── */}
      <footer className="bg-zinc-950 text-zinc-300">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-6">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="font-mono text-[10px] tracking-[0.25em] text-red-400">MANDATORY SAFETY NOTICE</span>
              </div>
              <p className="text-sm leading-relaxed">
                Visual inspection cannot detect dissolved chemicals, heavy metals, pathogens, or biological
                contaminants. This result is <strong className="text-white">NOT a substitute for laboratory testing</strong>
                {' '}(TDS, pH, bacteria, chemical screening).
              </p>
            </div>
            <div className="md:col-span-6 flex md:justify-end items-end">
              <div className="font-mono text-[11px] text-zinc-500">
                © 2026 WaterTruth AI · ENV-SAFETY CLASS III · Visual-only analyst
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
