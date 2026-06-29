import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export type UploadItemStatus = "pending" | "uploading" | "success" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadItemStatus;
  progress: UploadProgress;
  errorMessage?: string;
}

/**
 * Base URL for the worker API — must match api-client.ts logic.
 * In dev Vite proxies /api, in production VITE_WORKER_URL points to the worker.
 */
const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";

/**
 * Drives file uploads via XMLHttpRequest rather than fetch — XHR is the only browser API
 * that exposes `upload.onprogress`, which is what makes real-time speed/ETA/percentage
 * possible. This measures progress at the browser-to-Worker hop, which is the hop that
 * actually reflects "the user's own internet speed" as required by the brief — the
 * Worker-to-Google-Drive hop happens server-side afterwards and isn't something the
 * user's connection speed affects.
 */
export function useUpload() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const xhrRefs = useRef<Record<string, XMLHttpRequest>>({});

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => {
      const existing = prev[id];
      if (!existing) return prev; // Item not tracked (e.g. already removed) — no-op.
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  const uploadFile = useCallback(
    (file: File, folderId: number | null = null) => {
      const id = `${file.name}-${file.size}-${Date.now()}`;

      const initialItem: UploadItem = {
        id,
        file,
        status: "pending",
        progress: { uploadedBytes: 0, totalBytes: file.size, percentage: 0, speedBytesPerSecond: 0, etaSeconds: 0 },
      };
      setItems((prev) => ({ ...prev, [id]: initialItem }));

      const xhr = new XMLHttpRequest();
      xhrRefs.current[id] = xhr;
      const startedAt = Date.now();

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const speedBytesPerSecond = elapsedSeconds > 0 ? event.loaded / elapsedSeconds : 0;
        const remainingBytes = event.total - event.loaded;
        const etaSeconds = speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : 0;

        updateItem(id, {
          status: "uploading",
          progress: {
            uploadedBytes: event.loaded,
            totalBytes: event.total,
            percentage: event.total > 0 ? (event.loaded / event.total) * 100 : 0,
            speedBytesPerSecond,
            etaSeconds,
          },
        });
      };

      xhr.onload = () => {
        delete xhrRefs.current[id];

        if (xhr.status >= 200 && xhr.status < 300) {
          updateItem(id, { status: "success" });
          queryClient.invalidateQueries({ queryKey: ["files"] });
          queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
        } else {
          let message = "Upload gagal.";
          try {
            const parsed = JSON.parse(xhr.responseText);
            message = parsed?.error?.message ?? message;
          } catch {
            // Response wasn't JSON — keep the generic message.
          }
          updateItem(id, { status: "error", errorMessage: message });
        }
      };

      xhr.onerror = () => {
        delete xhrRefs.current[id];
        updateItem(id, { status: "error", errorMessage: "Koneksi terputus saat upload." });
      };

      xhr.onabort = () => {
        delete xhrRefs.current[id];
        updateItem(id, { status: "cancelled" });
      };

      // FIX: use WORKER_BASE prefix so XHR hits the correct worker URL in production.
      xhr.open("POST", `${WORKER_BASE}/api/files/upload`);
      xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      xhr.setRequestHeader("X-File-Size", String(file.size));
      if (folderId) xhr.setRequestHeader("X-Folder-Id", String(folderId));
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.withCredentials = true; // send the session cookie, same as apiRequest's credentials: "include"

      updateItem(id, { status: "uploading" });
      xhr.send(file);

      return id;
    },
    [queryClient, updateItem]
  );

  const cancelUpload = useCallback((id: string) => {
    xhrRefs.current[id]?.abort();
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return {
    items: Object.values(items).sort((a, b) => Number(b.id.split("-").pop()) - Number(a.id.split("-").pop())),
    uploadFile,
    cancelUpload,
    removeItem,
  };
}
