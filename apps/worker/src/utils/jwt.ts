/**
 * Minimal JWT (HS256) implementation using the Web Crypto API.
 *
 * Design rationale: same reasoning as password.ts — no Node-native JWT library can run in
 * the Workers isolate, so signing/verification is implemented directly with `crypto.subtle`
 * HMAC. Only HS256 is supported since NQDRIVE only ever signs and verifies with a single
 * shared secret (JWT_SECRET) — there is no need for asymmetric algorithms here.
 */

import type { JwtPayload } from "@nqdrive/types";

function base64UrlEncode(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) binaryString += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binaryString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binaryString = atob(padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encodeJsonAsBase64Url(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs a JWT payload, returning the full `header.payload.signature` token string. */
export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  expirySeconds: number
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expirySeconds,
  };

  const encodedHeader = encodeJsonAsBase64Url(header);
  const encodedPayload = encodeJsonAsBase64Url(fullPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Verifies a JWT's signature and expiry, returning the decoded payload if valid.
 * Returns null for any failure (malformed token, bad signature, expired) — callers should
 * treat null uniformly as "not authenticated" without distinguishing the exact reason,
 * to avoid leaking information useful to an attacker.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const signingInput = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await importHmacKey(secret);
    const signatureBytes = base64UrlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!isValid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JwtPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null; // Expired.

    return payload;
  } catch {
    return null; // Malformed token, decode failure, etc.
  }
}
