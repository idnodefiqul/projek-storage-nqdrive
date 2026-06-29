import { StorageProviderFactory } from "@nqdrive/storage";
import { FileRepository } from "../database/file.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "./google-account-connection.service";
import type { Env } from "../config/env";
import type { ParsedRange } from "../utils/range-parser";
import type { FileEntity } from "@nqdrive/types";

export class FileNotAccessibleError extends Error {}

export interface StreamDownloadResult {
  file: FileEntity;
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number; // size of the bytes actually being streamed (full file or range slice)
  totalFileSizeBytes: number; // true total size, needed for Content-Range header
  mimeType: string;
  isPartial: boolean;
}

/**
 * Orchestrates the public download flow: slug -> file metadata -> drive account ->
 * valid access token -> provider stream. Kept separate from the route handler so the
 * route stays focused purely on HTTP concerns (headers, status codes).
 */
export class DownloadService {
  private readonly fileRepository: FileRepository;
  private readonly driveAccountRepository: DriveAccountRepository;
  private readonly connectionService: GoogleAccountConnectionService;

  constructor(private readonly env: Env) {
    this.fileRepository = new FileRepository(env.DB);
    this.driveAccountRepository = new DriveAccountRepository(env.DB);
    this.connectionService = new GoogleAccountConnectionService(env);
  }

  /**
   * Hanya ambil metadata file dari DB tanpa membuka stream ke provider.
   * Dipakai oleh route handler untuk set Content-Length lebih awal
   * menggunakan ukuran yang terpercaya dari DB (bukan dari provider yang bisa NaN/0).
   */
  async getFileInfo(slug: string): Promise<FileEntity | null> {
    const file = await this.fileRepository.findBySlug(slug);
    if (!file || file.visibility !== "public") return null;
    return file;
  }

  /**
   * Resolves a public slug to a streamable file.
   * Throws FileNotAccessibleError for both "doesn't exist" and "exists but private/hidden" —
   * callers must map this to a generic 404, never revealing which case it was (prevents
   * leaking the existence of private files to someone probing slugs).
   */
  async streamBySlug(slug: string, range: ParsedRange | null): Promise<StreamDownloadResult> {
    const file = await this.fileRepository.findBySlug(slug);
    if (!file || file.visibility !== "public") {
      throw new FileNotAccessibleError("File tidak ditemukan.");
    }

    const account = await this.driveAccountRepository.findById(file.driveAccountId);
    if (!account) {
      throw new Error(`Drive account ${file.driveAccountId} for file ${file.id} not found`);
    }

    const accessToken = await this.connectionService.getValidAccessToken(account);
    const provider = StorageProviderFactory.resolve(account.provider);

    const result = await provider.download({
      credentials: { accessToken },
      providerFileId: file.providerFileId,
      rangeStart: range?.start,
      rangeEnd: range?.end,
    });

    // Fire-and-forget bookkeeping — never block the response on these.
    void this.fileRepository.incrementDownloadCount(file.id);

    return {
      file,
      stream: result.stream,
      sizeBytes: range ? range.end - range.start + 1 : result.sizeBytes,
      // Prioritaskan sizeBytes dari DB karena lebih andal daripada provider
      // (Google Drive kadang return undefined/NaN untuk file tertentu)
      totalFileSizeBytes: file.sizeBytes > 0 ? file.sizeBytes : result.sizeBytes,
      mimeType: file.mimeType || result.mimeType,
      isPartial: range !== null,
    };
  }
}
