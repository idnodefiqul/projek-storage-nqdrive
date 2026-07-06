import { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo, type ReactNode } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuthContext } from "./auth-provider";
import { logService } from "../services/log.service";

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export type UploadItemStatus = "queued" | "hashing" | "uploading" | "success" | "error" | "cancelled" | "paused";

export interface UploadItem {
  id: string;
  file: File;
  folderId: number | null;
  status: UploadItemStatus;
  progress: UploadProgress;
  errorMessage?: string;
  sha256Hash?: string;
  sessionId?: string;
  accountId?: number;
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
  addFilesToQueue: (files: FileList | File[], folderId?: number | null) => void;
  startUpload: (id: string) => Promise<void>;
  startAllUploads: () => void;
  pauseUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  clearRecent: () => void;
  isUploadSidebarOpen: boolean;
  setUploadSidebarOpen: (open: boolean) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
const CHUNK_SIZE = 30 * 1024 * 1024;

async function computeSHA256(file: File): Promise<string | null> {
  if (file.size > 100 * 1024 * 1024) return null;
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function uploadChunkXHR(
  url: string,
  chunk: Blob,
  contentRange: string,
  onProgress: (loaded: number) => void,
  signal: AbortSignal
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload."));
    xhr.onabort = () => reject(new DOMException("Upload dibatalkan", "AbortError"));

    signal.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", contentRange);
    xhr.setRequestHeader("X-App-Client", "nqdrive-web");
    xhr.withCredentials = true;
    xhr.send(chunk);
  });
}

const STORAGE_DISMISSED_KEY = "nqdrive-dismissed-uploads";

