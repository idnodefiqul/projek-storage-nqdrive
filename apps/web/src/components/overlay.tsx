import { motion, AnimatePresence } from "framer-motion";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950"
        >
          {/* Glow rings */}
          <div className="relative flex items-center justify-center h-20 w-20">
            <motion.div
              className="absolute h-20 w-20 rounded-full bg-brand-500/20 dark:bg-brand-500/10"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute h-16 w-16 rounded-full bg-brand-500/15 dark:bg-brand-500/10"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
            <motion.div
              className="absolute h-10 w-10 rounded-full bg-brand-500/25 dark:bg-brand-500/15"
              animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0.2, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            />
          </div>

          {/* Progress bar */}
          <div className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <motion.div
              className="h-full rounded-full bg-brand-500"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: "40%" }}
            />
          </div>

          {message && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-4 text-sm font-medium text-zinc-400 dark:text-zinc-500"
            >
              {message}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
