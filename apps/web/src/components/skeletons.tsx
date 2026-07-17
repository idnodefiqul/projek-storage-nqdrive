/**
 * skeletons.tsx — Skeleton terpusat, anti random & anti layout-shift
 *
 * Prinsip:
 * - Skeleton MUST mirror exact struktur container real (padding, gap, tinggi, rounded sama)
 * - Deterministik — no random width/height
 * - Instant tampil — stagger super cepat (15ms) atau tanpa stagger agar tidak delay masuk menu
 * - Spinner/loader kritis pakai `keep-motion` agar tidak dibunuh reduced-motion
 */

import { motion } from "framer-motion";
import { Skeleton } from "@nqdrive/ui";

// ── Animation variants — INSTANT, no delay (Facebook style) ───────────────────

const containerVariants = {
  hidden: {},
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.015, delayChildren: 0 },
  },
};

const itemVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as const },
  },
};

const bentoSkeletonBase =
  "relative flex flex-col overflow-hidden rounded-[16px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]";

// ── Generic page fallback ────────────────────────────────────────────────────

export function PageSkeleton() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6 h-full"
    >
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </motion.div>
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

// ── Dashboard Overview skeleton — MIRROR bento layout real ───────────────────

export function DashboardIndexSkeleton() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 pb-10"
    >
      {/* ROW 1: Volume + 4 persegi — sama seperti dashboard.index.tsx */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_2.2fr]">
        {/* VolumeBentoCard skeleton — match: h-full p-5 sm:p-6, rounded-[16px], border */}
        <motion.div variants={itemVariants} className="self-stretch">
          <div className={`${bentoSkeletonBase} h-full min-h-[180px] p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-[12px] shrink-0" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-28 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-6 h-10 w-32 rounded-lg" />
            <Skeleton className="mt-5 h-2.5 w-full rounded-full" />
            <div className="mt-3.5 flex gap-3">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          </div>
        </motion.div>

        {/* 4 kotak persegi sejajar — match SquareStatCard min-h */}
        <motion.div variants={itemVariants} className="self-stretch">
          <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 h-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`${bentoSkeletonBase} min-h-[132px] flex-col p-3 sm:min-h-[138px] lg:min-h-0 lg:p-4 xl:p-5`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-3">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-6 w-6 lg:h-8 lg:w-8 rounded-[8px]" />
                </div>
                <Skeleton className="h-7 w-16 rounded mt-2 lg:mt-3" />
                <div className="flex gap-1.5 mt-2 lg:mt-2.5">
                  <Skeleton className="h-3 w-12 rounded" />
                  <Skeleton className="h-3 w-10 rounded-full" />
                </div>
                <Skeleton className="mt-auto h-6 w-full rounded lg:h-10" />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ROW 2: Analitik + Top Regions + Distribusi — tinggi disamakan */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1.8fr_1fr_1fr]">
        <motion.div variants={itemVariants} className="self-stretch md:col-span-2 lg:col-span-1">
          <div className={`${bentoSkeletonBase} h-full min-h-[360px] sm:min-h-[400px] p-0`}>
            <div className="flex items-center justify-between border-b border-[rgb(var(--border-subtle))] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-[10px]" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-[10px]" />
            </div>
            <div className="flex gap-6 px-5 pt-4">
              <Skeleton className="h-10 w-20 rounded-lg" />
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
            <Skeleton className="mx-3 mt-4 h-[260px] w-auto sm:mx-5 rounded-xl" />
          </div>
        </motion.div>

        {Array.from({ length: 2 }).map((_, i) => (
          <motion.div key={i} variants={itemVariants} className="relative self-stretch">
            <div className="h-[420px] lg:absolute lg:inset-0 lg:h-auto">
              <div className={`${bentoSkeletonBase} h-full p-6`}>
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-5 w-36 rounded" />
                  </div>
                  <Skeleton className="h-3 w-48 rounded ml-7 mt-1" />
                </div>
                <div className="flex flex-col gap-3 mt-6">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between rounded-2xl px-1 py-1">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 lg:h-10 lg:w-10 rounded-full shrink-0" />
                        <Skeleton className="h-4 w-24 rounded" />
                      </div>
                      <Skeleton className="h-6 w-8 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ROW 3: kiri File Terbaru + Folder Baru (ikut Top Regions), kanan Populer (ikut Analitik) — streak dihapus, radius 16px sama */}
      <motion.div variants={itemVariants} className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.8fr] lg:items-stretch">
        {/* File Terbaru + Folder Baru — ikut ukuran Top Regions (max-h 320) */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={"bottom-small-"+i} className="relative self-stretch">
            <div className="h-[300px] lg:absolute lg:inset-0 lg:h-auto">
              <div className={`${bentoSkeletonBase} flex h-full max-h-[320px] flex-col p-4 lg:p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-lg" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
                <Skeleton className="mb-3 h-3 w-28 rounded" />
                <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-2.5 rounded-xl p-2">
                      <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
                      <div className="flex-1 flex flex-col gap-1">
                        <Skeleton className="h-3 w-3/4 rounded" />
                        <Skeleton className="h-2 w-1/2 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="hidden lg:block" aria-hidden />
          </div>
        ))}
        {/* Populer — ikut ukuran Analitik (min-h 300/320) */}
        <div className="self-stretch md:col-span-2 lg:col-span-1">
          <div className={`${bentoSkeletonBase} flex h-full min-h-[300px] flex-col p-5 lg:min-h-[320px]`}>
            <div className="mb-4 flex items-center justify-between border-b border-[rgb(var(--border-subtle))]/40 pb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-lg" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <Skeleton className="h-4 w-12 rounded" />
            </div>
            <div className="flex min-h-[200px] flex-1 items-stretch justify-between gap-1.5 px-1 pb-2">
              {Array.from({ length: 5 }).map((_, k) => (
                <div key={k} className="flex h-full w-[18%] flex-col items-stretch justify-end">
                  <Skeleton className="w-full flex-1 rounded-t-xl" style={{ height: "100%" } as any} />
                  <Skeleton className="mt-2 h-2 w-full rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Files page: GRID card skeleton — MIRROR exact FileCard ──────────────────

const FILE_CARD_BASE =
  "relative flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[14px] p-3 text-center sm:gap-2.5 sm:p-3.5 border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]";

export function FilesGridSkeleton({ count = 14 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={FILE_CARD_BASE}>
          {/* Icon — 52px grid center, same as FileCard */}
          <div className="grid h-[52px] w-[52px] place-items-center sm:h-[60px] sm:w-[60px]">
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
          </div>
          <div className="flex w-full flex-col items-center gap-1 px-1">
            <Skeleton className="h-3 w-3/4 rounded" />
            <Skeleton className="h-2.5 w-10 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

export function FilesListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex w-full items-center gap-3 p-3 rounded-[14px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]"
        >
          <Skeleton className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/3 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
          <Skeleton className="h-4 w-4 rounded-full shrink-0" />
        </div>
      ))}
    </>
  );
}

