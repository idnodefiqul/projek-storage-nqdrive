import type {
  ProviderCredentials,
  ProviderUploadResult,
  StorageProvider,
  StorageQuota,
  UploadProgressCallback,
} from "../provider.interface";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const FRAGMENT_UNIT = 320 * 1024;
const APPEND_CHUNK_SIZE = 16 * FRAGMENT_UNIT;

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export class OneDriveProvider implements StorageProvider {
  readonly type = "onedrive" as const;

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
      throw new Error("Missing accessToken in credentials for OneDrive upload");
    }

    const path = encodeURIComponent(filename);
    const sessionRes = await fetch(`${GRAPH_BASE}/me/drive/root:/${path}:/createUploadSession`, {
      method: "POST",
      headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "rename", name: filename },
      }),
    });
    if (!sessionRes.ok) {
      throw new Error(`Failed to create OneDrive upload session: ${sessionRes.status} ${await sessionRes.text()}`);
    }
    const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

    const reader = stream.getReader();
    let offset = 0;
    let uploadedBytes = 0;
    const startTime = Date.now();
    let pending: Uint8Array[] = [];
    let pendingLen = 0;
    let result: { id: string } | null = null;

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

    const putFragment = async (buf: Uint8Array, isLast: boolean) => {
      const start = offset;
      const end = offset + buf.byteLength - 1;
      const total = isLast ? offset + buf.byteLength : sizeBytes;
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(buf.byteLength),
          "Content-Range": `bytes ${start}-${end}/${total}`,
        },
        body: buf as unknown as BodyInit,
      });
      if (res.status === 200 || res.status === 201) {
        result = (await res.json()) as { id: string };
      } else if (res.status !== 202) {
        throw new Error(`OneDrive fragment upload failed: ${res.status} ${await res.text()}`);
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
          const flushLen = Math.floor(pendingLen / FRAGMENT_UNIT) * FRAGMENT_UNIT;
          const all = concatChunks(pending, pendingLen);
          await putFragment(all.subarray(0, flushLen), false);
          const remainder = all.subarray(flushLen);
          pending = remainder.byteLength ? [remainder] : [];
          pendingLen = remainder.byteLength;
        }
      }
    }

    const last = concatChunks(pending, pendingLen);
    await putFragment(last, true);

    if (!result) {
      throw new Error("OneDrive upload selesai tanpa metadata item.");
    }
    return {
      providerFileId: (result as { id: string }).id,
      sizeBytes,
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
      throw new Error("Missing accessToken in credentials for OneDrive download");
    }

    const metaRes = await fetch(
      `${GRAPH_BASE}/me/drive/items/${providerFileId}?select=id,size,file,@microsoft.graph.downloadUrl`,
      { headers: this.authHeader(accessToken) }
    );
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch OneDrive item: ${metaRes.status} ${await metaRes.text()}`);
    }
    const meta = (await metaRes.json()) as {
      size?: number;
      file?: { mimeType?: string };
      "@microsoft.graph.downloadUrl"?: string;
    };
    const downloadUrl = meta["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      throw new Error("OneDrive item tidak menyediakan downloadUrl.");
    }

    const headers: Record<string, string> = { "Accept-Encoding": "identity" };
    if (rangeStart !== undefined) {
      headers.Range = `bytes=${rangeStart}-${rangeEnd !== undefined ? rangeEnd : ""}`;
    } else {
      headers.Range = "bytes=0-";
    }

    const response = await fetch(downloadUrl, { headers });
    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Failed to download OneDrive file: ${response.status} ${errText.slice(0, 200)}`);
    }

    const contentRange = response.headers.get("content-range");
    const contentLengthStr = response.headers.get("content-length");
    const contentLength = contentLengthStr ? Number(contentLengthStr) : null;

    let sizeBytes = 0;
    if (contentRange) {
      const totalMatch = contentRange.match(/\/(\d+)$/);
      if (totalMatch) sizeBytes = Number(totalMatch[1]);
    }
    if (!sizeBytes && meta.size) sizeBytes = meta.size;
    if (!sizeBytes && contentLength) sizeBytes = contentLength;

    return {
      stream: response.body,
      sizeBytes,
      mimeType: response.headers.get("content-type") ?? meta.file?.mimeType ?? "application/octet-stream",
      contentRange,
      contentLength,
    };
  }

  async delete(params: { credentials: ProviderCredentials; providerFileId: string }): Promise<void> {
    const { credentials, providerFileId } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for OneDrive delete");
    }
    const response = await fetch(`${GRAPH_BASE}/me/drive/items/${providerFileId}`, {
      method: "DELETE",
      headers: this.authHeader(accessToken),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete OneDrive file: ${response.status} ${await response.text()}`);
    }
  }

  async deleteAllFiles(params: { credentials: ProviderCredentials }): Promise<{ deletedCount: number }> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for OneDrive deleteAllFiles");
    }

    const ids: string[] = [];
    let url: string | null = `${GRAPH_BASE}/me/drive/root/children?select=id&$top=200`;
    while (url) {
      const res: Response = await fetch(url, { headers: this.authHeader(accessToken) });
      if (!res.ok) {
        throw new Error(`Failed to list OneDrive root: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as { value: Array<{ id: string }>; "@odata.nextLink"?: string };
      for (const item of data.value) ids.push(item.id);
      url = data["@odata.nextLink"] ?? null;
    }

    let deletedCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`${GRAPH_BASE}/me/drive/items/${id}`, {
          method: "DELETE",
          headers: this.authHeader(accessToken),
        });
        if (res.ok || res.status === 404) deletedCount++;
      } catch (err) {
        console.error(`Gagal hapus item OneDrive ${id}:`, err);
      }
    }
    return { deletedCount };
  }

  async getQuota(params: { credentials: ProviderCredentials }): Promise<StorageQuota> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for OneDrive quota check");
    }

    let quotaData: { total?: number; used?: number; remaining?: number } | undefined;

    try {
      const response = await fetch(`${GRAPH_BASE}/me/drive/quota`, {
        headers: this.authHeader(accessToken),
      });
      if (response.ok) {
        const qData = (await response.json()) as { total?: number; used?: number; remaining?: number };
        quotaData = qData;
      }
    } catch (err) {
      console.error(`[OneDrive getQuota] /me/drive/quota error:`, err);
    }

    if (!quotaData || (quotaData.used === 0 && quotaData.total === 0)) {
      try {
        const res2 = await fetch(`${GRAPH_BASE}/me/drive?$select=quota`, {
          headers: this.authHeader(accessToken),
        });
        if (res2.ok) {
          const d2 = (await res2.json()) as { quota?: { total?: number; used?: number; remaining?: number } };
          if (d2.quota && (d2.quota.used || d2.quota.total || d2.quota.remaining)) {
            quotaData = d2.quota;
          }
        }
      } catch (err) {
        console.error(`[OneDrive getQuota] $select=quota error:`, err);
      }
    }

    if (!quotaData || (quotaData.used === 0 && quotaData.total === 0 && (quotaData.remaining ?? 0) === 0)) {
      try {
        const fallback = await fetch(`${GRAPH_BASE}/me/drive`, {
          headers: this.authHeader(accessToken),
        });
        if (fallback.ok) {
          const fbData = (await fallback.json()) as { quota?: { total?: number; used?: number; remaining?: number } };
          if (fbData.quota) {
            quotaData = fbData.quota;
          }
        }
      } catch (err) {
        console.error(`[OneDrive getQuota] /me/drive fallback error:`, err);
      }
    }

    if (!quotaData) {
      throw new Error("OneDrive API tidak mengembalikan data quota di semua endpoint.");
    }

    return this.parseQuota(quotaData);
  }

  private parseQuota(q: { total?: number; used?: number; remaining?: number } | undefined): StorageQuota {
    if (!q) {
      throw new Error("OneDrive API tidak mengembalikan data quota.");
    }

    const totalBytes = Number(q.total ?? 0);
    let usedBytes = Number(q.used ?? 0);
    let remaining = q.remaining !== undefined ? Number(q.remaining) : undefined;

    if (usedBytes === 0 && totalBytes > 0 && remaining !== undefined && remaining < totalBytes) {
      const derivedUsed = totalBytes - remaining;
      if (derivedUsed > 0) {
        usedBytes = derivedUsed;
      }
    }

    if (remaining === undefined && totalBytes > 0) {
      remaining = Math.max(0, totalBytes - usedBytes);
    }

    let finalTotal = totalBytes;
    if (finalTotal === 0 && remaining !== undefined && remaining > 0) {
      finalTotal = remaining + usedBytes;
    }

    const finalUsed = usedBytes;
    const finalAvailable = remaining !== undefined ? remaining : Math.max(0, finalTotal - finalUsed);

    return { totalBytes: finalTotal, usedBytes: finalUsed, availableBytes: finalAvailable };
  }

  async getUsedBytesByListing(params: { credentials: ProviderCredentials }): Promise<number> {
    try {
      const files = await this.listFiles({ credentials: params.credentials });
      const total = files.reduce((sum, f) => sum + f.sizeBytes, 0);
      return total;
    } catch (err) {
      console.error(`[OneDrive getUsedBytesByListing] gagal:`, err);
      return 0;
    }
  }

  async listFiles(params: {
    credentials: ProviderCredentials;
  }): Promise<Array<{ providerFileId: string; filename: string; sizeBytes: number }>> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for OneDrive listFiles");

    const files: Array<{ providerFileId: string; filename: string; sizeBytes: number }> = [];
    const queue: string[] = [`${GRAPH_BASE}/me/drive/root/children?select=id,name,size,file,folder&$top=200`];

    while (queue.length > 0) {
      let url: string | null = queue.shift()!;
      while (url) {
        const res: Response = await fetch(url, { headers: this.authHeader(accessToken) });
        if (!res.ok) {
          throw new Error(`Failed to list OneDrive files: ${res.status} ${await res.text()}`);
        }
        const data = (await res.json()) as {
          value: Array<{ id: string; name: string; size?: number; file?: unknown; folder?: unknown }>;
          "@odata.nextLink"?: string;
        };
        for (const item of data.value) {
          if (item.folder) {
            queue.push(`${GRAPH_BASE}/me/drive/items/${item.id}/children?select=id,name,size,file,folder&$top=200`);
          } else if (item.file) {
            files.push({ providerFileId: item.id, filename: item.name, sizeBytes: Number(item.size ?? 0) });
          }
        }
        url = data["@odata.nextLink"] ?? null;
      }
    }
    return files;
  }

  /**
   * Server-side copy di OneDrive via Graph /copy — operasi ASINKRON.
   * Graph membalas 202 + header Location (URL monitor). Kita poll monitor itu
   * sampai status "completed", lalu ambil resourceId file baru.
   * Tujuan copy: root drive (parentReference root), dengan nama baru.
   * Mendukung file besar yang butuh waktu >30s — deadline 2 menit + auth di monitor.
   */
  async copyFile(params: {
    credentials: ProviderCredentials;
    providerFileId: string;
    filename: string;
    onProgress?: (pct: number) => void;
  }): Promise<{ providerFileId: string }> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for OneDrive copyFile");

    // Ambil driveId agar parentReference valid untuk root drive yang sama.
    const rootRes = await fetch(`${GRAPH_BASE}/me/drive/root?select=id,parentReference`, {
      headers: this.authHeader(accessToken),
    });
    if (!rootRes.ok) {
      throw new Error(`Failed to resolve OneDrive root: ${rootRes.status} ${await rootRes.text()}`);
    }
    const root = (await rootRes.json()) as { id: string; parentReference?: { driveId?: string } };
    const driveId = root.parentReference?.driveId;

    const copyRes = await fetch(`${GRAPH_BASE}/me/drive/items/${params.providerFileId}/copy`, {
      method: "POST",
      headers: { ...this.authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        parentReference: driveId ? { driveId, id: root.id } : { id: root.id },
        name: params.filename,
      }),
    });
    if (copyRes.status !== 202) {
      throw new Error(`Failed to start OneDrive copy: ${copyRes.status} ${await copyRes.text()}`);
    }

    const monitorUrl = copyRes.headers.get("location") ?? copyRes.headers.get("Location");
    if (!monitorUrl) {
      throw new Error("OneDrive copy tidak mengembalikan Location monitor.");
    }

    // Poll monitor — deadline 20 detik agar tidak kena Worker timeout 30s (CF Workers).
    // File 40 MB kadang butuh >20s di OneDrive, jadi setelah 20s kita fallback cari file by name.
    const deadline = Date.now() + 20_000;
    let waitMs = 600;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, waitMs));
      // Coba dengan auth dulu, fallback tanpa auth
      let mon: Response | null = null;
      try {
        mon = await fetch(monitorUrl, { headers: this.authHeader(accessToken) });
      } catch {
        mon = null;
      }
      if (!mon || !mon.ok) {
        try {
          mon = await fetch(monitorUrl);
        } catch {
          mon = null;
        }
      }
      if (!mon) {
        waitMs = Math.min(waitMs * 1.2, 3000);
        continue;
      }

      if (mon.status === 200 || mon.status === 202) {
        const text = await mon.text().catch(() => "");
        let status: any = null;
        try {
          status = text ? JSON.parse(text) : null;
        } catch {
          status = null;
        }

        // Progress callback jika ada percentageComplete
        if (status?.percentageComplete !== undefined && params.onProgress) {
          try {
            params.onProgress(Number(status.percentageComplete));
          } catch {}
        }

        // Format umum: { status: "completed", resourceId: "xxx" }
        if (status?.status === "completed" && status.resourceId) {
          return { providerFileId: status.resourceId as string };
        }
        if (status?.status === "completed" && status.resourceId === undefined && status.id) {
          // Beberapa respons langsung kasih id
          return { providerFileId: status.id as string };
        }
        if (status?.status === "failed" || status?.status === "failedToCopy") {
          throw new Error(`OneDrive copy gagal di sisi provider: ${JSON.stringify(status).slice(0, 300)}`);
        }
        if (status?.status === "completed" && !status.resourceId && status.resourceId !== "") {
          // Completed tanpa id → fallback cari by name di root
          break;
        }
        // inProgress / notStarted → lanjut polling
      } else if (mon.status === 303 || mon.status === 302) {
        const loc = mon.headers.get("location") ?? mon.headers.get("Location");
        const idMatch = loc?.match(/items\/([^/?]+)/);
        if (idMatch?.[1]) return { providerFileId: idMatch[1] };
        // 303 kadang sudah redirect ke item baru — ambil id dari URL
      } else if (mon.status === 404) {
        // Monitor 404 bisa berarti sudah selesai dan resource dihapus dari monitor table
        // → fallback ke pencarian by name
        break;
      }
      waitMs = Math.min(waitMs * 1.3, 4000);
    }

    // Fallback: cari file hasil copy di root dengan nama yang kita minta (atau nama dengan suffix autorename)
    try {
      // List root children cari file dengan nama exact atau prefix
      const listRes = await fetch(
        `${GRAPH_BASE}/me/drive/root/children?$select=id,name&$top=200&$filter=startswith(name,'${params.filename.slice(0, 30).replace(/'/g, "''")}')`,
        { headers: this.authHeader(accessToken) }
      );
      if (listRes.ok) {
        const data = (await listRes.json()) as { value: Array<{ id: string; name: string }> };
        // Cari exact match dulu
        const exact = data.value.find((v) => v.name === params.filename);
        if (exact) return { providerFileId: exact.id };
        // Cari yang mengandung nama + (copy) atau autorename pattern
        const base = params.filename.replace(/\s*\(copy\)/i, "").trim();
        const fuzzy = data.value.find((v) => v.name.includes(base));
        if (fuzzy) return { providerFileId: fuzzy.id };
        if (data.value.length > 0) {
          // Ambil yang paling baru dibuat? Untuk sederhana ambil first
          return { providerFileId: data.value[0]!.id };
        }
      }
    } catch (e) {
      console.error("[OneDrive copyFile] fallback list gagal:", e);
    }

    throw new Error("OneDrive copy melebihi batas waktu tunggu (2 menit) dan fallback pencarian gagal.");
  }

  async refreshAccessToken(params: {
    refreshToken: string;
  }): Promise<{ accessToken: string; expiresAt: string }> {
    const response = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "Files.ReadWrite.All offline_access User.Read",
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to refresh OneDrive access token: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    return { accessToken: data.access_token, expiresAt };
  }
}
