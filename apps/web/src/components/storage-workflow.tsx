import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@nqdrive/ui";
import { SectionCard, StatCard } from "./ui-kit";
import { useDashboardMetrics } from "../hooks/use-dashboard";
import { useUploadGlobal } from "../stores/upload-provider";
import { useDriveAccounts } from "../hooks/use-drive-accounts";
import { useTheme } from "../stores/theme-provider";
import { formatBytes } from "@nqdrive/shared";
import { HardDrive, FileText, Users, Waypoints } from "lucide-react";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import type { PublicDriveAccount, StorageProviderType } from "@nqdrive/types";
import {
  iconsidePng,
  googleDriveSvg,
  cloudflareR2Svg,
  amazonS3Svg,
  onedriveSvg,
} from "../assets";

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";
const EMPTY_ACCOUNTS: PublicDriveAccount[] = [];

type NodeStatus = "online" | "uploading" | "error" | "offline";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 3) return local[0] + "***@" + domain;
  return local.slice(0, 3) + "***@" + domain;
}

function accountAvatar(email: string) {
  return `https://avatar.vercel.sh/${encodeURIComponent(email)}?size=80`;
}

// ─── PROVIDER META (mudah ditambah provider baru tanpa ubah workflow) ─────────
const PROVIDER_ICON: Partial<Record<StorageProviderType, string>> = {
  google_drive: googleDriveSvg,
  cloudflare_r2: cloudflareR2Svg,
  amazon_s3: amazonS3Svg,
  onedrive: onedriveSvg,
};

const PROVIDER_LABEL: Record<StorageProviderType, string> = {
  google_drive: "Google Drive",
  cloudflare_r2: "Cloudflare R2",
  amazon_s3: "Amazon S3",
  backblaze_b2: "Backblaze B2",
  wasabi: "Wasabi",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  minio: "MinIO",
  telegram: "Telegram",
};

/** Ikon provider — pakai SVG jika ada, Dropbox pakai React Simple Icons, fallback ikon generik. */
function ProviderGlyph({ provider, className }: { provider: StorageProviderType; className?: string }) {
  if (provider === "dropbox") return <SiDropbox color="#0061FF" className={className} />;
  const src = PROVIDER_ICON[provider];
  if (src) return <img src={src} alt={PROVIDER_LABEL[provider]} className={className} />;
  return <HardDrive className={className} />;
}

// ─── STATUS META ────────────────────────────────────────────────────────────
const STATUS: Record<NodeStatus, { edge: string; dot: string; label: string }> = {
  online: { edge: "#10b981", dot: "bg-emerald-500", label: "Online" },
  uploading: { edge: "#3b82f6", dot: "bg-blue-500 animate-pulse", label: "Mengunggah" },
  error: { edge: "#ef4444", dot: "bg-red-500", label: "Error" },
  offline: { edge: "#a1a1aa", dot: "bg-zinc-400", label: "Offline" },
};

// ─── CUSTOM NODES ─────────────────────────────────────────────────────────────
const handleCls = "!h-2 !w-2 !border-2 !border-white dark:!border-zinc-900 !bg-brand-500";

type SourceData = { title: string; subtitle: string; icon: string };
function SourceNode({ data }: NodeProps) {
  const d = data as unknown as SourceData;
  return (
    <div className="flex h-28 w-32 flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/10">
        <img src={d.icon} alt="" className="h-6 w-6 object-contain" />
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</p>
        <p className="text-[10px] text-zinc-400">{d.subtitle}</p>
      </div>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </div>
  );
}

type GatewayData = { status: NodeStatus; count: number; providers: StorageProviderType[] };
function GatewayNode({ data }: NodeProps) {
  const d = data as unknown as GatewayData;
  const s = STATUS[d.status];
  const provs = d.providers.length ? d.providers : (["google_drive"] as StorageProviderType[]);
  return (
    <div
      className="flex h-28 w-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white p-3 shadow-md dark:bg-zinc-900"
      style={{ borderColor: s.edge }}
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl bg-zinc-50 px-2 dark:bg-zinc-800/60">
        {provs.slice(0, 3).map((p) => (
          <ProviderGlyph key={p} provider={p} className="h-6 w-6 object-contain" />
        ))}
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Gateway</p>
        <p className="text-[10px] text-zinc-400">
          {d.count} akun · {s.label}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </div>
  );
}

