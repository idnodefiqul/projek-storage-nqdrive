import { useCallback, useRef, useState } from "react";
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
const CHUNK_SIZE = 30 * 1024 * 1024; // 30MB

async function computeSHA256(file: File): Promise<string> {
  if (file.size < 50 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const slice = file.slice(0, 50 * 1024 * 1024);
  const buffer = await slice.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return "partial-" + Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useUpload() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const xhrRefs = useRef<Record<string, XMLHttpRequest>>({});

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

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
      
      updateItem(id, { status: "hashing" });
      
      try {
        const sha256Hash = await computeSHA256(item.file);
        updateItem(id, { sha256Hash });
        updateItem(id, { status: "uploading" });

        const sessionRes = await fetch(`${WORKER_BASE}/api/upload/session`, {
          method: "POST",
          headers: {
            "X-Filename": encodeURIComponent(item.file.name),
            "X-File-Size": String(item.file.size),
            "Content-Type": item.file.type || "application/octet-stream",
            "X-App-Client": "nqdrive-web",
          },
          credentials: "include",
        });

        if (!sessionRes.ok) throw new Error("Gagal memulai sesi upload");
        const sessionData = await sessionRes.json();
        const uploadUrl = sessionData.data.uploadUrl;
        const accountId = sessionData.data.accountId;

        const fileSize = item.file.size;
        let uploadedBytes = 0;
        const startedAt = Date.now();

        for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
          const end = Math.min(start + CHUNK_SIZE, fileSize);
          const chunk = item.file.slice(start, end);
          
          const chunkRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Range": `bytes ${start}-${end - 1}/${fileSize}`,
            },
            body: chunk,
          });
          
          if (chunkRes.status === 308 || chunkRes.status === 200 || chunkRes.status === 201) {
            uploadedBytes = end;
            const elapsedSeconds = (Date.now() - startedAt) / 1000;
            const speedBytesPerSecond = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0;
            const remainingBytes = fileSize - uploadedBytes;
            const etaSeconds = speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : 0;

            updateItem(id, {
              progress: {
                uploadedBytes,
                totalBytes: fileSize,
                percentage: (uploadedBytes / fileSize) * 100,
                speedBytesPerSecond,
                etaSeconds,
              },
            });
            
            if (chunkRes.status === 200 || chunkRes.status === 201) {
              const resultData = await chunkRes.json();
              const providerFileId = resultData.id;
              
              const finalizeRes = await fetch(`${WORKER_BASE}/api/upload/finalize`, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "X-App-Client": "nqdrive-web"
                },
                credentials: "include",
                body: JSON.stringify({
                  providerFileId,
                  accountId,
                  filename: item.file.name,
                  mimeType: item.file.type || "application/octet-stream",
                  sizeBytes: item.file.size,
                  folderId: item.folderId,
                  sha256Hash
                })
              });
              
              if (!finalizeRes.ok) throw new Error("Gagal menyimpan metadata");
              
              updateItem(id, { status: "success" });
              queryClient.invalidateQueries({ queryKey: ["files"] });
              queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
              return;
            }
          } else {
             throw new Error("Upload chunk gagal");
          }
        }
      } catch (error: any) {
        updateItem(id, { status: "error", errorMessage: error.message || "Upload gagal." });
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
    xhrRefs.current[id]?.abort();
    updateItem(id, { status: "cancelled" });
  }, [updateItem]);

  const removeItem = useCallback((id: string) => {
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
        if (next[key]?.status === "success" || next[key]?.status === "cancelled") {
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
