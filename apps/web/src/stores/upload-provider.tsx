import { createContext, useContext, useCallback, useRef, useState, useMemo, useEffect, type ReactNode } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuthContext } from "./auth-provider";
import { logService } from "../services/log.service";
import type { CancelJobMsg, StartJobMsg, WorkerToMainMsg } from "../workers/upload-protocol";

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export type UploadItemStatus = "queued" | "uploading" | "success" | "error" | "cancelled" | "paused";

export interface UploadItem {
  id: string;
  file: File;
  folderId: string | null;
  status: UploadItemStatus;
  progress: UploadProgress;
  errorMessage?: string;
  sessionId?: string;
  accountId?: string;
  targetAccountId?: string | null;
  provider?: string;
}

export type CopyItemStatus = "queued" | "copying" | "success" | "error" | "cancelled";

export interface CopyItem {
  id: string;
  sourceFileId: string;
  sourceFilename: string;
  sourceSize: number;
  sourceProvider?: string;
  targetFolderId: string | null;
  targetFolderPath: string | null;
  status: CopyItemStatus;
  progress: UploadProgress;
  errorMessage?: string;
  newFileId?: string;
}

// Simplified serializable item for storage history
export interface RecentUploadItem {
  id: string;
  name: string;
  size: number;
  status: UploadItemStatus;
  errorMessage?: string;
  timestamp: number;
}

export interface UploadContextValue {
  items: UploadItem[];
  recentItems: RecentUploadItem[];
  copyItems: CopyItem[];
  addFilesToQueue: (files: FileList | File[], folderId?: string | null, targetAccountId?: string | null) => void;
  setTargetAccount: (id: string, accountId: string | null, provider?: string) => void;
  startUpload: (id: string) => Promise<void>;
  startAllUploads: () => void;
  pauseUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  clearRecent: () => void;
  addCopyJob: (file: { fileId: string; filename: string; sizeBytes: number; provider?: string }, targetFolderId: string | null, targetFolderPath?: string | null) => string;
  startCopy: (id: string) => Promise<void>;
  cancelCopy: (id: string) => void;
  removeCopyItem: (id: string) => void;
  isUploadSidebarOpen: boolean;
  setUploadSidebarOpen: (open: boolean) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
// 60 MB — kelipatan 256 KB (Google Drive) & 320 KiB (OneDrive). Chunk lebih besar
// = lebih sedikit batas antar-chunk, progress bar lebih mulus.
const CHUNK_SIZE = 60 * 1024 * 1024;

// Maksimal file yang di-upload bersamaan. Tanpa batas, N file besar berebut
// bandwidth upstream dan semuanya jadi lemot; 3 memberi throughput penuh
// tanpa saling mencekik.
const MAX_CONCURRENT_UPLOADS = 3;

// Loop chunk + XHR + creep timer berjalan di dedicated Web Worker
// (src/workers/upload.worker.ts) supaya bebas dari throttling tab background —
// inilah penyebab upload dulu "membeku" saat tab ditinggal.

const STORAGE_DISMISSED_KEY = "nqdrive-dismissed-uploads";

export function UploadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const [copyItemsMap, setCopyItemsMap] = useState<Record<string, CopyItem>>({});
  const [isUploadSidebarOpen, setUploadSidebarOpen] = useState(false);

