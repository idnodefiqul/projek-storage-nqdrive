import { StorageProviderFactory } from "@nqdrive/storage";
import { FileRepository } from "../database/file.repository";
import { FolderRepository } from "../database/folder.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { DownloadLogRepository } from "../database/download-log.repository";
import { GoogleAccountConnectionService } from "./google-account-connection.service";
import { resolveCredentials } from "../utils/credentials";
import type { Env } from "../config/env";
import type { ParsedRange } from "../utils/range-parser";
import { extractRealIp } from "../utils/ip-parser";
import { resolveCountry } from "../utils/geo-resolver";
import type { FileEntity } from "@nqdrive/types";
import type { Context } from "hono";

export class FileNotAccessibleError extends Error {}

export interface StreamDownloadResult {
  file: FileEntity;
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number;
  totalFileSizeBytes: number;
  mimeType: string;
  isPartial: boolean;
  /** Content-Range header langsung dari Google Drive response. */
  contentRange: string | null;
  /** Content-Length header langsung dari Google Drive response. */
  contentLength: number | null;
}

export class DownloadService {
  private readonly fileRepository: FileRepository;
  private readonly driveAccountRepository: DriveAccountRepository;
  private readonly connectionService: GoogleAccountConnectionService;

  constructor(private readonly env: Env) {
    this.fileRepository = new FileRepository(env.DB);
    this.driveAccountRepository = new DriveAccountRepository(env.DB);
    this.connectionService = new GoogleAccountConnectionService(env);
  }

  async getFileInfo(slug: string): Promise<FileEntity | null> {
    const file = await this.fileRepository.findBySlug(slug);
    if (!file || file.visibility !== "public") return null;
    return file;
  }

  async getFileInfoByShareCode(shareCode: string): Promise<FileEntity | null> {
    const file = await this.fileRepository.findByShareCode(shareCode);
    if (!file || file.visibility !== "public") return null;
    return file;
  }

