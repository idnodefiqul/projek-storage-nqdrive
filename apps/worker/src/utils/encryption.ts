/**
 * Encryption utility for sensitive secrets at rest (e.g. Google Drive refresh tokens).
 *
 * Design rationale:
 * Uses the Web Crypto API (`crypto.subtle`), available natively in the Workers runtime —
 * no external dependency needed. AES-256-GCM is chosen specifically because it is an
 * "authenticated encryption" mode: besides keeping the token secret, it also detects any
 * tampering with the ciphertext (the auth tag fails to verify), unlike plain AES-CBC.
 *
 * Storage format: the encrypted value persisted in D1 is a single base64 string containing
 * [12-byte IV][ciphertext+authTag], so a single TEXT column is enough — no extra columns
 * needed for the IV.
 */

const ALGORITHM = "AES-GCM";
const IV_LENGTH_BYTES = 12; // 96-bit IV, the recommended length for AES-GCM

/**
 * Derives a CryptoKey from the raw base64-encoded ENCRYPTION_KEY secret.
 * The secret must be a 32-byte (256-bit) key encoded as base64 — generate with:
 *   openssl rand -base64 32
 */
async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const rawKey = base64ToBytes(base64Key);
  return crypto.subtle.importKey("raw", rawKey, ALGORITHM, false, ["encrypt", "decrypt"]);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binaryString);
}

/**
 * Encrypts a plaintext string (e.g. a Google OAuth refresh token) and returns a single
 * base64 string safe to store directly in a D1 TEXT column.
 */
export async function encryptSecret(plaintext: string, encryptionKeyBase64: string): Promise<string> {
  const key = await importEncryptionKey(encryptionKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  // Concatenate IV + ciphertext so decryption only needs the single stored string.
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypts a value previously produced by `encryptSecret`.
 * Throws if the ciphertext was tampered with or the key is wrong (auth tag verification fails).
 */
export async function decryptSecret(encryptedBase64: string, encryptionKeyBase64: string): Promise<string> {
  const key = await importEncryptionKey(encryptionKeyBase64);
  const combined = base64ToBytes(encryptedBase64);

  const iv = combined.slice(0, IV_LENGTH_BYTES);
  const ciphertext = combined.slice(IV_LENGTH_BYTES);

  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
