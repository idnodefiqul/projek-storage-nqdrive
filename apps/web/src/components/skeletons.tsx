/**
 * skeletons.tsx — Komponen Skeleton terpusat
 *
 * Semua loading state halaman dashboard menggunakan komponen dari sini
 * agar konsisten, staggered, dan mulus tanpa flicker / layout shift.
 */
import { motion } from "framer-motion";
import { Skeleton } from "@nqdrive/ui";

// ── Animation variants ────────────────────────────────────────────────────────

/** Container: stagger children dengan delay 60ms */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

/** Item: fade + subtle slide up */
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
};

// ── Generic page fallback (dipakai oleh Suspense boundary) ───────────────────

export function PageSkeleton() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6 p-4 sm:p-6 h-full"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </motion.div>

      {/* Content area */}
      <motion.div variants={itemVariants}>
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </motion.div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Skeleton className="h-28 w-full rounded-xl" />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── Dashboard Overview skeleton ───────────────────────────────────────────────

export function DashboardIndexSkeleton() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-8 pb-8"
    >
      {/* Heading */}
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-md" />
      </motion.div>

      {/* Chart placeholder */}
      <motion.div variants={itemVariants}>
        <Skeleton className="h-[340px] w-full rounded-xl" />
      </motion.div>

      {/* Stat cards */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-20 rounded-lg" />
          </motion.div>
        ))}
      </motion.div>

      {/* Two-column section */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <motion.div variants={itemVariants} className="col-span-1 lg:col-span-4">
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </motion.div>
        <motion.div variants={itemVariants} className="col-span-1 lg:col-span-3">
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </motion.div>
      </motion.div>

      {/* Bottom two-col */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Skeleton className="h-[240px] w-full rounded-xl" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Skeleton className="h-[240px] w-full rounded-xl" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Files page table skeleton ─────────────────────────────────────────────────

export function FilesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <motion.tbody
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <motion.tr
          key={i}
          variants={itemVariants}
          className="border-b border-zinc-100 dark:border-zinc-800/50"
        >
          {/* Name col */}
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className={`h-4 rounded ${i % 3 === 0 ? "w-[60%]" : i % 3 === 1 ? "w-[75%]" : "w-[50%]"}`} />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          </td>
          {/* Downloads col */}
          <td className="hidden sm:table-cell px-4 py-3 text-right">
            <Skeleton className="h-5 w-10 rounded-full ml-auto" />
          </td>
          {/* Actions col */}
          <td className="px-4 py-3 text-right pr-6">
            <Skeleton className="h-7 w-7 rounded-md ml-auto" />
          </td>
        </motion.tr>
      ))}
    </motion.tbody>
  );
}

// ── Google Accounts card grid skeleton ───────────────────────────────────────

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          variants={itemVariants}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 flex flex-col gap-4"
        >
          {/* Avatar + email */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Skeleton className="h-4 w-[70%] rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
          {/* Status + storage */}
          <div className="mt-auto flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Logs table skeleton rows ──────────────────────────────────────────────────

export function LogsSkeletonRows({ cols = 5, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <motion.tbody
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <motion.tr
          key={i}
          variants={itemVariants}
          className="border-b border-zinc-100 dark:border-zinc-800/50"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton
                className={`h-4 rounded ${
                  j === 0 ? (i % 2 === 0 ? "w-40" : "w-52") :
                  j === cols - 1 ? "w-28" : "w-20"
                }`}
              />
            </td>
          ))}
        </motion.tr>
      ))}
    </motion.tbody>
  );
}

// ── Animated data rows wrapper ────────────────────────────────────────────────
/** Wrap any list of data rows in this for a smooth staggered reveal */
export function AnimatedRows({ children }: { children: React.ReactNode }) {
  return (
    <motion.tbody
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.tbody>
  );
}

export function AnimatedRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.tr variants={itemVariants} className={className}>
      {children}
    </motion.tr>
  );
}

export function SettingsSkeleton() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-8 pb-10"
    >
      {/* Heading */}
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-4 w-60 rounded-md" />
      </motion.div>

      {/* Single Unified Container */}
      <motion.div variants={itemVariants} className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden shadow-sm">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          
          {/* Row 1 */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 px-5 sm:px-6 py-5">
            <div className="flex flex-1 items-start gap-3.5">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-2 w-full">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-4 w-24 rounded mt-4" />
              </div>
            </div>
            <div className="sm:w-[320px] shrink-0">
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="flex justify-end mt-2">
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 px-5 sm:px-6 py-5 bg-zinc-50/30 dark:bg-zinc-900/10">
            <div className="flex flex-1 items-start gap-3.5">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-2 w-full">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-5/6 rounded" />
                <Skeleton className="h-5 w-48 rounded mt-4" />
              </div>
            </div>
            <div className="sm:w-[320px] shrink-0">
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="flex justify-end mt-1">
                <Skeleton className="h-9 w-36 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 sm:px-6 py-5">
            <div className="flex flex-1 items-center gap-3.5">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
            </div>
            <div className="sm:w-[320px] shrink-0">
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>

          {/* Row 4 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 sm:px-6 py-5">
            <div className="flex flex-1 items-center gap-3.5">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-2/3 rounded" />
              </div>
            </div>
            <div className="sm:w-[320px] shrink-0 flex justify-end">
              <Skeleton className="h-5 w-32 rounded" />
            </div>
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}