export function UploadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  
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

  // Load from DB via listUploads
  const { data: dbLogs } = useQuery({
    queryKey: ["logs", "uploads"],
    queryFn: logService.listUploads,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    enabled: !!user,
  });

  // Map DB logs to recentItems
  const recentItems = useMemo(() => {
    if (!dbLogs?.logs) return [];
    return dbLogs.logs
      .map((log) => {
        const id = `db-${log.id}`;
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

  const [isUploadSidebarOpen, setUploadSidebarOpen] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});

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

  const addFilesToQueue = useCallback((files: FileList | File[], folderId: number | null = null) => {
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
      };
    });

    setItems((prev) => ({ ...prev, ...newItems }));
  }, []);

  const startUpload = useCallback(
    async (id: string) => {
      const item = items[id];
      if (!item) return;

      const abortController = new AbortController();
      abortControllers.current[id] = abortController;

      updateItem(id, { status: "hashing" });
      const sha256Hash = await computeSHA256(item.file);

      const fileSize = item.file.size;
      let accountId = item.accountId;
      let sessionId = item.sessionId;

      if (!sessionId) {
        try {
          updateItem(id, { sha256Hash: sha256Hash ?? undefined, status: "uploading" });

          const sessionRes = await fetch(`${WORKER_BASE}/api/upload/session`, {
            method: "POST",
            headers: {
              "Content-Type": item.file.type || "application/octet-stream",
              "X-Filename": encodeURIComponent(item.file.name),
              "X-File-Size": String(fileSize),
              "X-App-Client": "nqdrive-web",
            },
            credentials: "include",
            signal: abortController.signal,
          });

          if (!sessionRes.ok) {
            const err = await sessionRes.json().catch(() => null);
            throw new Error((err as any)?.error?.message || "Gagal memulai sesi upload");
          }

          const sessionData = await sessionRes.json() as any;
          sessionId = sessionData.data?.sessionId;
          accountId = sessionData.data?.accountId;
          
          updateItem(id, { sessionId, accountId });
        } catch (error: any) {
          if (error.name === "AbortError") {
            updateItem(id, { status: "paused" });
          } else {
            updateItem(id, { status: "error", errorMessage: error.message || "Upload gagal." });
          }
          delete abortControllers.current[id];
          return;
        }
      }

      try {
        updateItem(id, { status: "uploading" });

        let completedBytes = item.progress.uploadedBytes || 0;
        const startedAt = Date.now();

        while (completedBytes < fileSize || fileSize === 0) {
          const chunkStart = completedBytes;
          const end = Math.min(chunkStart + CHUNK_SIZE, fileSize);
          const chunk = item.file.slice(chunkStart, end);
          const contentRange = fileSize > 0 ? `bytes ${chunkStart}-${end - 1}/${fileSize}` : `bytes 0-0/0`;

          const result = await uploadChunkXHR(
            `${WORKER_BASE}/api/upload/status/${sessionId}`,
            chunk,
            contentRange,
            (loaded) => {
              const totalUploaded = chunkStart + loaded;
              const elapsedSeconds = (Date.now() - startedAt) / 1000;
              const speed = elapsedSeconds > 0 ? totalUploaded / elapsedSeconds : 0;
              const remaining = fileSize - totalUploaded;
              const eta = speed > 0 ? remaining / speed : 0;

              updateItem(id, {
                progress: {
                  uploadedBytes: totalUploaded,
                  totalBytes: fileSize,
                  percentage: (totalUploaded / fileSize) * 100,
                  speedBytesPerSecond: speed,
                  etaSeconds: eta,
                },
              });
            },
            abortController.signal
          );

          if (result.status === 308) {
            completedBytes = end;
            continue;
          }

          if (result.status === 200 || result.status === 201) {
            const resultData = JSON.parse(result.body);
            const providerFileId = resultData.data?.providerFileId;

            const finalizeRes = await fetch(`${WORKER_BASE}/api/upload/finalize`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-App-Client": "nqdrive-web",
              },
              credentials: "include",
              body: JSON.stringify({
                providerFileId,
                accountId,
                filename: item.file.name,
                mimeType: item.file.type || "application/octet-stream",
                sizeBytes: item.file.size,
                folderId: item.folderId,
                sha256Hash,
              }),
              signal: abortController.signal,
            });

            if (!finalizeRes.ok) throw new Error("Gagal menyimpan metadata");

            updateItem(id, {
              status: "success",
              progress: { uploadedBytes: fileSize, totalBytes: fileSize, percentage: 100, speedBytesPerSecond: 0, etaSeconds: 0 },
            });
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
            delete abortControllers.current[id];
            return;
          }

          let errMsg = "Upload chunk gagal";
          try { errMsg = JSON.parse(result.body)?.error?.message || errMsg; } catch {}
          throw new Error(errMsg);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          updateItem(id, { status: "paused" });
        } else {
          updateItem(id, { status: "error", errorMessage: error.message || "Upload gagal." });
        }
        delete abortControllers.current[id];
      }
    },
    [items, queryClient, updateItem]
  );

  const startAllUploads = useCallback(() => {
    setUploadSidebarOpen(true);
    Object.values(items).forEach((item) => {
      if (item.status === "queued" || item.status === "error" || item.status === "paused") {
        startUpload(item.id);
      }
    });
  }, [items, startUpload]);

  const pauseUpload = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    updateItem(id, { status: "paused" });
    delete abortControllers.current[id];
  }, [updateItem]);

  const cancelUpload = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    updateItem(id, { status: "cancelled" });
    delete abortControllers.current[id];
  }, [updateItem]);

  const removeItem = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    delete abortControllers.current[id];
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
  }, []);

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

  const sortedItems = Object.values(items).sort((a, b) => Number(b.id.split("-").pop()) - Number(a.id.split("-").pop()));

  return (
    <UploadContext.Provider
      value={{
        items: sortedItems,
        recentItems,
        addFilesToQueue,
        startUpload,
        startAllUploads,
        pauseUpload,
        cancelUpload,
        removeItem,
        clearFinished,
        clearRecent,
        isUploadSidebarOpen,
        setUploadSidebarOpen,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadGlobal() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploadGlobal must be used within an UploadProvider");
  return context;
}