// ── Files table skeleton (fallback legacy) ──────────────────────────────────

export function FilesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr
          key={i}
          className="border-b border-[rgb(var(--border-subtle))]/50"
        >
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          </td>
          <td className="hidden sm:table-cell px-4 py-3 text-right">
            <Skeleton className="h-5 w-10 rounded-full ml-auto" />
          </td>
          <td className="px-4 py-3 text-right pr-6">
            <Skeleton className="h-7 w-7 rounded-md ml-auto" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// ── Google Accounts card grid skeleton ──────────────────────────────────────

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-5 flex flex-col gap-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
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
        </div>
      ))}
    </div>
  );
}

// ── Logs table skeleton ─────────────────────────────────────────────────────

export function LogsSkeletonRows({ cols = 5, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr
          key={i}
          className="border-b border-[rgb(var(--border-subtle))]/50"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className={`h-4 rounded ${j === 0 ? "w-40" : j === cols - 1 ? "w-28" : "w-20"}`} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ── Animated rows wrapper (data actual, BUKAN skeleton) ────────────────────

export function AnimatedRows({ children }: { children: React.ReactNode }) {
  return (
    <tbody>
      {children}
    </tbody>
  );
}

export function AnimatedRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={className}>
      {children}
    </tr>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-4 w-60 rounded-md" />
      </div>
      <div className="rounded-2xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] overflow-hidden shadow-sm">
        <div className="divide-y divide-[rgb(var(--border-subtle))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-4 px-5 sm:px-6 py-5">
              <div className="flex flex-1 items-start gap-3.5">
                <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                <div className="space-y-2 w-full">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </div>
              <div className="sm:w-[320px] shrink-0 flex flex-col gap-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <div className="flex justify-end">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