  // Local storage to persist user-dismissed DB log IDs
  const [dismissedRecentIds, setDismissedRecentIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_DISMISSED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveDismissedIds = (ids: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  };

  const hasActiveUploads = useMemo(
    () =>
      Object.values(items).some((i) => i.status === "uploading" || i.status === "queued") ||
      Object.values(copyItemsMap).some((c) => c.status === "copying" || c.status === "queued"),
    [items, copyItemsMap]
  );

  // Peringatan native saat user mau menutup tab ketika masih ada upload aktif.
  // Register hanya saat aktif agar tidak merusak bfcache saat idle.
  useEffect(() => {
    if (!hasActiveUploads) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveUploads]);

  // Load from DB via listUploads — hanya polling saat ada upload aktif atau sidebar terbuka
  const { data: dbLogs } = useQuery({
    queryKey: ["logs", "uploads"],
    queryFn: logService.listUploads,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: hasActiveUploads || isUploadSidebarOpen ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    enabled: !!user,
  });

  // Map DB logs to recentItems
  const recentItems = useMemo(() => {
    if (!dbLogs?.logs) return [];
    return dbLogs.logs
      .map((log) => {
        const id = `db-${log.logId}`;
        let status: UploadItemStatus = "success";
        if (log.status === "failed") status = "error";
        else if (log.status === "cancelled") status = "cancelled";

        return {
          id,
          name: log.filename,
          size: log.size_bytes,
          status,
          errorMessage: log.error_message || undefined,
          timestamp: new Date(log.created_at).getTime(),
        } as RecentUploadItem;
      })
      .filter((item) => !dismissedRecentIds.has(item.id));
  }, [dbLogs, dismissedRecentIds]);

  // AbortController hanya untuk fase pembuatan session (fetch di main thread);
  // fase chunk dikelola worker via pesan cancel.
  const abortControllers = useRef<Record<string, AbortController>>({});
  const copyAbortControllers = useRef<Record<string, AbortController>>({});
  const copyProgressIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // ── State antrian & worker (ref agar tidak kena stale closure) ─────────
  const uploadWorkerRef = useRef<Worker | null>(null);
  const activeUploadIds = useRef<Set<string>>(new Set());
  const uploadStartTimes = useRef<Record<string, number>>({});
  // Intent saat user menekan pause vs cancel — worker hanya tahu "cancel".
  const cancelIntent = useRef<Record<string, "pause" | "cancel">>({});

  // Cleanup abort controllers on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((controller) => controller.abort());
      abortControllers.current = {};
      Object.values(copyAbortControllers.current).forEach((controller) => controller.abort());
      copyAbortControllers.current = {};
      Object.values(copyProgressIntervals.current).forEach((i) => clearInterval(i));
      copyProgressIntervals.current = {};
      uploadWorkerRef.current?.terminate();
      uploadWorkerRef.current = null;
      activeUploadIds.current.clear();
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const updated = { ...existing, ...patch };

      if (
        patch.status === "success" ||
        patch.status === "error" ||
        patch.status === "cancelled"
      ) {
        // Invalidate DB logs query so the finished item shows up in recentItems from the DB
        queryClient.invalidateQueries({ queryKey: ["logs", "uploads"] });

        const next = { ...prev };
        delete next[id];
        return next;
      }

      return { ...prev, [id]: updated };
    });
  }, [queryClient]);

  const addFilesToQueue = useCallback((files: FileList | File[], folderId: string | null = null, targetAccountId: string | null = null) => {
    console.log("Adding files to queue:", files);
    const newItems: Record<string, UploadItem> = {};
    const list = Array.isArray(files) ? files : Array.from(files);

    list.forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      newItems[id] = {
        id,
        file,
        folderId,
        status: "queued",
        progress: { uploadedBytes: 0, totalBytes: file.size, percentage: 0, speedBytesPerSecond: 0, etaSeconds: 0 },
        targetAccountId,
      };
    });

    setItems((prev) => ({ ...prev, ...newItems }));
  }, []);

  const setTargetAccount = useCallback((id: string, accountId: string | null, provider?: string) => {
    setItems((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, targetAccountId: accountId, provider: provider || undefined } };
    });
  }, []);

  // ── Upload via Web Worker + antrian concurrency ─────────────────────────
  // Mirror items terbaru untuk dibaca dari callback async (pump/worker message)
  // tanpa stale closure.
  const itemsRef = useRef<Record<string, UploadItem>>({});
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // FIFO id yang menunggu slot upload.
  const pendingQueue = useRef<string[]>([]);
  // Byte yang sudah di-ACK provider per item — satu-satunya offset yang aman
  // untuk resume (progress.uploadedBytes bisa berada di tengah chunk/creep).
  const committedBytesRef = useRef<Record<string, number>>({});
  const uploadStartInfo = useRef<Record<string, { startedAt: number; baseOffset: number }>>({});
  const pumpQueueRef = useRef<() => void>(() => {});
  const workerMsgHandler = useRef<(msg: WorkerToMainMsg) => void>(() => {});

  const getUploadWorker = useCallback(() => {
    if (!uploadWorkerRef.current) {
      const w = new Worker(new URL("../workers/upload.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerToMainMsg>) => workerMsgHandler.current(e.data);
      w.onerror = () => {
        // Worker crash — jangan biarkan upload nyangkut diam-diam.
        activeUploadIds.current.forEach((activeId) =>
          updateItem(activeId, { status: "error", errorMessage: "Upload worker berhenti tak terduga." })
        );
        activeUploadIds.current.clear();
        uploadWorkerRef.current?.terminate();
        uploadWorkerRef.current = null;
        pumpQueueRef.current();
      };
      uploadWorkerRef.current = w;
    }
    return uploadWorkerRef.current;
  }, [updateItem]);

  const postCancelToWorker = useCallback((id: string) => {
    uploadWorkerRef.current?.postMessage({ type: "cancel", id } satisfies CancelJobMsg);
  }, []);

  // Buat session (fetch, main thread) lalu serahkan loop chunk ke worker.
  const dispatchUpload = useCallback(
    async (id: string) => {
      const item = itemsRef.current[id];
      if (!item) {
        activeUploadIds.current.delete(id);
        pumpQueueRef.current();
        return;
      }

      const fileSize = item.file.size;
      let sessionId = item.sessionId;

      if (!sessionId) {
        const abortController = new AbortController();
        abortControllers.current[id] = abortController;
        try {
          updateItem(id, { status: "uploading" });

          const headers: Record<string, string> = {
            "Content-Type": item.file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(item.file.name),
            "X-File-Size": String(fileSize),
            "X-App-Client": "nqdrive-web",
          };
          if (item.targetAccountId) {
            headers["X-Target-Account-Id"] = String(item.targetAccountId);
          }

          const sessionRes = await fetch(`${WORKER_BASE}/api/upload/session`, {
            method: "POST",
            headers,
            credentials: "include",
            signal: abortController.signal,
          });

          if (!sessionRes.ok) {
            const err = await sessionRes.json().catch(() => null);
            throw new Error((err as any)?.error?.message || "Gagal memulai sesi upload");
          }

          const sessionData = await sessionRes.json() as any;
          sessionId = sessionData.data?.sessionId;
          const accountId = sessionData.data?.accountId;
          const provider = sessionData.data?.provider;

          updateItem(id, { sessionId, accountId, provider });
        } catch (error: any) {
          const intent = cancelIntent.current[id];
          delete cancelIntent.current[id];
          if (error.name === "AbortError") {
            updateItem(id, { status: intent === "cancel" ? "cancelled" : "paused" });
          } else {
            updateItem(id, { status: "error", errorMessage: error.message || "Upload gagal." });
          }
          delete abortControllers.current[id];
          activeUploadIds.current.delete(id);
          pumpQueueRef.current();
          return;
        }
        delete abortControllers.current[id];
      } else {
        updateItem(id, { status: "uploading" });
      }

      const startOffset = committedBytesRef.current[id] ?? 0;
      uploadStartInfo.current[id] = { startedAt: Date.now(), baseOffset: startOffset };
      getUploadWorker().postMessage({
        type: "start",
        id,
        file: item.file,
        sessionId: sessionId!,
        workerBase: WORKER_BASE,
        chunkSize: CHUNK_SIZE,
        startOffset,
      } satisfies StartJobMsg);
    },
    [getUploadWorker, updateItem]
  );

  // Isi slot kosong dari antrian — dipanggil setiap ada slot bebas (pesan
  // terminal worker), jadi antrian jalan terus bahkan di background tab
  // (trigger = message event, bukan timer yang di-throttle).
  const pumpQueue = useCallback(() => {
    while (activeUploadIds.current.size < MAX_CONCURRENT_UPLOADS && pendingQueue.current.length > 0) {
      const qid = pendingQueue.current.shift()!;
      if (activeUploadIds.current.has(qid)) continue;
      activeUploadIds.current.add(qid);
      void dispatchUpload(qid);
    }
  }, [dispatchUpload]);

  useEffect(() => {
    pumpQueueRef.current = pumpQueue;
  }, [pumpQueue]);

  // Finalize metadata setelah worker melaporkan seluruh byte diterima provider.
  const handleUploadDone = useCallback(
    async (id: string, providerFileId: string) => {
      const item = itemsRef.current[id];
      activeUploadIds.current.delete(id);
      delete uploadStartInfo.current[id];
      delete committedBytesRef.current[id];
      if (!item) {
        pumpQueue();
        return;
      }

      try {
        const finalizeRes = await fetch(`${WORKER_BASE}/api/upload/finalize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Client": "nqdrive-web",
          },
          credentials: "include",
          body: JSON.stringify({
            providerFileId,
            accountId: item.accountId,
            filename: item.file.name,
            mimeType: item.file.type || "application/octet-stream",
            sizeBytes: item.file.size,
            folderId: item.folderId,
          }),
        });

        if (!finalizeRes.ok) throw new Error("Gagal menyimpan metadata");

        updateItem(id, {
          status: "success",
          progress: { uploadedBytes: item.file.size, totalBytes: item.file.size, percentage: 100, speedBytesPerSecond: 0, etaSeconds: 0 },
        });
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      } catch (error: any) {
        updateItem(id, { status: "error", errorMessage: error?.message || "Upload gagal." });
      }
      pumpQueue();
    },
    [pumpQueue, queryClient, updateItem]
  );

  // Handler pesan worker — di-assign ke ref tiap render agar selalu memakai
  // callback terbaru tanpa re-bind onmessage.
  useEffect(() => {
    workerMsgHandler.current = (msg: WorkerToMainMsg) => {
      const id = msg.id;
      switch (msg.type) {
        case "progress": {
          const info = uploadStartInfo.current[id];
          const elapsed = info ? (Date.now() - info.startedAt) / 1000 : 0;
          const delta = msg.uploadedBytes - (info?.baseOffset ?? 0);
          const speed = elapsed > 0 && delta > 0 ? delta / elapsed : 0;
          const remaining = msg.totalBytes - msg.uploadedBytes;
          updateItem(id, {
            progress: {
              uploadedBytes: msg.uploadedBytes,
              totalBytes: msg.totalBytes,
              percentage: msg.totalBytes > 0 ? (msg.uploadedBytes / msg.totalBytes) * 100 : 100,
              speedBytesPerSecond: speed,
              etaSeconds: speed > 0 ? remaining / speed : 0,
            },
          });
          break;
        }
        case "chunk-done": {
          committedBytesRef.current[id] = msg.committedBytes;
          break;
        }
        case "done": {
          void handleUploadDone(id, msg.providerFileId);
          break;
        }
        case "error": {
          activeUploadIds.current.delete(id);
          delete uploadStartInfo.current[id];
          updateItem(id, { status: "error", errorMessage: msg.message });
          pumpQueue();
          break;
        }
        case "cancelled": {
          const intent = cancelIntent.current[id] ?? "cancel";
          delete cancelIntent.current[id];
          activeUploadIds.current.delete(id);
          delete uploadStartInfo.current[id];
          if (intent === "pause") {
            // Snap progress kembali ke offset committed — resume mulai dari sini.
            const committed = committedBytesRef.current[id] ?? 0;
            setItems((prev) => {
              const existing = prev[id];
              if (!existing) return prev;
              return {
                ...prev,
                [id]: {
                  ...existing,
                  status: "paused" as const,
                  progress: {
                    ...existing.progress,
                    uploadedBytes: committed,
                    percentage: existing.progress.totalBytes > 0 ? (committed / existing.progress.totalBytes) * 100 : 0,
                    speedBytesPerSecond: 0,
                    etaSeconds: 0,
                  },
                },
              };
            });
          } else {
            delete committedBytesRef.current[id];
            updateItem(id, { status: "cancelled" });
          }
          pumpQueue();
          break;
        }
      }
    };
  });

  // Masukkan id ke antrian (idempoten) dan pompa slot.
  const enqueueUploads = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      if (activeUploadIds.current.has(id)) return;
      if (!pendingQueue.current.includes(id)) pendingQueue.current.push(id);
    });
    setItems((prev) => {
      let changed = false;
      const next = { ...prev };
      ids.forEach((id) => {
        const existing = next[id];
        if (!existing || activeUploadIds.current.has(id)) return;
        if (existing.status === "error" || existing.status === "paused") {
          next[id] = { ...existing, status: "queued" as const, errorMessage: undefined };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    pumpQueueRef.current();
  }, []);

  const startUpload = useCallback(
    async (id: string) => {
      const item = items[id];
      if (!item) return;
      if (item.status === "queued" || item.status === "error" || item.status === "paused") {
        enqueueUploads([id]);
      }
    },
    [items, enqueueUploads]
  );

  const startAllUploads = useCallback(() => {
    // Jangan auto buka sidebar progress — user mau tetap di halaman files
    const ids = Object.values(items)
      .filter((item) => item.status === "queued" || item.status === "error" || item.status === "paused")
      .map((item) => item.id)
      .sort();
    enqueueUploads(ids);
  }, [items, enqueueUploads]);

  const pauseUpload = useCallback((id: string) => {
    cancelIntent.current[id] = "pause";
    // Masih menunggu slot? Cukup keluarkan dari antrian.
    pendingQueue.current = pendingQueue.current.filter((q) => q !== id);
    if (abortControllers.current[id]) {
      // Fase pembuatan session — abort fetch; catch dispatchUpload set status.
      abortControllers.current[id].abort();
      return;
    }
    if (activeUploadIds.current.has(id)) {
      postCancelToWorker(id);
      return;
    }
    delete cancelIntent.current[id];
    updateItem(id, { status: "paused" });
  }, [postCancelToWorker, updateItem]);

  const cancelUpload = useCallback((id: string) => {
    cancelIntent.current[id] = "cancel";
    pendingQueue.current = pendingQueue.current.filter((q) => q !== id);
    delete committedBytesRef.current[id];
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
      return;
    }
    if (activeUploadIds.current.has(id)) {
      postCancelToWorker(id);
      return;
    }
    delete cancelIntent.current[id];
    updateItem(id, { status: "cancelled" });
  }, [postCancelToWorker, updateItem]);

  const removeItem = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    delete abortControllers.current[id];
    // Bersihkan juga jejak antrian/worker bila item masih aktif.
    pendingQueue.current = pendingQueue.current.filter((q) => q !== id);
    if (activeUploadIds.current.has(id)) {
      cancelIntent.current[id] = "cancel";
      postCancelToWorker(id);
    }
    delete committedBytesRef.current[id];
    delete uploadStartInfo.current[id];
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDismissedRecentIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedIds(next);
      return next;
    });
  }, [postCancelToWorker]);

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const s = next[key]?.status;
        if (s === "success" || s === "cancelled") {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setDismissedRecentIds((prev) => {
      const next = new Set(prev);
      recentItems.forEach((item) => next.add(item.id));
      saveDismissedIds(next);
      return next;
    });
  }, [recentItems]);

  // ─── Copy logic ──────────────────────────────────────────────────────
  const updateCopyItem = useCallback((id: string, patch: Partial<CopyItem>) => {
    setCopyItemsMap((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  const addCopyJob = useCallback(
    (file: { fileId: string; filename: string; sizeBytes: number; provider?: string }, targetFolderId: string | null, targetFolderPath: string | null = null) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-copy`;
      const newItem: CopyItem = {
        id,
        sourceFileId: file.fileId,
        sourceFilename: file.filename,
        sourceSize: file.sizeBytes,
        sourceProvider: file.provider,
        targetFolderId,
        targetFolderPath,
        status: "queued",
        progress: { uploadedBytes: 0, totalBytes: file.sizeBytes, percentage: 0, speedBytesPerSecond: 0, etaSeconds: 0 },
      };
      setCopyItemsMap((prev) => ({ ...prev, [id]: newItem }));
      // Auto buka sidebar progress biar user lihat
      setUploadSidebarOpen(true);
      // Auto start
      setTimeout(() => {
        // will be started by caller via startCopy, but we auto-trigger here too for convenience
      }, 50);
      return id;
    },
    []
  );

  const startCopy = useCallback(
    async (id: string) => {
      const item = copyItemsMap[id] ?? null;
      // Ambil fresh dari state via functional? Untuk simplicity baca dari map snapshot yang ada di closure — tapi bisa stale.
      // Kita ambil dari copyItemsMap ref via setCopyItemsMap callback di bawah, namun untuk accountId kita sudah punya fileId.
      // Untuk menghindari stale, kita baca current dari setCopyItemsMap updater.
      let currentItem: CopyItem | null = null;
      setCopyItemsMap((prev) => {
        currentItem = prev[id] ?? null;
        return prev;
      });
      // Jika masih null karena closure lama, fallback ke item dari closure
      const effectiveItem = currentItem ?? copyItemsMap[id] ?? item;
      if (!effectiveItem) return;

      const abortController = new AbortController();
      copyAbortControllers.current[id] = abortController;

      // Simulasi progress — naik pelan sampai 85% selama request berlangsung
      let simulatedBytes = 0;
      const total = effectiveItem.sourceSize || 1;
      const startedAt = Date.now();
      const interval = setInterval(() => {
        simulatedBytes = Math.min(simulatedBytes + total * 0.04 + Math.random() * total * 0.02, total * 0.85);
        const elapsed = (Date.now() - startedAt) / 1000;
        const speed = elapsed > 0 ? simulatedBytes / elapsed : 0;
        const remaining = total - simulatedBytes;
        const eta = speed > 0 ? remaining / speed : 0;
        updateCopyItem(id, {
          progress: {
            uploadedBytes: simulatedBytes,
            totalBytes: total,
            percentage: (simulatedBytes / total) * 100,
            speedBytesPerSecond: speed,
            etaSeconds: eta,
          },
        });
      }, 600);
      copyProgressIntervals.current[id] = interval;

      try {
        updateCopyItem(id, { status: "copying" });

        const { fileService } = await import("../services/file.service");
        const result = await fileService.copy(effectiveItem.sourceFileId, effectiveItem.targetFolderId);

        clearInterval(interval);
        delete copyProgressIntervals.current[id];

        updateCopyItem(id, {
          status: "success",
          newFileId: (result as any)?.file?.fileId ?? "",
          progress: { uploadedBytes: total, totalBytes: total, percentage: 100, speedBytesPerSecond: 0, etaSeconds: 0 },
        });

        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["folders"] });
        queryClient.invalidateQueries({ queryKey: ["storage-manager"] });

        // Auto remove success setelah 4 detik
        setTimeout(() => {
          setCopyItemsMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 4000);

        delete copyAbortControllers.current[id];
      } catch (error: any) {
        clearInterval(interval);
        delete copyProgressIntervals.current[id];

        if (error?.name === "AbortError") {
          updateCopyItem(id, { status: "cancelled" });
        } else {
          // Cek apakah error dari apiRequest dengan code QUOTA_EXCEEDED
          let msg = error?.message || "Copy gagal.";
          try {
            if (error?.message?.includes("QUOTA_EXCEEDED") || error?.code === "QUOTA_EXCEEDED") {
              msg = "Storage tidak cukup untuk menyalin file.";
            }
          } catch {}
          updateCopyItem(id, { status: "error", errorMessage: msg });
        }
        delete copyAbortControllers.current[id];
      }
    },
    [copyItemsMap, queryClient, updateCopyItem]
  );

  const cancelCopy = useCallback((id: string) => {
    copyAbortControllers.current[id]?.abort();
    const interval = copyProgressIntervals.current[id];
    if (interval) {
      clearInterval(interval);
      delete copyProgressIntervals.current[id];
    }
    setCopyItemsMap((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, status: "cancelled" as const } };
    });
    delete copyAbortControllers.current[id];
  }, []);

  const removeCopyItem = useCallback((id: string) => {
    copyAbortControllers.current[id]?.abort();
    const interval = copyProgressIntervals.current[id];
    if (interval) {
      clearInterval(interval);
      delete copyProgressIntervals.current[id];
    }
    delete copyAbortControllers.current[id];
    setCopyItemsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const sortedItems = useMemo(
    () => Object.values(items).sort((a, b) => b.id.localeCompare(a.id)),
    [items]
  );

  const sortedCopyItems = useMemo(
    () => Object.values(copyItemsMap).sort((a, b) => b.id.localeCompare(a.id)),
    [copyItemsMap]
  );

  const contextValue = useMemo(
    () => ({
      items: sortedItems,
      recentItems,
      copyItems: sortedCopyItems,
      addFilesToQueue,
      setTargetAccount,
      startUpload,
      startAllUploads,
      pauseUpload,
      cancelUpload,
      removeItem,
      clearFinished,
      clearRecent,
      addCopyJob,
      startCopy,
      cancelCopy,
      removeCopyItem,
      isUploadSidebarOpen,
      setUploadSidebarOpen,
    }),
    [
      sortedItems,
      recentItems,
      sortedCopyItems,
      addFilesToQueue,
      setTargetAccount,
      startUpload,
      startAllUploads,
      pauseUpload,
      cancelUpload,
      removeItem,
      clearFinished,
      clearRecent,
      addCopyJob,
      startCopy,
      cancelCopy,
      removeCopyItem,
      isUploadSidebarOpen,
      setUploadSidebarOpen,
    ]
  );

  return (
    <UploadContext.Provider value={contextValue}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadGlobal() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploadGlobal must be used within an UploadProvider");
  return context;
}