type AccountData = {
  email: string;
  provider: StorageProviderType;
  status: NodeStatus;
  usedPct: number;
  usedLabel: string;
  totalLabel: string;
};
function AccountNode({ data }: NodeProps) {
  const d = data as unknown as AccountData;
  const s = STATUS[d.status];
  return (
    <div
      className="flex w-52 flex-col gap-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm dark:bg-zinc-900"
      style={{ borderColor: d.status === "online" ? undefined : s.edge }}
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex items-center gap-2.5">
        {/* Avatar akun + badge provider */}
        <div className="relative h-8 w-8 shrink-0">
          <img
            src={accountAvatar(d.email)}
            alt=""
            className="h-8 w-8 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-800"
          />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
            <ProviderGlyph provider={d.provider} className="h-2.5 w-2.5 object-contain" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300" title={d.email}>
            {maskEmail(d.email)}
          </p>
          <p className="text-[10px] text-zinc-400">{s.label}</p>
        </div>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
      </div>
      {/* mini bar penggunaan storage */}
      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
          <div
            className="h-full rounded-full"
            style={{ width: `${d.usedPct}%`, backgroundColor: s.edge }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] text-zinc-400">
          <span>{d.usedLabel}</span>
          <span>{d.totalLabel}</span>
        </div>
      </div>
    </div>
  );
}

function PlaceholderNode() {
  return (
    <div className="flex w-52 items-center justify-center rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
      Belum ada akun terhubung
    </div>
  );
}

type MoreData = { count: number };
function MoreNode({ data }: NodeProps) {
  const d = data as unknown as MoreData;
  return (
    <div className="flex w-52 items-center justify-center rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-center text-[10px] font-medium text-zinc-400 dark:border-zinc-700">
      +{d.count} akun lainnya
    </div>
  );
}

const nodeTypes: NodeTypes = {
  source: SourceNode,
  gateway: GatewayNode,
  account: AccountNode,
  placeholder: PlaceholderNode,
  more: MoreNode,
};

// ─── FLOW BUILDER ─────────────────────────────────────────────────────────────
const ACCOUNT_GAP = 104;
const COL_SOURCE = 0;
const COL_GATEWAY = 230;
const COL_ACCOUNTS = 470;

