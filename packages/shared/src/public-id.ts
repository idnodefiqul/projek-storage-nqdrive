/**
 * Public ID generator & validator — professional replacement for exposed integer PKs.
 *
 * Format: <prefix>_<26-32 char random>
 * Examples:
 *  sadm_01J5K...  → Super Admin (admin existing di tabel users)
 *  usr_01J5K...   → Regular User (future, reserved)
 *  acc_...       → Storage Account (drive_accounts)
 *  fld_...       → Folder
 *  fil_...       → File
 *  tsk_...       → Migration Job / Task
 *  api_...       → API Key
 *  aud_...       → Audit Log
 *  upl_...       → Upload Log
 *  dnl_...       → Download Log
 *  ses_...       → Upload Session
 *  shr_...       → Share
 */

export const PUBLIC_ID_PREFIXES = {
  superAdmin: "sadm",
  user: "usr",
  account: "acc",
  folder: "fld",
  file: "fil",
  task: "tsk",
  apiKey: "api",
  audit: "aud",
  uploadLog: "upl",
  downloadLog: "dnl",
  session: "ses",
  share: "shr",
  migrationItem: "mit",
} as const;

export type PublicIdPrefix = (typeof PUBLIC_ID_PREFIXES)[keyof typeof PUBLIC_ID_PREFIXES];

// All prefixes list for validation
export const ALL_PUBLIC_ID_PREFIXES = Object.values(PUBLIC_ID_PREFIXES) as PublicIdPrefix[];

// Regex untuk validasi public_id — prefix + underscore + 20-34 alphanumeric (base36 + hex safe)
export const PUBLIC_ID_REGEX = /^(sadm|usr|acc|fld|fil|tsk|api|aud|upl|dnl|ses|shr|mit)_[A-Za-z0-9]{20,34}$/;

// Per-entity regex (lebih strict) — berguna untuk Zod
export const PUBLIC_ID_REGEX_MAP: Record<PublicIdPrefix, RegExp> = {
  sadm: /^sadm_[A-Za-z0-9]{20,34}$/,
  usr: /^usr_[A-Za-z0-9]{20,34}$/,
  acc: /^acc_[A-Za-z0-9]{20,34}$/,
  fld: /^fld_[A-Za-z0-9]{20,34}$/,
  fil: /^fil_[A-Za-z0-9]{20,34}$/,
  tsk: /^tsk_[A-Za-z0-9]{20,34}$/,
  api: /^api_[A-Za-z0-9]{20,34}$/,
  aud: /^aud_[A-Za-z0-9]{20,34}$/,
  upl: /^upl_[A-Za-z0-9]{20,34}$/,
  dnl: /^dnl_[A-Za-z0-9]{20,34}$/,
  ses: /^ses_[A-Za-z0-9]{20,34}$/,
  shr: /^shr_[A-Za-z0-9]{20,34}$/,
  mit: /^mit_[A-Za-z0-9]{20,34}$/,
};

/**
 * Generate cryptographically random alphanumeric string.
 * Works in both Node, Browser, and Cloudflare Workers (uses Web Crypto if available).
 */
function randomAlphanumeric(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  // Use crypto.getRandomValues if available (Workers + Browser + Node >=19)
  const gCrypto = (globalThis as any).crypto as { getRandomValues?: (arr: Uint8Array) => Uint8Array } | undefined;
  if (typeof gCrypto !== "undefined" && gCrypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    gCrypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i]! % chars.length];
    }
    return result;
  }
  // Fallback to Math.random (should not happen in production, but safe)
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a public ID with given prefix.
 * @param prefix - e.g. "acc", "fil", "fld", "sadm", "usr"
 * @param randomLength - length of random part, default 26 (like ULID length)
 */
export function generatePublicId(prefix: PublicIdPrefix | string, randomLength = 26): string {
  // Normalize prefix lowercase
  const p = prefix.toLowerCase();
  return `${p}_${randomAlphanumeric(randomLength)}`;
}

/**
 * Check if a string looks like a public ID (any known prefix).
 */
export function isPublicId(value: string): boolean {
  if (typeof value !== "string") return false;
  return PUBLIC_ID_REGEX.test(value);
}

/**
 * Check if a string is a public ID with specific prefix.
 */
export function isPublicIdOf(value: string, prefix: PublicIdPrefix | string): boolean {
  if (typeof value !== "string") return false;
  const re = PUBLIC_ID_REGEX_MAP[prefix as PublicIdPrefix] ?? new RegExp(`^${prefix}_[A-Za-z0-9]{20,34}$`);
  return re.test(value);
}

/**
 * Parse prefix from public ID.
 * @example parsePublicIdPrefix("acc_abc123") => "acc"
 */
export function parsePublicIdPrefix(publicId: string): PublicIdPrefix | null {
  if (!isPublicId(publicId)) return null;
  const idx = publicId.indexOf("_");
  if (idx === -1) return null;
  const prefix = publicId.slice(0, idx) as PublicIdPrefix;
  return (ALL_PUBLIC_ID_PREFIXES as string[]).includes(prefix) ? prefix : null;
}

/**
 * Check if value is a legacy numeric integer ID (string or number).
 * Used for dual-mode compatibility during migration.
 */
export function isLegacyNumericId(value: string | number): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  if (typeof value !== "string") return false;
  // Only digits, no prefix
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
  }
  return false;
}

/**
 * Check if input is either public ID or legacy numeric ID (dual-mode).
 */
export function isPublicOrLegacyId(value: string | number): boolean {
  if (isLegacyNumericId(value)) return true;
  if (typeof value === "string" && isPublicId(value)) return true;
  return false;
}

/**
 * Legacy helpers for naming consistency with formatid.md
 * These generate IDs for specific entities with correct prefix.
 */
export const PublicIdGenerator = {
  superAdmin: () => generatePublicId(PUBLIC_ID_PREFIXES.superAdmin),
  user: () => generatePublicId(PUBLIC_ID_PREFIXES.user),
  account: () => generatePublicId(PUBLIC_ID_PREFIXES.account),
  folder: () => generatePublicId(PUBLIC_ID_PREFIXES.folder),
  file: () => generatePublicId(PUBLIC_ID_PREFIXES.file),
  task: () => generatePublicId(PUBLIC_ID_PREFIXES.task),
  apiKey: () => generatePublicId(PUBLIC_ID_PREFIXES.apiKey),
  audit: () => generatePublicId(PUBLIC_ID_PREFIXES.audit),
  uploadLog: () => generatePublicId(PUBLIC_ID_PREFIXES.uploadLog),
  downloadLog: () => generatePublicId(PUBLIC_ID_PREFIXES.downloadLog),
  session: () => generatePublicId(PUBLIC_ID_PREFIXES.session),
  share: () => generatePublicId(PUBLIC_ID_PREFIXES.share),
  migrationItem: () => generatePublicId(PUBLIC_ID_PREFIXES.migrationItem),
};
