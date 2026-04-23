import { motion, AnimatePresence } from 'framer-motion';

const DOT = {
  scanning:   { cls: 'bg-sky-500',   ring: 'shadow-[0_0_8px_rgba(14,165,233,0.55)]', pulse: true,  label: 'SCANNING' },
  processing: { cls: 'bg-amber-500', ring: 'shadow-[0_0_8px_rgba(245,158,11,0.55)]', pulse: true,  label: 'PROCESSING' },
  stopped:    { cls: 'bg-red-500',   ring: '',                                        pulse: false, label: 'STOPPED' },
  idle:       { cls: 'bg-zinc-300',  ring: '',                                        pulse: false, label: 'IDLE' },
};

/**
 * StatusBadge — 🟢 scanning · 🟡 processing · 🔴 stopped
 * Used by both CameraScanner and Upload flows.
 */
export default function StatusBadge({ status = 'idle', label }) {
  const s = DOT[status] || DOT.idle;
  return (
    <div
      data-testid={`status-badge-${status}`}
      className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-zinc-200 rounded-sm"
    >
      <span className={`relative inline-block w-2 h-2 rounded-full ${s.cls} ${s.ring}`}>
        {s.pulse && (
          <span className={`absolute inset-0 rounded-full ${s.cls} opacity-60 animate-ping`} />
        )}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          className="font-mono text-[10px] tracking-[0.22em] text-zinc-700"
        >
          {label || s.label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
