import { StorageProviderFactory } from "@nqdrive/storage";
import { FileRepository } from "../database/file.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { UploadLogRepository } from "../database/upload-log.repository";
import { StorageAllocationService } from "./storage-allocation.service";
import { GoogleAccountConnectionService } from "./google-account-connection.service";
import { slugifyFilename, makeSlugUnique } from "@nqdrive/shared";
import { MAX_FILE_SIZE_BYTES } from "@nqdrive/shared";
import type { Env } from "../config/env";
import type { FileEntity } from "@nqdrive/types";

export class UploadValidationError extends Error {}
export class NoStorageAvailableError extends Error {}

// ─── SECURITY FIX #9: Perluas daftar MIME type yang diblokir ─────────────
// Sebelumnya hanya memblokir 2 MIME type. Banyak format executable lain yang
// perlu diblokir untuk mencegah NQDRIVE jadi hosting malware.
// Catatan: ini bukan pengganti file extension check, karena MIME bisa di-spoof
// via header X-File-Size. Ini best-effort defense layer.
const BLOCKED_MIME_TYPES = new Set([
  // Windows executables
  "application/x-msdownload",
  "application/x-executable",
  "application/x-msdos-program",
  "application/x-ms-installer",
  // Scripts
  "application/x-sh",
  "application/x-bat",
  "application/x-powershell",
  // Java
  "application/java-archive",
  "application/x-java-applet",
  // Other executables
  "application/x-elf",        // Linux ELF binary
  "application/x-mach-binary", // macOS binary
  "application/x-dosexec",
]);

// ─── SECURITY FIX #10: Blokir ekstensi berbahaya terlepas dari MIME type ──
// Attacker bisa upload file dengan Content-Type: application/octet-stream
// tapi nama file .exe — ekstensi check adalah lapisan pertahanan tambahan.
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".vbs", ".js", ".jse",
  ".wsf", ".wsh", ".ps1", ".ps2", ".psc1", ".psc2", ".scr", ".hta",
  ".pif", ".cpl", ".inf", ".ins", ".isp", ".application",
  ".gadget", ".msp", ".mst", ".lnk", ".reg", ".elf",
]);

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

export class UploadService {
  private readonly fileRepository: FileRepository;
  private readonly driveAccountRepository: DriveAccountRepository;
  private readonly uploadLogRepository: UploadLogRepository;
  private readonly allocationService: StorageAllocationService;
  private readonly connectionService: GoogleAccountConnectionService;

  constructor(private readonly env: Env) {
    this.fileRepository = new FileRepository(env.DB);
    this.driveAccountRepository = new DriveAccountRepository(env.DB);
    this.uploadLogRepository = new UploadLogRepository(env.DB);
    this.allocationService = new StorageAllocationService(env.DB);
    this.connectionService = new GoogleAccountConnectionService(env);
  }

  private validate(params: { sizeBytes: number; mimeType: string; filename: string }): void {
    if (params.sizeBytes <= 0) {
      throw new UploadValidationError("Ukuran file tidak valid.");
    }
    if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new UploadValidationError(
        `Ukuran file melebihi batas maksimum (${(MAX_FILE_SIZE_BYTES / (1024 ** 3)).toFixed(0)} GB).`
      );
    }

    // FIX #9: MIME type check yang lebih komprehensif
    if (BLOCKED_MIME_TYPES.has(params.mimeType)) {
      throw new UploadValidationError("Tipe file ini tidak diizinkan untuk diupload.");
    }

    // FIX #10: ekstensi check
    const ext = getExtension(params.filename);
    if (ext && BLOCKED_EXTENSIONS.has(ext)) {
      throw new UploadValidationError(`File dengan ekstensi ${ext} tidak diizinkan untuk diupload.`);
    }

    // FIX #11: filename sanitization — cegah path traversal & null byte injection
    if (params.filename.includes("..") || params.filename.includes("/") || params.filename.includes("\0")) {
      throw new UploadValidationError("Nama file mengandung karakter yang tidak diizinkan.");
    }

    if (params.filename.trim().length === 0 || params.filename.length > 255) {
      throw new UploadValidationError("Nama file tidak valid.");
    }
  }

  async uploadFile(params: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    folderId: number | null;
    stream: ReadableStream<Uint8Array>;
  }): Promise<FileEntity> {
    this.validate(params);

    const account = await this.allocationService.pickAccountForUpload(params.sizeBytes);
    if (!account) {
      throw new NoStorageAvailableError(
        "Tidak ada akun Google Drive dengan ruang kosong yang cukup untuk file ini."
      );
    }

    const accessToken = await this.connectionService.getValidAccessToken(account);
    const provider = StorageProviderFactory.resolve(account.provider);

    const startedAt = Date.now();

    try {
      const uploadResult = await provider.upload({
        credentials: { accessToken },
        filename: params.filename,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        stream: params.stream,
      });

      const slug = await this.generateUniqueSlug(params.filename);

      const file = await this.fileRepository.create({
        filename: params.filename,
        slug,
        providerFileId: uploadResult.providerFileId,
        driveAccountId: account.id,
        folderId: params.folderId,
        sizeBytes: uploadResult.sizeBytes,
        mimeType: uploadResult.mimeType,
        visibility: "private",
      });

      await this.driveAccountRepository.updateQuota(account.id, {
        totalBytes: account.totalStorageBytes,
        usedBytes: account.usedStorageBytes + uploadResult.sizeBytes,
        availableBytes: Math.max(0, account.availableStorageBytes - uploadResult.sizeBytes),
      });

      void this.uploadLogRepository.create({
        fileId: file.id,
        filename: params.filename,
        sizeBytes: uploadResult.sizeBytes,
        driveAccountId: account.id,
        durationMs: Date.now() - startedAt,
        status: "success",
        errorMessage: null,
      });

      return file;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error";

      void this.uploadLogRepository.create({
        fileId: null,
        filename: params.filename,
        sizeBytes: params.sizeBytes,
        driveAccountId: account.id,
        durationMs: Date.now() - startedAt,
        status: "failed",
        errorMessage: message,
      });

      throw error;
    }
  }

  private async generateUniqueSlug(filename: string): Promise<string> {
    let slug = slugifyFilename(filename);

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.fileRepository.findBySlug(slug);
      if (!existing) return slug;
      slug = makeSlugUnique(slugifyFilename(filename));
    }

    throw new Error("Gagal membuat slug unik untuk file setelah beberapa percobaan.");
  }
}
