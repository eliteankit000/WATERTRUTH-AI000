import { motion } from 'framer-motion';
import { ShieldAlert, Activity, ScanLine, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * ResultCard — inline display of a WaterTruth analysis result.
 * Renders the CURRENT safe schema (never "SAFE" as a drinkability).
 * Used by both Upload and (optionally) a future live-streaming view.
 *
 * Props:
 *   analysis    — full analysis object from /api/analyze (or null)
 *   loading     — boolean (shows processing state)
 *   slow        — boolean (shows "taking longer than usual…")
 *   error       — string | null
 *   compact     — boolean (smaller variant for side-by-side panels)
 */
export default function ResultCard({ analysis, loading, slow, error, compact = false }) {
  const navigate = useNavigate();

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div
        data-testid="result-card-loading"
        className="bg-white border border-zinc-200 rounded-sm p-6 sm:p-8 text-center"
      >
        <Loader2 className="w-8 h-8 text-sky-600 mx-auto animate-spin" strokeWidth={1.8} />
        <div className="mt-4 wt-label">PROCESSING · GPT-5.2</div>
        <p className="mt-2 text-zinc-600 text-sm">
          {slow ? 'Taking longer than usual…' : 'Analysing water sample…'}
        </p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <div
        data-testid="result-card-error"
        className="bg-red-50 border border-red-200 rounded-sm p-5"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] text-red-700 mb-1">ANALYSIS · FAILED</div>
            <p className="text-sm text-red-900 leading-snug">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────
  if (!analysis) {
    return (
      <div
        data-testid="result-card-empty"
        className="bg-white border border-dashed border-zinc-300 rounded-sm p-6 sm:p-8 text-center"
      >
        <ScanLine className="w-8 h-8 text-zinc-400 mx-auto" strokeWidth={1.5} />
        <div className="mt-3 wt-label">AWAITING SAMPLE</div>
        <p className="mt-1 text-zinc-500 text-sm">Upload or capture a water image to see results here.</p>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────
  const { classification: c, visual_analysis: va = {} } = analysis;
  const confUpper = String(analysis.confidence || 'low').toUpperCase();

  return (
    <motion.div
      data-testid="result-card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-white border border-zinc-200 rounded-sm overflow-hidden ${compact ? '' : 'shadow-sm'}`}
    >
      {/* Mandatory safety banner — unmissable, top of every result */}
      <div
        data-testid="mandatory-safety-warning"
        className="bg-red-50 border-b-4 border-red-600 px-4 sm:px-5 py-3 flex items-start gap-2.5"
      >
        <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.22em] text-red-700 mb-0.5">
            MANDATORY SAFETY NOTICE
          </div>
          <p className="text-[12px] sm:text-[13px] text-red-900 leading-snug font-medium">
            {analysis.warning}
          </p>
        </div>
      </div>

      <div className={`p-4 sm:p-5 ${compact ? 'space-y-4' : 'space-y-5'}`}>
        {/* Classification + Drinkability */}
        <div>
          <div className="wt-label mb-1.5">CLASSIFICATION</div>
          <div
            data-testid="results-classification-badge"
            className={`inline-block px-2.5 py-1 font-mono text-xs sm:text-sm tracking-widest wt-class-${c}`}
          >
            {c.replace(/_/g, ' ')}
          </div>
          <div className="wt-label mt-4 mb-1">DRINKABILITY VERDICT</div>
          <div
            data-testid="drinkability-verdict"
            className="font-display text-base sm:text-lg font-semibold text-zinc-950 leading-snug"
          >
            {analysis.drinkability}
          </div>
          <div className="wt-label mt-4 mb-1.5">CONFIDENCE</div>
          <div className="flex items-center gap-3">
            <div
              data-testid="confidence-badge"
              className={`px-2 py-0.5 font-mono text-[10px] tracking-widest wt-conf-${confUpper}`}
            >
              {confUpper}
            </div>
            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  confUpper === 'HIGH'   ? 'w-full bg-zinc-950' :
                  confUpper === 'MEDIUM' ? 'w-2/3  bg-amber-500' :
                                           'w-1/3  bg-red-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Visual observations */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ScanLine className="w-3.5 h-3.5 text-sky-600" />
            <div className="wt-label">VISUAL OBSERVATIONS</div>
          </div>
          <dl className="divide-y divide-zinc-100 border border-zinc-100 rounded-sm">
            {[
              ['COLOR',          va.color],
              ['CLARITY',        va.clarity],
              ['PARTICLES',      va.particles],
              ['SURFACE',        va.surface],
              ['SOURCE CONTEXT', va.source_context],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-baseline px-3 py-1.5">
                <span className="wt-label">{k}</span>
                <span className="font-mono text-[12px] text-zinc-900 text-right max-w-[60%] break-words">
                  {v || '—'}
                </span>
              </div>
            ))}
          </dl>
        </div>

        {/* Recommendation */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-zinc-700" />
            <div className="wt-label">RECOMMENDATION</div>
          </div>
          <p className="text-[13px] sm:text-sm text-zinc-900 leading-relaxed">
            {analysis.recommendation}
          </p>
        </div>

        {/* CTA to full report */}
        {!compact && analysis.id && (
          <button
            data-testid="view-full-report-btn"
            onClick={() => navigate(`/results/${analysis.id}`)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-950 text-white h-11 px-5 rounded-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            View full report <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
