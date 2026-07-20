// Dedicated Web Worker: pompa chunk upload.
// Alasan pindah ke worker: Chrome melakukan intensive throttling pada tab
// background — timer dibatasi 1x/menit dan task main-thread dideprioritaskan,
// sehingga loop chunk & progress "membeku" saat tab ditinggal. Dedicated worker
// BEBAS dari throttling itu: XHR, timer, dan loop di sini tetap jalan penuh.
// Cookie auth tetap terkirim (worker berbagi cookie jar origin, withCredentials
// didukung di worker).

import type { MainToWorkerMsg, StartJobMsg, WorkerToMainMsg } from "./upload-protocol";

// Porsi progress chunk yang dikreditkan dari leg browser→worker (diukur XHR).
// Sisa 1-LEG1 diisi mulus via interpolasi selama worker meneruskan chunk ke
// provider (Google/Dropbox) — inilah jeda yang dulu membuat bar "membeku" di
// kelipatan chunk. Dengan menyisakan 10%, bar terus bergerak sampai response tiba.
const LEG1_FRACTION = 0.9;

// Retry per-chunk: error jaringan transien tidak lagi mematikan seluruh upload.
const MAX_CHUNK_RETRIES = 5;

// Kirim progress ke main thread maksimal tiap 250ms per job (~4 update
// React/detik/file) — mengurangi biaya re-render saat banyak file paralel.
const PROGRESS_THROTTLE_MS = 250;

const jobs = new Map<string, { abort: AbortController }>();

function post(msg: WorkerToMainMsg) {
  self.postMessage(msg);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload dibatalkan", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Upload dibatalkan", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
    const size = chunk.size;
    let leg1Done = false;
    let creepValue = size * LEG1_FRACTION;
    let creepTimer: ReturnType<typeof setInterval> | null = null;

    const stopCreep = () => {
      if (creepTimer !== null) {
        clearInterval(creepTimer);
        creepTimer = null;
      }
    };

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      // Kreditkan hanya 90% selama upload browser→worker.
      onProgress(Math.min(e.loaded, size) * LEG1_FRACTION);

      // Begitu seluruh chunk terkirim ke worker, mulai interpolasi mulus mengisi
      // 10% terakhir selama worker meneruskan ke provider + menunggu response.
      // Di dedicated worker interval ini TIDAK di-throttle walau tab background.
      if (e.loaded >= size && !leg1Done && size > 0) {
        leg1Done = true;
        creepValue = size * LEG1_FRACTION;
        creepTimer = setInterval(() => {
          // Dekati 100% chunk secara asimtotik (tak pernah menyentuh sebelum response).
          creepValue += (size - creepValue) * 0.06;
          onProgress(Math.min(creepValue, size * 0.995));
        }, 100);
      }
    };

    xhr.onload = () => {
      stopCreep();
      onProgress(size); // Chunk benar-benar selesai — pastikan bar di batas yang tepat.
      resolve({ status: xhr.status, body: xhr.responseText });
    };
    xhr.onerror = () => {
      stopCreep();
      reject(new Error("Koneksi terputus saat upload."));
    };
    xhr.onabort = () => {
      stopCreep();
      reject(new DOMException("Upload dibatalkan", "AbortError"));
    };

    signal.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", contentRange);
    xhr.setRequestHeader("X-App-Client", "nqdrive-web");
    xhr.withCredentials = true;
    xhr.send(chunk);
  });
}

