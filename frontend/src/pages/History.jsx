import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FlaskConical, FileText, Camera } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function History() {
  const navigate = useNavigate();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/analyses?limit=100`)
      .then(r => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950"
          >
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-zinc-950" />
            <span className="font-display font-semibold text-sm">WaterTruth · Log</span>
          </div>
          <button
            data-testid="start-scan-button"
            onClick={() => navigate('/scan')}
            className="flex items-center gap-2 text-zinc-700 hover:text-zinc-950 text-sm"
          >
            <Camera className="w-4 h-4" /> New scan
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Analysis log</h1>
            <p className="text-zinc-600 text-sm mt-1">Every capture, classified and timestamped. Persisted to Supabase.</p>
          </div>
          <div className="wt-label">{rows.length} ENTRIES</div>
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-zinc-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-3" />
            <div className="wt-label">LOADING LOG…</div>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="border border-dashed border-zinc-300 rounded-sm p-14 text-center bg-white">
            <FileText className="w-10 h-10 mx-auto text-zinc-400 mb-3" strokeWidth={1.5} />
            <h3 className="font-display text-lg font-semibold">No analyses yet</h3>
            <p className="text-zinc-600 text-sm mt-1 mb-5">Run your first scan to populate the log.</p>
            <button
              onClick={() => navigate('/scan')}
              className="bg-zinc-950 text-white h-11 px-6 rounded-sm font-medium"
            >
              Start camera scan
            </button>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {rows.map((r, i) => (
              <motion.button
                key={r.id}
                data-testid="history-feed-item"
                onClick={() => navigate(`/results/${r.id}`)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                className="text-left bg-white border border-zinc-200 rounded-sm p-4 hover:-translate-y-[2px] hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`px-2 py-1 font-mono text-[10px] tracking-widest wt-class-${r.classification}`}>
                    {r.classification.replace(/_/g, ' ')}
                  </div>
                  <div className={`px-2 py-0.5 font-mono text-[10px] tracking-widest wt-conf-${r.confidence}`}>
                    {r.confidence}
                  </div>
                </div>
                <div className="font-display text-base font-semibold text-zinc-950 leading-tight line-clamp-2">
                  {r.drinkability}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-600">
                  <div>
                    <div className="wt-label">COLOR</div>
                    <div className="text-zinc-900 truncate">{r.visual_analysis?.color ?? '—'}</div>
                  </div>
                  <div>
                    <div className="wt-label">CLARITY</div>
                    <div className="text-zinc-900 truncate">{r.visual_analysis?.clarity ?? '—'}</div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-100 font-mono text-[11px] text-zinc-500 flex justify-between">
                  <span>{r.id.slice(0, 8).toUpperCase()}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
