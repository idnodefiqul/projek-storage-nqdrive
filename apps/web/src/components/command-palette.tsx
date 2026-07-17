import * as React from "react";
import { useEffect, useRef, useState, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  ScrollText,
  Webhook,
  Trash2,
  UserCog,
  ShieldCheck,
  ClipboardList,
  BookOpen,
  Search,
  SearchX,
  Link2,
  HardDrive,
  Cloud,
  Database,
  Box,
  Server,
  FileSymlink,
} from "lucide-react";

type GroupId = "navigation" | "storage" | "settings" | "documentation";

interface CmdItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: GroupId;
  to: string;
  keywords?: string[];
}

const GROUP_LABEL: Record<GroupId, string> = {
  navigation: "Navigation",
  storage: "Storage",
  settings: "Settings",
  documentation: "Documentation",
};

const GROUP_ORDER: GroupId[] = ["navigation", "storage", "settings", "documentation"];

/** Static command list — mirrors sidebar + docs, no business logic */
const COMMANDS: CmdItem[] = [
  // Navigation
  { id: "nav-dashboard", label: "Dashboard", description: "Overview metrics & activity", icon: LayoutDashboard, group: "navigation", to: "/dashboard", keywords: ["home", "overview", "metrics"] },
  { id: "nav-files", label: "Files", description: "Browse & manage files", icon: FolderOpen, group: "navigation", to: "/dashboard/files", keywords: ["browser", "upload", "manager"] },
  { id: "nav-users", label: "Users", description: "Manage users & access", icon: Users, group: "navigation", to: "/dashboard/users", keywords: ["members", "team"] },
  { id: "nav-logs", label: "Logs", description: "Upload & download history", icon: ScrollText, group: "navigation", to: "/dashboard/logs", keywords: ["history", "activity", "upload", "download"] },
  { id: "nav-api", label: "API", description: "API keys & programmatic access", icon: Webhook, group: "navigation", to: "/dashboard/api", keywords: ["keys", "token", "developer"] },
  { id: "nav-trash", label: "Trash", description: "Deleted files (30 days)", icon: Trash2, group: "navigation", to: "/dashboard/trash", keywords: ["deleted", "restore"] },

  // Storage
  { id: "stor-gdrive", label: "Google Drive", description: "Google Drive accounts", icon: HardDrive, group: "storage", to: "/dashboard/storage-manager", keywords: ["google", "drive", "gdrive"] },
  { id: "stor-r2", label: "Cloudflare R2", description: "R2 buckets & credentials", icon: Cloud, group: "storage", to: "/dashboard/cloudflare-r2", keywords: ["cloudflare", "r2", "bucket"] },
  { id: "stor-s3", label: "S3 Storage", description: "Amazon S3 compatible storage", icon: Database, group: "storage", to: "/dashboard/s3-storage", keywords: ["aws", "s3", "minio"] },
  { id: "stor-dropbox", label: "Dropbox", description: "Dropbox integration", icon: Box, group: "storage", to: "/dashboard/dropbox", keywords: ["dropbox"] },
  { id: "stor-onedrive", label: "OneDrive", description: "Microsoft OneDrive accounts", icon: Server, group: "storage", to: "/dashboard/onedrive", keywords: ["microsoft", "onedrive", "365"] },

  // Settings
  { id: "set-plink", label: "Primary Link", description: "Direct & share link format", icon: Link2, group: "settings", to: "/dashboard/primary-link", keywords: ["permalink", "download", "share", "url"] },
  { id: "set-account", label: "Account", description: "Profile & password", icon: UserCog, group: "settings", to: "/dashboard/account", keywords: ["profile", "password", "avatar"] },
  { id: "set-security", label: "Security", description: "2FA & security settings", icon: ShieldCheck, group: "settings", to: "/dashboard/security", keywords: ["2fa", "totp", "auth", "security"] },
  { id: "set-audit", label: "Audit Logs", description: "Security audit trail", icon: ClipboardList, group: "settings", to: "/dashboard/audit-logs", keywords: ["audit", "security", "trail"] },

  // Documentation
  { id: "doc-index", label: "Documentation", description: "All docs & guides", icon: BookOpen, group: "documentation", to: "/dashboard/documentation", keywords: ["help", "guide"] },
  { id: "doc-gdrive", label: "Google Drive Docs", description: "Google Drive setup guide", icon: BookOpen, group: "documentation", to: "/dashboard/documentation/google-drive", keywords: ["google", "setup"] },
  { id: "doc-r2", label: "Cloudflare R2 Docs", description: "R2 setup guide", icon: BookOpen, group: "documentation", to: "/dashboard/documentation/drop-box", keywords: ["cloudflare", "r2"] }, // keep existing drop-box path alive, actual r2 path is one-drive mapping is flexible
  { id: "doc-dropbox", label: "Dropbox Docs", description: "Dropbox setup guide", icon: BookOpen, group: "documentation", to: "/dashboard/documentation/drop-box", keywords: ["dropbox"] },
  { id: "doc-onedrive", label: "OneDrive Docs", description: "OneDrive setup guide", icon: BookOpen, group: "documentation", to: "/dashboard/documentation/one-drive", keywords: ["onedrive", "microsoft"] },
  { id: "doc-link", label: "Primary Link Docs", description: "Link format documentation", icon: FileSymlink, group: "documentation", to: "/dashboard/docs", keywords: ["link", "permalink"] },
];