async function runJob(msg: StartJobMsg) {
  const { id, file, sessionId, workerBase, chunkSize } = msg;
  const abort = new AbortController();
  jobs.set(id, { abort });
  const signal = abort.signal;

  const fileSize = file.size;
  // committed HANYA maju setelah relay balas 308/200 — retry chunk yang sama
  // dari sini selalu aman (provider belum meng-ACK byte-nya).
  let committed = msg.startOffset || 0;
  let attempt = 0;

  // Throttle progress trailing-edge: selalu simpan nilai terakhir, flush maksimal
  // tiap PROGRESS_THROTTLE_MS + selalu flush saat dipanggil dengan force.
  let lastPostAt = 0;
  const postProgress = (uploadedBytes: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastPostAt < PROGRESS_THROTTLE_MS) return;
    lastPostAt = now;
    post({ type: "progress", id, uploadedBytes, totalBytes: fileSize });
  };

  try {
    while (committed < fileSize || fileSize === 0) {
      const chunkStart = committed;
      const end = Math.min(chunkStart + chunkSize, fileSize);
      const chunk = file.slice(chunkStart, end);
      const contentRange = fileSize > 0 ? `bytes ${chunkStart}-${end - 1}/${fileSize}` : `bytes 0-0/0`;

      let result: { status: number; body: string };
      try {
        result = await uploadChunkXHR(
          `${workerBase}/api/upload/status/${sessionId}`,
          chunk,
          contentRange,
          (loaded) => postProgress(chunkStart + loaded),
          signal
        );
      } catch (error: any) {
        if (error?.name === "AbortError") throw error;
        // Error jaringan transien → retry chunk yang sama dengan backoff eksponensial.
        attempt++;
        if (attempt > MAX_CHUNK_RETRIES) {
          post({ type: "error", id, message: error?.message || "Upload gagal setelah beberapa percobaan." });
          return;
        }
        const backoff = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500;
        postProgress(committed, true); // reset bar ke offset committed terakhir
        await sleep(backoff, signal);
        continue;
      }

      if (result.status === 308) {
        committed = end;
        attempt = 0;
        post({ type: "chunk-done", id, committedBytes: committed });
        postProgress(committed, true);
        continue;
      }

      if (result.status === 200 || result.status === 201) {
        let providerFileId = "";
        try {
          providerFileId = JSON.parse(result.body)?.data?.providerFileId || "";
        } catch {}
        postProgress(fileSize, true);
        post({ type: "done", id, providerFileId });
        return;
      }

      // OneDrive 416 "range already received" → chunk sebenarnya sudah masuk, maju.
      if (result.status === 416) {
        committed = end;
        attempt = 0;
        post({ type: "chunk-done", id, committedBytes: committed });
        continue;
      }

      let errMsg = "Upload chunk gagal";
      try { errMsg = JSON.parse(result.body)?.error?.message || errMsg; } catch {}

      // Dropbox: jika chunk ternyata sudah masuk sebelum koneksi putus, Dropbox
      // balas incorrect_offset dengan correct_offset — re-sync dan lanjut.
      const offsetMatch = result.body?.match(/"correct_offset":\s*(\d+)/);
      if (offsetMatch) {
        const correctOffset = Number(offsetMatch[1]);
        if (Number.isFinite(correctOffset) && correctOffset > committed && correctOffset <= fileSize) {
          committed = correctOffset;
          attempt = 0;
          post({ type: "chunk-done", id, committedBytes: committed });
          postProgress(committed, true);
          continue;
        }
      }

      // 5xx / 429 dari relay atau provider → retryable.
      if (result.status >= 500 || result.status === 429) {
        attempt++;
        if (attempt > MAX_CHUNK_RETRIES) {
          post({ type: "error", id, message: errMsg });
          return;
        }
        const backoff = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500;
        postProgress(committed, true);
        await sleep(backoff, signal);
        continue;
      }

      // Error permanen (4xx lain, session hilang, dsb).
      post({ type: "error", id, message: errMsg });
      return;
    }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      post({ type: "cancelled", id });
    } else {
      post({ type: "error", id, message: error?.message || "Upload gagal." });
    }
  } finally {
    jobs.delete(id);
  }
}

self.onmessage = (e: MessageEvent<MainToWorkerMsg>) => {
  const msg = e.data;
  if (msg.type === "start") {
    void runJob(msg);
  } else if (msg.type === "cancel") {
    jobs.get(msg.id)?.abort.abort();
  }
};
