/**
 * Password hashing utility using PBKDF2-SHA256 via the Web Crypto API.
 *
 * Design rationale:
 * Workers' V8 isolate has no Node.js native bindings, so libraries like bcrypt/argon2
 * (which rely on native code) cannot run here. PBKDF2 is implemented entirely with
 * `crypto.subtle`, which is natively available in the Workers runtime. 100,000 iterations
 * is OWASP's current minimum recommendation for PBKDF2-SHA256, balancing brute-force
 * resistance against acceptable latency for a single login request.
 *
 * Storage format: a single string `pbkdf2$<iterations>$<saltBase64>$<hashBase64>` is stored
 * in `users.password_hash` — self-describing, so iteration count can be increased later
 * without invalidating old hashes (old ones just keep using their stored iteration count).
 */

const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 100_000;
const SALT_LENGTH_BYTES = 16;
const KEY_LENGTH_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) binaryString += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binaryString);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt, iterations, hash: HASH },
    keyMaterial,
    KEY_LENGTH_BITS
  );

  return new Uint8Array(derivedBits);
}

/** Hashes a plaintext password into the self-describing storage format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const derived = await deriveKey(password, salt, ITERATIONS);

  return `pbkdf2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

/**
 * Verifies a plaintext password against a stored hash.
 * Uses constant-time comparison to avoid leaking hash equality via timing side-channels.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false; // Unrecognized hash format — fail closed.
  }

  const iterationsPart = parts[1];
  const saltPart = parts[2];
  const hashPart = parts[3];
  if (!iterationsPart || !saltPart || !hashPart) {
    return false; // Malformed hash — fail closed.
  }

  const iterations = Number(iterationsPart);
  const salt = base64ToBytes(saltPart);
  const expectedHash = base64ToBytes(hashPart);

  const actualHash = await deriveKey(password, salt, iterations);

  if (actualHash.length !== expectedHash.length) return false;

  let mismatch = 0;
  for (let i = 0; i < actualHash.length; i++) {
    mismatch |= (actualHash[i] ?? 0) ^ (expectedHash[i] ?? 0);
  }
  return mismatch === 0;
}
