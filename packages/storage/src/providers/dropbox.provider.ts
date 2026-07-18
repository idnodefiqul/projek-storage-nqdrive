import type {
  ProviderCredentials,
  ProviderUploadResult,
  StorageProvider,
  StorageQuota,
  UploadProgressCallback,
} from "../provider.interface";

const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";
const DROPBOX_OAUTH_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

const APPEND_CHUNK_SIZE = 16 * 1024 * 1024;

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export class DropboxProvider implements StorageProvider {
  readonly type = "dropbox" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  private authHeader(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async upload(params: {
    credentials: ProviderCredentials;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    stream: ReadableStream<Uint8Array>;
    onProgress?: UploadProgressCallback;
  }): Promise<ProviderUploadResult> {
    const { credentials, filename, sizeBytes, stream, onProgress } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Dropbox upload");
    }

    const startRes = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/start`, {
      method: "POST",
      headers: {
        ...this.authHeader(accessToken),
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ close: false }),
      },
      body: new Uint8Array(0) as unknown as BodyInit,
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start Dropbox upload session: ${startRes.status} ${await startRes.text()}`);
    }
    const { session_id: sessionId } = (await startRes.json()) as { session_id: string };

    const reader = stream.getReader();
    let offset = 0;
    let uploadedBytes = 0;
    const startTime = Date.now();
    let pending: Uint8Array[] = [];
    let pendingLen = 0;

    const emitProgress = () => {
      if (!onProgress) return;
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedBytesPerSecond = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0;
      const remainingBytes = sizeBytes - uploadedBytes;
      const etaSeconds = speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : 0;
      onProgress({
        uploadedBytes,
        totalBytes: sizeBytes,
        percentage: sizeBytes > 0 ? (uploadedBytes / sizeBytes) * 100 : 0,
        speedBytesPerSecond,
        etaSeconds,
      });
    };

    const appendBuffer = async (buf: Uint8Array) => {
      const res = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/append_v2`, {
        method: "POST",
        headers: {
          ...this.authHeader(accessToken),
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            cursor: { session_id: sessionId, offset },
            close: false,
          }),
        },
        body: buf as unknown as BodyInit,
      });
      if (!res.ok) {
        throw new Error(`Failed to append Dropbox upload session: ${res.status} ${await res.text()}`);
      }
      offset += buf.byteLength;
      uploadedBytes = offset;
      emitProgress();
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        pending.push(value);
        pendingLen += value.byteLength;
        if (pendingLen >= APPEND_CHUNK_SIZE) {
          await appendBuffer(concatChunks(pending, pendingLen));
          pending = [];
          pendingLen = 0;
        }
      }
    }

    const remaining = concatChunks(pending, pendingLen);
    const finishRes = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/finish`, {
      method: "POST",
      headers: {
        ...this.authHeader(accessToken),
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          cursor: { session_id: sessionId, offset },
          commit: { path: `/${filename}`, mode: "add", autorename: true, mute: true },
        }),
      },
      body: remaining as unknown as BodyInit,
    });
    if (!finishRes.ok) {
      throw new Error(`Failed to finish Dropbox upload session: ${finishRes.status} ${await finishRes.text()}`);
    }
    uploadedBytes = offset + remaining.byteLength;
    emitProgress();

    const meta = (await finishRes.json()) as { id: string; size?: number };
    return {
      providerFileId: meta.id,
      sizeBytes: meta.size ?? sizeBytes,
      mimeType: params.mimeType,
    };
  }

  async download(params: {
    credentials: ProviderCredentials;
    providerFileId: string;
    rangeStart?: number;
    rangeEnd?: number;
  }): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number; mimeType: string; contentRange: string | null; contentLength: number | null }> {
    const { credentials, providerFileId, rangeStart, rangeEnd } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Dropbox download");
    }

    const headers: Record<string, string> = {
      ...this.authHeader(accessToken),
      "Dropbox-API-Arg": JSON.stringify({ path: providerFileId }),
      "Accept-Encoding": "identity",
    };
    if (rangeStart !== undefined) {
      headers.Range = `bytes=${rangeStart}-${rangeEnd !== undefined ? rangeEnd : ""}`;
    } else {
      headers.Range = "bytes=0-";
    }

    const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
      method: "POST",
      headers,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Failed to download Dropbox file content: ${response.status} ${errText.slice(0, 200)}`);
    }

    const contentRange = response.headers.get("content-range");
    const contentLengthStr = response.headers.get("content-length");
    const contentLength = contentLengthStr ? Number(contentLengthStr) : null;

    let sizeBytes = 0;
    if (contentRange) {
      const totalMatch = contentRange.match(/\/(\d+)$/);
      if (totalMatch) sizeBytes = Number(totalMatch[1]);
    }
    if (!sizeBytes) {
      const apiResult = response.headers.get("dropbox-api-result");
      if (apiResult) {
        try {
          const meta = JSON.parse(apiResult) as { size?: number };
          if (meta.size) sizeBytes = meta.size;
        } catch {}
      }
    }
    if (!sizeBytes && contentLength) sizeBytes = contentLength;

    return {
      stream: response.body,
      sizeBytes,
      mimeType: response.headers.get("content-type") ?? "application/octet-stream",
      contentRange,
      contentLength,
    };
  }

  async delete(params: { credentials: ProviderCredentials; providerFileId: string }): Promise<void> {
    const { credentials, providerFileId } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Dropbox delete");
    }

    const response = await fetch(`${DROPBOX_API_BASE}/files/delete_v2`, {
      method: "POST",
      headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ path: providerFileId }),
    });

    if (!response.ok && response.status !== 409) {
      throw new Error(`Failed to delete Dropbox file: ${response.status} ${await response.text()}`);
    }
  }

  async deleteAllFiles(params: { credentials: ProviderCredentials }): Promise<{ deletedCount: number }> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Dropbox deleteAllFiles");
    }

    const paths: string[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const url = cursor
        ? `${DROPBOX_API_BASE}/files/list_folder/continue`
        : `${DROPBOX_API_BASE}/files/list_folder`;
      const body = cursor ? { cursor } : { path: "", recursive: false, limit: 2000 };
      const listRes = await fetch(url, {
        method: "POST",
        headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!listRes.ok) {
        throw new Error(`Failed to list Dropbox root: ${listRes.status} ${await listRes.text()}`);
      }
      const data = (await listRes.json()) as {
        entries: Array<{ ".tag": string; path_lower?: string; id?: string }>;
        cursor?: string;
        has_more: boolean;
      };
      for (const entry of data.entries) {
        if (entry.path_lower) paths.push(entry.path_lower);
      }
      cursor = data.cursor;
      hasMore = data.has_more;
    }

    let deletedCount = 0;
    for (const path of paths) {
      try {
        const res = await fetch(`${DROPBOX_API_BASE}/files/delete_v2`, {
          method: "POST",
          headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (res.ok || res.status === 409) deletedCount++;
      } catch (err) {
        console.error(`Gagal hapus entri Dropbox ${path}:`, err);
      }
    }

    return { deletedCount };
  }

  async getQuota(params: { credentials: ProviderCredentials }): Promise<StorageQuota> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Dropbox quota check");
    }

    const response = await fetch(`${DROPBOX_API_BASE}/users/get_space_usage`, {
      method: "POST",
      headers: this.authHeader(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Dropbox quota: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      used: number;
      allocation: {
        ".tag": string;
        allocated?: number;
        used?: number;
      };
    };

    const usedBytes = Number(data.used ?? 0);
    const totalBytes = Number(data.allocation?.allocated ?? 0);

    return {
      totalBytes,
      usedBytes,
      availableBytes: Math.max(0, totalBytes - usedBytes),
    };
  }

  async listFiles(params: {
    credentials: ProviderCredentials;
  }): Promise<Array<{ providerFileId: string; filename: string; sizeBytes: number }>> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for Dropbox listFiles");

    const files: Array<{ providerFileId: string; filename: string; sizeBytes: number }> = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const url = cursor
        ? `${DROPBOX_API_BASE}/files/list_folder/continue`
        : `${DROPBOX_API_BASE}/files/list_folder`;
      const body = cursor ? { cursor } : { path: "", recursive: true, limit: 2000 };
      const res = await fetch(url, {
        method: "POST",
        headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Failed to list Dropbox files: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as {
        entries: Array<{ ".tag": string; id?: string; name?: string; size?: number }>;
        cursor?: string;
        has_more: boolean;
      };
      for (const entry of data.entries) {
        if (entry[".tag"] === "file" && entry.id) {
          files.push({
            providerFileId: entry.id,
            filename: entry.name ?? "untitled",
            sizeBytes: Number(entry.size ?? 0),
          });
        }
      }
      cursor = data.cursor;
      hasMore = data.has_more;
    }

    return files;
  }

  /**
   * Server-side copy di Dropbox via files/copy_v2 — data tidak lewat worker.
   * `providerFileId` bisa berupa id ("id:xxx") atau path; Dropbox menerima keduanya
   * sebagai from_path. autorename:true agar nama bentrok otomatis diberi sufiks.
   * Untuk file besar Dropbox bisa balik async_job_id → perlu polling copy_batch/check_v2.
   */
  async copyFile(params: {
    credentials: ProviderCredentials;
    providerFileId: string;
    filename: string;
  }): Promise<{ providerFileId: string }> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for Dropbox copyFile");

    const res = await fetch(`${DROPBOX_API_BASE}/files/copy_v2`, {
      method: "POST",
      headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        from_path: params.providerFileId,
        to_path: `/${params.filename}`,
        autorename: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to copy Dropbox file: ${res.status} ${await res.text()}`);
    }
    const raw = (await res.json()) as any;

    // Case 1: immediate success
    if (raw.metadata?.id) {
      return { providerFileId: raw.metadata.id as string };
    }

    // Case 2: async job — polling (batas 20s biar tidak kena Worker timeout)
    const asyncJobId = raw.async_job_id as string | undefined;
    if (asyncJobId) {
      const deadline = Date.now() + 20_000; // 20 detik, bukan 2 menit
      let waitMs = 600;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, waitMs));
        const checkRes = await fetch(`${DROPBOX_API_BASE}/files/copy_batch/check_v2`, {
          method: "POST",
          headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
          body: JSON.stringify({ async_job_id: asyncJobId }),
        });
        if (!checkRes.ok) {
          throw new Error(`Failed to check Dropbox copy status: ${checkRes.status} ${await checkRes.text()}`);
        }
        const check = (await checkRes.json()) as any;
        const tag = check[".tag"] as string | undefined;
        if (tag === "complete" || tag === "complete_with_metadata") {
          // Entries: array, first entry metadata
          const meta = check.entries?.[0]?.metadata ?? check.entries?.[0] ?? check.metadata ?? check;
          const id = meta?.id ?? meta?.metadata?.id;
          if (id) return { providerFileId: id as string };
          // fallback: if complete but no id, try to list by name
          // Use filename we requested
          // Search via list? For now throw to try fallback listing
          throw new Error("Dropbox async copy selesai tapi tidak mengembalikan id.");
        } else if (tag === "failed") {
          throw new Error(`Dropbox async copy gagal: ${JSON.stringify(check)}`);
        }
        // in_progress → continue polling
        waitMs = Math.min(waitMs * 1.5, 3000);
      }
      // Timeout 20s — coba cari file hasil copy by name sebagai fallback
      try {
        const listRes = await fetch(`${DROPBOX_API_BASE}/files/list_folder`, {
          method: "POST",
          headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
          body: JSON.stringify({ path: "", limit: 200 }),
        });
        if (listRes.ok) {
          const data = (await listRes.json()) as { entries: Array<{ ".tag": string; id?: string; name?: string }> };
          const found = data.entries.find((e) => e[".tag"] === "file" && e.name === params.filename);
          if (found?.id) return { providerFileId: found.id };
          // fallback cari yang mengandung nama (autorename)
          const base = params.filename.replace(/\s*\(copy\)/i, "").trim();
          const fuzzy = data.entries.find((e) => e[".tag"] === "file" && (e.name ?? "").includes(base));
          if (fuzzy?.id) return { providerFileId: fuzzy.id };
        }
      } catch {}
      throw new Error("Dropbox copy melebihi batas waktu tunggu (20 detik) dan fallback pencarian gagal.");
    }

    // Fallback: raw itself maybe is metadata directly
    if (raw.id) return { providerFileId: raw.id as string };

    throw new Error(`Dropbox copy_v2 respons tidak dikenali: ${JSON.stringify(raw).slice(0, 300)}`);
  }

  async refreshAccessToken(params: {
    refreshToken: string;
  }): Promise<{ accessToken: string; expiresAt: string }> {
    const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Dropbox access token: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return { accessToken: data.access_token, expiresAt };
  }
}
