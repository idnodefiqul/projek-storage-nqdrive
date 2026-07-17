/**
 * PageTransition — fade-in halus saat page mount.
 * Facebook style: instant mount, subtle fade (120ms), NO willChange persisten,
 * NO layoutId, NO exit wait block.
 */
import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Cleanup will-change setelah animasi selesai — hemat GPU
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.style.willChange = "";
    }, 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ willChange: "opacity" }}
      onAnimationComplete={() => {
        if (ref.current) ref.current.style.willChange = "";
      }}
      className={`h-full w-full page-transition-content ${className}`}
    >
      {children}
    </motion.div>
  );
}