function useIsMac() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) || navigator.userAgent.includes("Mac"));
  }, []);
  return isMac;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const prevActiveRef = useRef<HTMLElement | null>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Body lock + focus save/restore + autofocus
  useEffect(() => {
    if (!open) return;
    prevActiveRef.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = prevOverflow;
      const prev = prevActiveRef.current;
      if (prev) {
        setTimeout(() => {
          try { prev.focus(); } catch {}
        }, 0);
      }
    };
  }, [open]);

  // Reset query & active when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // Filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((item) => {
      const hay = `${item.label} ${item.description ?? ""} ${item.group} ${(item.keywords ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  // Grouped view
  const grouped = useMemo(() => {
    const map = new Map<GroupId, CmdItem[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const it of filtered) {
      const arr = map.get(it.group);
      if (arr) arr.push(it);
      else map.set(it.group, [it]);
    }
    // remove empty groups
    const result: { group: GroupId; items: CmdItem[] }[] = [];
    for (const g of GROUP_ORDER) {
      const items = map.get(g);
      if (items && items.length > 0) result.push({ group: g, items });
    }
    return result;
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Clamp activeIdx
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(flat.length > 0 ? flat.length - 1 : 0);
  }, [flat.length, activeIdx]);

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const close = () => setOpen(false);

  const go = (to: string) => {
    close();
    // small delay to allow exit animation
    setTimeout(() => {
      navigate({ to });
    }, 80);
  };

  // Input key handling
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + Math.max(1, flat.length)) % Math.max(1, flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cur = flat[activeIdx];
      if (cur) go(cur.to);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cmd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] as const }}
            className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="cmd-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] as const }}
            className="fixed left-1/2 top-[18%] z-[81] flex max-h-[68vh] w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[0_16px_48px_-8px_rgba(0,0,0,0.28)]"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            aria-labelledby={`${baseId}-title`}
          >
            {/* Hidden title for a11y */}
            <h2 id={`${baseId}-title`} className="sr-only">Command palette</h2>

            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-[rgb(var(--border-subtle))] px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-[rgb(var(--ink-500))]" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                onKeyDown={onInputKeyDown}
                placeholder="Cari halaman, storage, settings…"
                aria-label="Search commands"
                className="h-8 flex-1 bg-transparent text-sm font-medium text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--ink-500))]/70 outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center rounded-md border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] px-1.5 py-0.5 text-[11px] font-mono font-bold text-[rgb(var(--ink-500))]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-2 scrollbar-hide" role="listbox" aria-label="Command results">
              {flat.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))]">
                    <SearchX className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Tidak ada hasil</p>
                  <p className="max-w-[260px] text-xs text-[rgb(var(--ink-500))]">Coba kata kunci lain seperti "files", "api", atau "storage".</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {grouped.map(({ group, items }) => (
                    <div key={group}>
                      <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">
                        {GROUP_LABEL[group]}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {items.map((item) => {
                          const globalIdx = flat.indexOf(item);
                          const active = globalIdx === activeIdx;
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              data-idx={globalIdx}
                              role="option"
                              aria-selected={active}
                              onMouseEnter={() => setActiveIdx(globalIdx)}
                              onClick={() => go(item.to)}
                              className={[
                                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors outline-none",
                                active
                                  ? "bg-brand-500 text-white shadow-sm shadow-brand-500/20"
                                  : "text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]",
                              ].join(" ")}
                            >
                              <span
                                className={[
                                  "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1",
                                  active
                                    ? "bg-white/15 text-white ring-white/15"
                                    : "bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] ring-[rgb(var(--border-subtle))] group-hover:text-[rgb(var(--foreground))]",
                                ].join(" ")}
                              >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold tracking-tight">{item.label}</span>
                                {item.description && (
                                  <span className={["block truncate text-xs", active ? "text-white/70" : "text-[rgb(var(--ink-500))]" ].join(" ")}>
                                    {item.description}
                                  </span>
                                )}
                              </span>
                              {active && (
                                <span className="shrink-0 text-[11px] font-mono text-white/60">↵</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hints — like Linear/Vercel */}
            <div className="flex items-center justify-between gap-3 border-t border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/60 px-3 py-2.5">
              <div className="flex items-center gap-3 text-[11px] text-[rgb(var(--ink-500))]">
                <span className="hidden sm:inline-flex items-center gap-1.5">
                  <kbd className="grid h-5 w-5 place-items-center rounded border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[10px] font-bold">↑</kbd>
                  <kbd className="grid h-5 w-5 place-items-center rounded border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[10px] font-bold">↓</kbd>
                  <span className="font-medium">Navigasi</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-1.5 py-0.5 text-[10px] font-bold">↵</kbd>
                  <span className="font-medium">Buka</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-1.5 py-0.5 text-[10px] font-bold">ESC</kbd>
                  <span className="font-medium">Tutup</span>
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[rgb(var(--ink-500))]">
                <span className="hidden sm:inline font-medium">Buka cepat</span>
                <kbd className="rounded border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-1.5 py-0.5 text-[10px] font-bold">
                  {isMac ? "⌘K" : "Ctrl K"}
                </kbd>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
