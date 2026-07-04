import { useCallback, useRef, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export type UploadItemStatus = "queued" | "hashing" | "uploading" | "success" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  folderId: number | null;
  status: UploadItemStatus;
  progress: UploadProgress;
  errorMessage?: string;
  sha256Hash?: string;
}

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

/**
 * Upload a single chunk via XHR for real-time progress tracking.
 * XHR.upload.onprogress gives smooth byte-level progress that fetch() cannot.
 */
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

export function useUpload() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  // Removed auto-clear finished uploads after 3 seconds to preserve completed files
  // Auto-clear is now only manual via clearFinished() function

  const addFilesToQueue = useCallback((files: FileList | File[], folderId: number | null = null) => {
    Array.from(files).forEach((file) => {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      const initialItem: UploadItem = {
        id,
        file,
        folderId,
        status: "queued",
        progress: { uploadedBytes: 0, totalBytes: file.size, percentage: 0, speedBytesPerSecond: 0, etaSeconds: 0 },
      };
      setItems((prev) => ({ ...prev, [id]: initialItem }));
    });
  }, []);

  const startUpload = useCallback(
    async (id: string, currentItems: Record<string, UploadItem>) => {
      const item = currentItems[id];
      if (!item || (item.status !== "queued" && item.status !== "error")) return;

      const abortController = new AbortController();
      abortControllers.current[id] = abortController;

      updateItem(id, { status: "hashing" });

      try {
        const sha256Hash = await computeSHA256(item.file);
        updateItem(id, { sha256Hash: sha256Hash ?? undefined, status: "uploading" });

        // 1. Create session
        const sessionRes = await fetch(`${WORKER_BASE}/api/upload/session`, {
          method: "POST",
          headers: {
            "X-Filename": encodeURIComponent(item.file.name),
            "X-File-Size": String(item.file.size),
            "Content-Type": item.file.type || "application/octet-stream",
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
        const sessionId = sessionData.data.sessionId;
        const accountId = sessionData.data.accountId;

        // 2. Upload chunks with real-time progress via XHR
        const fileSize = item.file.size;
        let completedBytes = 0;
        const startedAt = Date.now();

        for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
          if (abortController.signal.aborted) throw new DOMException("Upload dibatalkan", "AbortError");

          const end = Math.min(start + CHUNK_SIZE, fileSize);
          const chunk = item.file.slice(start, end);
          const contentRange = `bytes ${start}-${end - 1}/${fileSize}`;
          const chunkStart = start;

          const result = await uploadChunkXHR(
            `${WORKER_BASE}/api/upload/status/${sessionId}`,
            chunk,
            contentRange,
            (loaded) => {
              // Smooth real-time progress: completed chunks + current chunk progress
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
            // Upload complete — finalize
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

          // Error
          let errMsg = "Upload chunk gagal";
          try { errMsg = JSON.parse(result.body)?.error?.message || errMsg; } catch {}
          throw new Error(errMsg);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          updateItem(id, { status: "cancelled" });
        } else {
          updateItem(id, { status: "error", errorMessage: error.message || "Upload gagal." });
        }
        delete abortControllers.current[id];
      }
    },
    [queryClient, updateItem]
  );

  const startAllUploads = useCallback(() => {
    setItems((currentItems) => {
      Object.values(currentItems).forEach((item) => {
        if (item.status === "queued" || item.status === "error") {
          startUpload(item.id, currentItems);
        }
      });
      return currentItems;
    });
  }, [startUpload]);

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
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const s = next[key]?.status;
        if (s === "success" || s === "cancelled" || s === "queued") {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  return {
    items: Object.values(items).sort((a, b) => Number(b.id.split("-").pop()) - Number(a.id.split("-").pop())),
    addFilesToQueue,
    startUpload: (id: string) => startUpload(id, items),
    startAllUploads,
    cancelUpload,
    removeItem,
    clearFinished,
  };
}