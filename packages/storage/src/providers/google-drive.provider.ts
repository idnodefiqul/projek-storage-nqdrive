import type {
  ProviderCredentials,
  ProviderUploadResult,
  StorageProvider,
  StorageQuota,
  UploadProgressCallback,
} from "../provider.interface";

const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * GoogleDriveProvider — concrete StorageProvider implementation backed by the Google Drive API.
 *
 * This is the first and currently the only "live" provider. It implements every method of the
 * StorageProvider interface and contains zero application-specific logic (no D1 queries, no
 * Hono context) — keeping it a pure, testable adapter to an external API, which is what makes
 * it swappable for R2/S3/etc. later without touching callers.
 */
export class GoogleDriveProvider implements StorageProvider {
  readonly type = "google_drive" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async upload(params: {
    credentials: ProviderCredentials;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    stream: ReadableStream<Uint8Array>;
    onProgress?: UploadProgressCallback;
  }): Promise<ProviderUploadResult> {
    const { credentials, filename, mimeType, sizeBytes, stream, onProgress } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Google Drive upload");
    }

    // Step 1: initiate a resumable upload session.
    const sessionResponse = await fetch(
      `${GOOGLE_DRIVE_UPLOAD_BASE}/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(sizeBytes),
        },
        body: JSON.stringify({ name: filename }),
      }
    );

    if (!sessionResponse.ok) {
      throw new Error(
        `Failed to initiate Google Drive upload session: ${sessionResponse.status} ${await sessionResponse.text()}`
      );
    }

    const uploadUrl = sessionResponse.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("Google Drive did not return a resumable upload URL");
    }

    // Step 2: stream the body, tracking progress as chunks pass through.
    let uploadedBytes = 0;
    const startTime = Date.now();

    const progressStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        uploadedBytes += chunk.byteLength;
        controller.enqueue(chunk);

        if (onProgress) {
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
        }
      },
    });

    // FIX: duplex: "half" is required by Cloudflare Workers when sending a ReadableStream
    // as the fetch body. Without this, the Worker runtime throws a TypeError at upload time.
    const uploadResponse = await (fetch as typeof fetch)(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(sizeBytes),
      },
      body: stream.pipeThrough(progressStream),
      // @ts-ignore — CF Workers requires duplex: "half" for streaming request bodies.
      duplex: "half",
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Google Drive upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`
      );
    }

    const result = (await uploadResponse.json()) as { id: string };

    return {
      providerFileId: result.id,
      sizeBytes,
      mimeType,
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
      throw new Error("Missing accessToken in credentials for Google Drive download");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      // Paksa Google tidak mengompresi response (chunked gzip merusak Content-Length)
      "Accept-Encoding": "identity",
    };

    // Trik kunci: selalu kirim Range header ke Google Drive.
    // Tanpa Range, Google kadang membalas 200 + Transfer-Encoding: chunked TANPA Content-Length.
    // Dengan Range: bytes=0-, Google SELALU membalas 206 + Content-Range + Content-Length yang valid.
    // Ini sumber kebenaran ukuran file yang paling akurat — lebih andal dari metadata API terpisah.
    if (rangeStart !== undefined) {
      // Client meminta sebagian file (resume download)
      headers.Range = `bytes=${rangeStart}-${rangeEnd !== undefined ? rangeEnd : ""}`;
    } else {
      // Download penuh — paksakan 206 agar Content-Length tidak dihapus Cloudflare CDN
      headers.Range = "bytes=0-";
    }

    const contentResponse = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files/${providerFileId}?alt=media&acknowledgeAbuse=true`,
      { headers }
    );

    if (!contentResponse.ok || !contentResponse.body) {
      const errText = await contentResponse.text().catch(() => "");
      throw new Error(
        `Failed to download Google Drive file content: ${contentResponse.status} ${errText.slice(0, 200)}`
      );
    }

    // Ambil Content-Range dari response Google (misal: "bytes 0-149999999/150000000")
    // Ini jauh lebih andal dari metadata API terpisah karena:
    //   1. Tidak perlu request extra ke Google
    //   2. Nilainya adalah ukuran byte aktual file di storage Google
    //   3. Selalu ada karena kita memaksa Range: bytes=0-
    const contentRange = contentResponse.headers.get("content-range");
    const contentLengthStr = contentResponse.headers.get("content-length");
    const contentLength = contentLengthStr ? Number(contentLengthStr) : null;

    // Parse total file size dari Content-Range header: "bytes START-END/TOTAL"
    let sizeBytes = 0;
    if (contentRange) {
      const totalMatch = contentRange.match(/\/(\d+)$/);
      if (totalMatch) sizeBytes = Number(totalMatch[1]);
    }
    // Fallback ke Content-Length jika tidak ada Content-Range
    if (!sizeBytes && contentLength) sizeBytes = contentLength;

    return {
      stream: contentResponse.body,
      sizeBytes,
      mimeType: contentResponse.headers.get("content-type") ?? "application/octet-stream",
      contentRange,
      contentLength,
    };
  }

  async delete(params: { credentials: ProviderCredentials; providerFileId: string }): Promise<void> {
    const { credentials, providerFileId } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Google Drive delete");
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/files/${providerFileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Failed to delete Google Drive file: ${response.status} ${await response.text()}`
      );
    }
  }

  async getQuota(params: { credentials: ProviderCredentials }): Promise<StorageQuota> {
    const accessToken = params.credentials.accessToken;
    if (!accessToken) {
      throw new Error("Missing accessToken in credentials for Google Drive quota check");
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/about?fields=storageQuota`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Google Drive quota: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as {
      storageQuota: { limit?: string; usage?: string };
    };

    const totalBytes = Number(data.storageQuota.limit ?? 0);
    const usedBytes = Number(data.storageQuota.usage ?? 0);

    return {
      totalBytes,
      usedBytes,
      availableBytes: Math.max(0, totalBytes - usedBytes),
    };
  }

  async rename(params: { credentials: ProviderCredentials; providerFileId: string; newName: string }): Promise<void> {
    const { credentials, providerFileId, newName } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for Google Drive rename");

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/files/${providerFileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to rename file on Google Drive: ${response.status} ${await response.text()}`);
    }
  }

  async getContent(params: { credentials: ProviderCredentials; providerFileId: string }): Promise<string> {
    const { credentials, providerFileId } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for Google Drive getContent");

    const response = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files/${providerFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to read file from Google Drive: ${response.status}`);
    }

    return await response.text();
  }

  async updateContent(params: {
    credentials: ProviderCredentials;
    providerFileId: string;
    content: string;
    mimeType: string;
  }): Promise<void> {
    const { credentials, providerFileId, content, mimeType } = params;
    const accessToken = credentials.accessToken;
    if (!accessToken) throw new Error("Missing accessToken for Google Drive updateContent");

    const response = await fetch(
      `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${providerFileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType,
        },
        body: content,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update file on Google Drive: ${response.status}`);
    }
  }

  async refreshAccessToken(params: {
    refreshToken: string;
  }): Promise<{ accessToken: string; expiresAt: string }> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: params.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to refresh Google Drive access token: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return { accessToken: data.access_token, expiresAt };
  }
}