  /**
   * FIX: Ambil ukuran file langsung dari Google Drive API (metadata only, bukan stream).
   * Dipanggil hanya jika sizeBytes di DB = 0 atau tidak valid.
   * Ini adalah 1 request ringan ke Drive API, tidak membuka stream file sama sekali.
   */
  async getFileSizeFromProvider(slug: string): Promise<number | null> {
    try {
      const file = await this.fileRepository.findBySlug(slug);
      if (!file || file.visibility !== "public") return null;

      const account = await this.driveAccountRepository.findById(file.driveAccountId);
      if (!account) return null;

      // Fallback ini spesifik Google Drive (metadata API). Untuk provider lain
      // (mis. Dropbox) lewati — ukuran sudah tersimpan di DB saat finalize upload.
      if (account.provider !== "google_drive") return null;

      const accessToken = await this.connectionService.getValidAccessToken(account);

      // Hanya request metadata fields=size — sangat ringan, tidak membuka stream
      const metaResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.providerFileId}?fields=size`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!metaResponse.ok) return null;

      const meta = (await metaResponse.json()) as { size?: string };
      const size = Number(meta.size ?? 0);
      return size > 0 ? size : null;
    } catch {
      return null;
    }
  }

  /**
   * FIX: Update sizeBytes di DB supaya download berikutnya langsung dapat
   * Content-Length yang benar tanpa perlu request extra ke Google Drive.
   * Dipanggil fire-and-forget (void).
   */
  async fixFileSizeInDb(fileId: number, sizeBytes: number): Promise<void> {
    try {
      await this.fileRepository.updateSizeBytes(fileId, sizeBytes);
    } catch {
      // Jangan throw — ini background fix, jangan ganggu response utama
    }
  }

  /**
   * FIX: Fallback terakhir saat ukuran file benar-benar tidak bisa diketahui.
   * Serve file tanpa Content-Length (chunked) — resume tidak bisa, tapi file tetap bisa didownload.
   */
  async streamWithoutSize(
    c: Context<{ Bindings: Env }>,
    slug: string,
    downloadLogRepository: DownloadLogRepository,
    fileInfo: FileEntity
  ): Promise<Response> {
    const result = await this.streamBySlug(slug, null);

    const ipAddress = extractRealIp(c);
    const cfCountry = (c.req.raw.cf?.country as string) || null;

    c.executionCtx.waitUntil(
      resolveCountry(ipAddress, cfCountry).then((country) =>
        downloadLogRepository.create({
          fileId: fileInfo.id,
          ipAddress,
          country,
          userAgent: c.req.header("User-Agent") ?? null,
          bytesServed: 0,
          status: "completed",
        })
      )
    );

    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    // Tanpa Content-Length dan Content-Range — browser masih bisa download
    // tapi tidak bisa pause/resume dan tidak tahu total ukuran
    headers.set("Content-Disposition", `attachment; filename="${fileInfo.filename.replace(/"/g, "'")}"`);
    headers.set("Cache-Control", "no-store"); // Jangan cache yang tidak punya size

    return new Response(result.stream, { status: 200, headers });
  }

  async streamBySlug(slug: string, range: ParsedRange | null): Promise<StreamDownloadResult> {
    const file = await this.fileRepository.findBySlug(slug);
    if (!file || file.visibility !== "public") {
      throw new FileNotAccessibleError("File tidak ditemukan.");
    }
    return this.streamByFile(file, range);
  }

  async streamByFile(file: FileEntity, range: ParsedRange | null): Promise<StreamDownloadResult> {
    if (!file || (file.visibility as any) !== "public") {
      throw new FileNotAccessibleError("File tidak ditemukan.");
    }

    const account = await this.driveAccountRepository.findById(file.driveAccountId);
    if (!account) {
      throw new Error(`Drive account ${file.driveAccountId} for file ${file.id} not found`);
    }

    const credentials = await resolveCredentials(account, this.env);
    const provider = StorageProviderFactory.resolve(account.provider);

    const result = await provider.download({
      credentials: credentials as any,
      providerFileId: file.providerFileId,
      rangeStart: range?.start,
      rangeEnd: range?.end,
    });

    // Increment download count hanya untuk request pertama (bukan Range chunk lanjutan).
    if (!range || range.start === 0) {
      await this.fileRepository.incrementDownloadCount(file.id).catch(console.error);
    }

    return {
      file,
      stream: result.stream,
      sizeBytes: range ? range.end - range.start + 1 : result.sizeBytes,
      totalFileSizeBytes: file.sizeBytes > 0 ? file.sizeBytes : result.sizeBytes,
      mimeType: file.mimeType || result.mimeType,
      isPartial: range !== null,
      contentRange: result.contentRange,
      contentLength: result.contentLength,
    };
  }
  async streamPublicFolderFile(
    shareUuid: string,
    pathSegments: string[],
    range: ParsedRange | null
  ): Promise<StreamDownloadResult> {
    const folderRepository = new FolderRepository(this.env.DB);
    const root = await folderRepository.findByShareUuid(shareUuid);
    if (!root) throw new FileNotAccessibleError("Folder tidak ditemukan.");

    if (pathSegments.length === 0) {
      throw new FileNotAccessibleError("Nama file tidak ada di path.");
    }

    const filename = pathSegments[pathSegments.length - 1]!;
    const subfolderSegments = pathSegments.slice(0, -1);

    const targetFolder = subfolderSegments.length === 0
      ? root
      : await folderRepository.resolveSubfolderBySlug(root.id, subfolderSegments);

    if (!targetFolder) throw new FileNotAccessibleError("Subfolder tidak ditemukan.");

    const file = await this.fileRepository.findByFolderIdAndSlug(targetFolder.id, filename);
    if (!file) throw new FileNotAccessibleError("File tidak ditemukan.");

    const account = await this.driveAccountRepository.findById(file.driveAccountId);
    if (!account) throw new Error(`Drive account ${file.driveAccountId} for file ${file.id} not found`);

    const credentials = await resolveCredentials(account, this.env);
    const provider = StorageProviderFactory.resolve(account.provider);

    const result = await provider.download({
      credentials: credentials as any,
      providerFileId: file.providerFileId,
      rangeStart: range?.start,
      rangeEnd: range?.end,
    });

    if (!range || range.start === 0) {
      await this.fileRepository.incrementDownloadCount(file.id).catch(console.error);
    }

    return {
      file,
      stream: result.stream,
      sizeBytes: range ? range.end - range.start + 1 : result.sizeBytes,
      totalFileSizeBytes: file.sizeBytes > 0 ? file.sizeBytes : result.sizeBytes,
      mimeType: file.mimeType || result.mimeType,
      isPartial: range !== null,
      contentRange: result.contentRange,
      contentLength: result.contentLength,
    };
  }
}
