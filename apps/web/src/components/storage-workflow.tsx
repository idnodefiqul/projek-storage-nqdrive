import { forwardRef, useEffect, useRef, useState, createRef, useMemo } from "react";
import { Card, AnimatedBeam, cn } from "@nqdrive/ui";
import { useDashboardMetrics } from "../hooks/use-dashboard";
import { useUploadGlobal } from "../stores/upload-provider";
import { useDriveAccounts } from "../hooks/use-drive-accounts";
import { formatBytes } from "@nqdrive/shared";
import { HardDrive, File as FileIcon, UserCircle2, Cloud, type LucideIcon } from "lucide-react";
import { iconsidePng, googleDriveSvg } from "../assets";

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 3) return local[0] + "***@" + domain;
  return local.slice(0, 3) + "***@" + domain;
}

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white p-1.5 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)] dark:border-zinc-800 dark:bg-zinc-900 sm:h-9 sm:w-9 sm:p-2 md:h-10 md:w-10 md:p-2.5",
        className
      )}
    >
      {children}
    </div>
  );
});
Circle.displayName = "Circle";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="p-2.5 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2 lg:mb-3">
          <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
          <div className={`flex h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 items-center justify-center rounded-md sm:rounded-lg ${bg}`}>
            <Icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 ${color}`} />
          </div>
        </div>
        <div className="text-base sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{value}</div>
      </div>
    </Card>
  );
}

export function StorageWorkflow() {
  const { data: metrics } = useDashboardMetrics();
  const { data: driveAccountsData } = useDriveAccounts();
  const { items } = useUploadGlobal();
  const summary = metrics?.summary;

  // Use driveAccounts from API which has id field for matching
  const allAccounts = driveAccountsData?.accounts ?? [];
  const shown = allAccounts.slice(0, 5);
  const extra = allAccounts.length - shown.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const accountRefs = useRef<React.RefObject<HTMLDivElement | null>[]>([]);

  // Per-account upload status mapping: accountId -> "uploading" | "error" | "normal"
  const accountStatusMap = useMemo(() => {
    const map: Record<number, "uploading" | "error" | "normal"> = {};
    for (const item of items) {
      const accId = item.targetAccountId ?? item.accountId;
      if (accId == null) continue;
      if (item.status === "error") {
        map[accId] = "error";
      } else if (item.status === "uploading" && map[accId] !== "error") {
        map[accId] = "uploading";
      }
    }
    return map;
  }, [items]);

  // Get beam color for specific account
  const getBeamColors = (accountId: number): { start: string; end: string; duration: number } => {
    const status = accountStatusMap[accountId];
    if (status === "error") return { start: "#ef4444", end: "#f87171", duration: 3 };
    if (status === "uploading") return { start: "#3b82f6", end: "#60a5fa", duration: 1.5 };
    return { start: "#10b981", end: "#34d399", duration: 3 };
  };

  // Get border class for specific account
  const getAccountBorderClass = (accountId: number): string => {
    const status = accountStatusMap[accountId];
    if (status === "error") return "!border-red-500";
    if (status === "uploading") return "!border-blue-500";
    return "";
  };

  // Hub border: show error if any account has error, uploading if any is uploading
  const hubBorderClass = useMemo(() => {
    const statuses = Object.values(accountStatusMap);
    if (statuses.includes("error")) return "!border-red-500";
    if (statuses.includes("uploading")) return "!border-blue-500";
    return "";
  }, [accountStatusMap]);

  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
      <Card className="overflow-hidden lg:col-span-2">
        <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-0.5 sm:px-4 sm:pt-4 sm:pb-1 lg:px-6 lg:pt-6 lg:pb-2">
          <Cloud className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-brand-500" />
          <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-zinc-500 dark:text-zinc-400">Workflows Storage</p>
        </div>

        <div
          ref={containerRef}
          className="relative flex h-[200px] sm:h-[260px] md:h-[300px] lg:h-[360px] w-full items-center justify-center overflow-hidden p-2 sm:p-4 lg:p-6"
        >
          <div className="flex w-full max-w-md flex-row items-stretch justify-between gap-2 sm:gap-4 lg:gap-6">
            {/* Kiri: Logo Web */}
            <div className="flex flex-col items-center justify-center">
              <div ref={outputRef} className="z-10 flex items-center justify-center">
                <img src={iconsidePng} alt="Logo" className="h-6 sm:h-7 md:h-8 lg:h-10 w-auto object-contain" />
              </div>
              <span className="mt-0.5 text-center text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold text-zinc-700 dark:text-zinc-200 sm:mt-1 lg:mt-1.5">{SITE_NAME}</span>
            </div>

            {/* Tengah: Google Drive */}
            <div className="flex flex-col items-center justify-center">
              <Circle ref={hubRef} className={hubBorderClass}>
                <img src={googleDriveSvg} alt="Google Drive" className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5 object-contain" />
              </Circle>
              <span className="mt-0.5 text-center text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold text-zinc-700 dark:text-zinc-200 sm:mt-1 lg:mt-1.5">GDrive Gateway</span>
            </div>

            {/* Kanan: akun terhubung */}
            <div className="flex flex-col justify-center gap-1 sm:gap-1.5 lg:gap-2.5">
              {shown.length === 0 ? (
                <span className="text-[7px] sm:text-[8px] lg:text-[10px] text-zinc-400">Belum ada akun</span>
              ) : (
                shown.map((acc, i) => {
                  if (!accountRefs.current[i]) accountRefs.current[i] = createRef<HTMLDivElement | null>();
                  const ref = accountRefs.current[i]!;
                  const borderClass = getAccountBorderClass(acc.id);
                  return (
                    <div key={acc.email} className="flex flex-col items-center gap-0.5 sm:gap-0.5 lg:gap-1">
                      <Circle ref={ref} className={cn("!h-6 !w-6 sm:!h-7 sm:!w-7 md:!h-8 md:!w-8 lg:!h-8 lg:!w-8", borderClass)}>
                        <img src={googleDriveSvg} alt="Google Drive" className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 object-contain" />
                      </Circle>
                      <span className="max-w-[52px] sm:max-w-[64px] md:max-w-[80px] lg:max-w-[96px] truncate text-center text-[6px] sm:text-[7px] md:text-[8px] lg:text-[9px] font-medium text-zinc-500 dark:text-zinc-400" title={acc.email}>
                        {maskEmail(acc.email)}
                      </span>
                    </div>
                  );
                })
              )}
              {extra > 0 && (
                <span className="text-center text-[6px] sm:text-[7px] lg:text-[9px] font-medium text-zinc-400">+{extra} lagi</span>
              )}
            </div>
          </div>

          {/* Animated Beams: Logo Web → GDrive Gateway → Akun */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={outputRef}
            toRef={hubRef}
            duration={3}
            gradientStartColor="#10b981"
            gradientStopColor="#34d399"
          />
          {shown.map((acc, i) => {
            const colors = getBeamColors(acc.id);
            return (
              <AnimatedBeam
                key={acc.email}
                containerRef={containerRef}
                fromRef={hubRef}
                toRef={accountRefs.current[i] ?? { current: null }}
                duration={colors.duration}
                gradientStartColor={colors.start}
                gradientStopColor={colors.end}
              />
            );
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:gap-3 lg:gap-4">
        <StatCard
          label="Total Storage"
          value={summary ? formatBytes(summary.totalStorageBytes) : "—"}
          icon={HardDrive}
          color="text-blue-500"
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
          <StatCard
            label="Total File"
            value={summary ? String(summary.totalFiles) : "—"}
            icon={FileIcon}
            color="text-emerald-500"
            bg="bg-emerald-50 dark:bg-emerald-900/20"
          />
          <StatCard
            label="GDrive Accounts"
            value={summary ? `${summary.onlineAccounts}/${summary.totalAccounts}` : "—"}
            icon={UserCircle2}
            color="text-amber-500"
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
        </div>
      </div>
    </div>
  );
}
