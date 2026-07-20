// Tipe pesan antara main thread (upload-provider) dan upload.worker.
// File ini type-only — jangan import runtime apa pun agar bundle worker tetap kecil.

// ── Main → Worker ────────────────────────────────────────────────────────────
export interface StartJobMsg {
  type: "start";
  /** id UploadItem di provider */
  id: string;
  /** File di-structured-clone (murah — byte tidak dicopy, slice() lazy) */
  file: File;
  sessionId: string;
  /** WORKER_BASE — import.meta.env tidak tersedia di worker, jadi dikirim dari main */
  workerBase: string;
  chunkSize: number;
  /** Offset resume (uploadedBytes committed terakhir), 0 untuk upload baru */
  startOffset: number;
}

export interface CancelJobMsg {
  type: "cancel";
  id: string;
}

export type MainToWorkerMsg = StartJobMsg | CancelJobMsg;

// ── Worker → Main ────────────────────────────────────────────────────────────
export interface ProgressMsg {
  type: "progress";
  id: string;
  /** Byte absolut terupload (chunkStart + loaded×fraction) */
  uploadedBytes: number;
  totalBytes: number;
}

/** Checkpoint batas chunk yang sudah di-ACK provider — dipakai untuk resume pause */
export interface ChunkDoneMsg {
  type: "chunk-done";
  id: string;
  committedBytes: number;
}

export interface DoneMsg {
  type: "done";
  id: string;
  providerFileId: string;
}

export interface ErrorMsg {
  type: "error";
  id: string;
  message: string;
}

export interface CancelledMsg {
  type: "cancelled";
  id: string;
}

export type WorkerToMainMsg = ProgressMsg | ChunkDoneMsg | DoneMsg | ErrorMsg | CancelledMsg;