function WorkflowCanvas({
  accounts,
  extra,
  statusOf,
  hubStatus,
  providers,
}: {
  accounts: PublicDriveAccount[];
  extra: number;
  statusOf: (id: number) => NodeStatus;
  hubStatus: NodeStatus;
  providers: StorageProviderType[];
}) {
  const rf = useReactFlow();
  const { theme } = useTheme();

  const { computedNodes, computedEdges } = useMemo(() => {
    const n = accounts.length;
    const centerY = n > 0 ? ((n - 1) * ACCOUNT_GAP) / 2 : 0;

    const nodes: Node[] = [
      {
        id: "source",
        type: "source",
        position: { x: COL_SOURCE, y: centerY },
        data: { title: SITE_NAME, subtitle: "Sumber", icon: iconsidePng },
        draggable: false,
        selectable: false,
      },
      {
        id: "gateway",
        type: "gateway",
        position: { x: COL_GATEWAY, y: centerY },
        data: { status: hubStatus, count: accounts.length, providers },
        draggable: false,
        selectable: false,
      },
    ];

    const edges: Edge[] = [
      {
        id: "e-source-gateway",
        source: "source",
        target: "gateway",
        type: "straight",
        animated: true,
        style: { stroke: STATUS[hubStatus].edge, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: STATUS[hubStatus].edge },
      },
    ];

    if (n === 0) {
      nodes.push({
        id: "placeholder",
        type: "placeholder",
        position: { x: COL_ACCOUNTS, y: 0 },
        data: {},
        draggable: false,
        selectable: false,
      });
    } else {
      accounts.forEach((acc, i) => {
        const status = statusOf(acc.id);
        const total = acc.totalStorageBytes || 0;
        const used = acc.usedStorageBytes || 0;
        const usedPct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
        nodes.push({
          id: `acc-${acc.id}`,
          type: "account",
          position: { x: COL_ACCOUNTS, y: i * ACCOUNT_GAP },
          data: {
            email: acc.email,
            provider: acc.provider,
            status,
            usedPct,
            usedLabel: formatBytes(used),
            totalLabel: formatBytes(total),
          },
          draggable: false,
          selectable: false,
        });
        edges.push({
          id: `e-gateway-acc-${acc.id}`,
          source: "gateway",
          target: `acc-${acc.id}`,
          animated: status !== "offline",
          style: { stroke: STATUS[status].edge, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: STATUS[status].edge },
        });
      });

      if (extra > 0) {
        nodes.push({
          id: "more",
          type: "more",
          position: { x: COL_ACCOUNTS, y: n * ACCOUNT_GAP },
          data: { count: extra },
          draggable: false,
          selectable: false,
        });
      }
    }

    return { computedNodes: nodes, computedEdges: edges };
  }, [accounts, extra, statusOf, hubStatus, providers]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  // Re-fit hanya ketika struktur (jumlah akun) berubah — bukan saat status upload
  const structureKey = accounts.map((a) => a.id).join(",");
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [structureKey, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      colorMode={theme === "dark" ? "dark" : "light"}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      panOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}


// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function StorageWorkflow() {
  const { data: metrics } = useDashboardMetrics();
  const { data: driveAccountsData } = useDriveAccounts();
  const { items } = useUploadGlobal();
  const summary = metrics?.summary;
  const usedPct =
    summary && summary.totalStorageBytes > 0
      ? Math.min(100, (summary.usedStorageBytes / summary.totalStorageBytes) * 100)
      : 0;

  const allAccounts = driveAccountsData?.accounts ?? EMPTY_ACCOUNTS;
  // Urutkan stabil berdasarkan id agar posisi node tidak berubah saat data refetch.
  const shown = useMemo(
    () => [...allAccounts].sort((a, b) => a.id - b.id).slice(0, 6),
    [allAccounts]
  );
  const extra = allAccounts.length - shown.length;

  // Signature stabil: nilai hanya berubah saat status upload benar-benar berubah,
  // BUKAN saat progress bytes bertambah → mencegah rebuild node/edge (animasi mulus).
  const uploadSignature = useMemo(() => {
    const parts: string[] = [];
    for (const item of items) {
      const accId = item.targetAccountId ?? item.accountId;
      if (accId == null) continue;
      if (item.status === "error" || item.status === "uploading") {
        parts.push(`${accId}:${item.status}`);
      }
    }
    return parts.sort().join(",");
  }, [items]);

  const uploadStatusMap = useMemo(() => {
    const map: Record<number, "uploading" | "error"> = {};
    if (uploadSignature) {
      for (const pair of uploadSignature.split(",")) {
        const [id, st] = pair.split(":");
        const accId = Number(id);
        if (st === "error") map[accId] = "error";
        else if (st === "uploading" && map[accId] !== "error") map[accId] = "uploading";
      }
    }
    return map;
  }, [uploadSignature]);

  const statusOf = useMemo(() => {
    const byId: Record<number, NodeStatus> = {};
    for (const acc of allAccounts) {
      const up = uploadStatusMap[acc.id];
      if (up) byId[acc.id] = up;
      else if (acc.status === "error") byId[acc.id] = "error";
      else if (acc.status === "syncing") byId[acc.id] = "uploading";
      else if (acc.status === "offline") byId[acc.id] = "offline";
      else byId[acc.id] = "online";
    }
    return (id: number): NodeStatus => byId[id] ?? "online";
  }, [allAccounts, uploadStatusMap]);

  const hubStatus = useMemo<NodeStatus>(() => {
    const statuses = shown.map((a) => statusOf(a.id));
    if (statuses.includes("error")) return "error";
    if (statuses.includes("uploading")) return "uploading";
    return "online";
  }, [shown, statusOf]);

  // Provider unik yang terhubung → ikon di gateway (otomatis muncul Cloudflare dll).
  const providers = useMemo(() => {
    const set = new Set<StorageProviderType>();
    for (const a of shown) set.add(a.provider);
    return Array.from(set);
  }, [shown]);

  const liveBadge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-600 ring-1 ring-brand-500/15 dark:text-brand-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
      </span>
      Live
    </span>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* ── Workflow diagram (React Flow) — kartu netral ─────────────── */}
      <SectionCard
        title="Storage Workflow"
        icon={Waypoints}
        action={liveBadge}
        className="lg:col-span-2"
        bodyClassName="p-0"
      >
        <div className="relative h-[320px] w-full sm:h-[400px]">
          <ReactFlowProvider>
            <WorkflowCanvas
              accounts={shown}
              extra={extra}
              statusOf={statusOf}
              hubStatus={hubStatus}
              providers={providers}
            />
          </ReactFlowProvider>
        </div>
      </SectionCard>

      {/* ── KPI cards (StatCard, satu keluarga dgn seluruh dashboard) ── */}
      <div className="flex flex-col gap-4">
        <StatCard
          label="Total Storage"
          value={summary ? formatBytes(summary.totalStorageBytes) : "—"}
          icon={HardDrive}
          tone="brand"
          hint={summary ? `${formatBytes(summary.usedStorageBytes)} terpakai · ${Math.round(usedPct)}%` : undefined}
        />
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Total File"
            value={summary ? summary.totalFiles.toLocaleString("id-ID") : "—"}
            icon={FileText}
            tone="violet"
          />
          <StatCard
            label="Akun aktif"
            value={summary ? `${summary.onlineAccounts}/${summary.totalAccounts}` : "—"}
            icon={Users}
            tone="emerald"
          />
        </div>
      </div>
    </div>
  );
}
