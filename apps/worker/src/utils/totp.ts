/**
 * Clean & lightweight TOTP (RFC 6238) Implementation using Web Crypto API.
 * 100% compatible with Cloudflare Workers.
 */

// Decode Base32 to ArrayBuffer
function base32Decode(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32.toUpperCase().replace(/=+$/, "");
  const length = clean.length;
  const buffer = new Uint8Array(Math.floor((length * 5) / 8));
  
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < length; i++) {
    const val = alphabet.indexOf(clean[i]!);
    if (val === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer;
}

// Encode bytes to Base32
export function base32Encode(buffer: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let parts: string[] = [];
  let value = 0;
  let bits = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      parts.push(alphabet[(value >>> (bits - 5)) & 31]!);
      bits -= 5;
    }
  }
  if (bits > 0) {
    parts.push(alphabet[(value << (5 - bits)) & 31]!);
  }
  while (parts.length % 8 !== 0) {
    parts.push("=");
  }
  return parts.join("");
}

// Generate random secret key (160 bits / 20 bytes)
export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes).replace(/=/g, "");
}

// Calculate TOTP Token
export async function generateTOTP(secret: string, timeStep = 30): Promise<string> {
  const keyBytes = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = temp >>> 8;
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
  const sigBytes = new Uint8Array(signature);

  const offset = sigBytes[sigBytes.length - 1]! & 0xf;
  const binary =
    ((sigBytes[offset]! & 0x7f) << 24) |
    ((sigBytes[offset + 1]! & 0xff) << 16) |
    ((sigBytes[offset + 2]! & 0xff) << 8) |
    (sigBytes[offset + 3]! & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

// Verify TOTP Token (supports time drift window of +/- 1 step)
export async function verifyTOTP(token: string, secret: string, timeStep = 30): Promise<boolean> {
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || isNaN(Number(cleanToken))) return false;

  const keyBytes = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(epoch / timeStep);

  // Check current, previous, and next counter step for time drift
  for (let i = -1; i <= 1; i++) {
    const counter = currentCounter + i;
    const counterBytes = new Uint8Array(8);
    let temp = counter;
    for (let j = 7; j >= 0; j--) {
      counterBytes[j] = temp & 0xff;
      temp = temp >>> 8;
    }

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
    const sigBytes = new Uint8Array(signature);

    const offset = sigBytes[sigBytes.length - 1]! & 0xf;
    const binary =
      ((sigBytes[offset]! & 0x7f) << 24) |
      ((sigBytes[offset + 1]! & 0xff) << 16) |
      ((sigBytes[offset + 2]! & 0xff) << 8) |
      (sigBytes[offset + 3]! & 0xff);

    const otp = binary % 1000000;
    const currentToken = otp.toString().padStart(6, "0");

    if (currentToken === cleanToken) return true;
  }

  return false;
}
