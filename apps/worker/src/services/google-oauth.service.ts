/**
 * Google OAuth 2.0 utility.
 *
 * Dua cara menambahkan akun Google Drive:
 *   A. OAuth consent flow (DIREKOMENDASIKAN) — admin klik "Login dengan Google",
 *      izinkan di halaman Google, worker menukar `code` -> refresh token otomatis.
 *        - buildGoogleAuthUrl   — bikin URL consent screen
 *        - exchangeAuthCode     — tukar authorization code -> { accessToken, refreshToken }
 *   B. Paste refresh token manual (cara lama, tetap didukung sebagai fallback).
 *        - exchangeRefreshToken — tukar refresh token -> access token baru
 *
 * Keduanya berbagi helper fetchGoogleAccountInfo untuk ambil email + validasi scope drive.
 */

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export interface GoogleTokenExchangeResult {
  accessToken: string;
  expiresAt: string;
}

export interface GoogleAuthCodeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface GoogleAccountInfo {
  email: string;
}

/**
 * Bangun URL Google OAuth consent screen.
 *
 * access_type=offline + prompt=consent WAJIB agar Google mengembalikan refresh_token —
 * tanpa keduanya, Google hanya memberi access token (yang expired 1 jam) dan akun jadi
 * tidak bisa dipakai jangka panjang. `state` diteruskan balik apa adanya oleh Google,
 * dipakai untuk proteksi CSRF di callback.
 */
export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: params.state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${query.toString()}`;
}

/**
 * Tukar authorization code (dari callback Google) menjadi access + refresh token.
 * redirectUri HARUS sama persis dengan yang dipakai di buildGoogleAuthUrl, kalau tidak
 * Google menolak dengan redirect_uri_mismatch.
 */
export async function exchangeAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleAuthCodeResult> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // Log detail asli Google untuk debugging (invalid_grant / redirect_uri_mismatch / dll)
    console.error("[exchangeAuthCode] Google menolak:", response.status, detail);
    throw new Error("Gagal menukar kode otorisasi Google. Coba hubungkan ulang akun.");
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Google tidak mengembalikan access token.");
  }

  // refresh_token hanya dikirim saat access_type=offline + consent baru. Kalau kosong,
  // biasanya akun sudah pernah di-grant tanpa prompt=consent — beri pesan yang jelas.
  if (!data.refresh_token) {
    throw new Error(
      "Google tidak mengembalikan refresh token. Cabut akses aplikasi di " +
      "myaccount.google.com/permissions lalu hubungkan ulang."
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

/**
 * Tukar refresh token jadi access token baru.
 * SECURITY: error message dari Google API TIDAK diteruskan ke client
 * untuk mencegah info leakage tentang validity token.
 */
export async function exchangeRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenExchangeResult> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    // SECURITY: jangan teruskan error body Google ke caller — bisa bocorkan info token
    throw new Error("Refresh token tidak valid atau sudah dicabut. Pastikan refresh token yang dimasukkan benar.");
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    error?: string;
  };

  if (!data.access_token) {
    throw new Error("Google tidak mengembalikan access token yang valid.");
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Ambil email akun Google dari access token.
 * SECURITY: validasi token via tokeninfo endpoint sebelum fetch userinfo
 * untuk memastikan token memiliki scope drive yang dibutuhkan.
 */
export async function fetchGoogleAccountInfo(accessToken: string): Promise<GoogleAccountInfo> {
  // Validasi scope: pastikan token punya scope drive (bukan cuma email/profile)
  const tokenInfoResponse = await fetch(
    `${GOOGLE_TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`
  );

  if (!tokenInfoResponse.ok) {
    throw new Error("Access token tidak valid.");
  }

  const tokenInfo = (await tokenInfoResponse.json()) as {
    scope?: string;
    error?: string;
  };

  const scope = tokenInfo.scope ?? "";
  const hasDriveScope =
    scope.includes("https://www.googleapis.com/auth/drive") ||
    scope.includes("https://www.googleapis.com/auth/drive.file");

  if (!hasDriveScope) {
    throw new Error(
      "Refresh token tidak memiliki scope akses Google Drive. " +
      "Pastikan scope 'https://www.googleapis.com/auth/drive' sudah di-grant saat membuat token."
    );
  }

  // Fetch email menggunakan Google Drive API
  // Hal ini karena refresh token yang dibuat via OAuth Playground / rclone 
  // seringkali HANYA memiliki scope 'drive' dan TIDAK memiliki scope 'email' atau 'profile',
  // sehingga memanggil oauth2/v2/userinfo akan gagal (403 Insufficient Permission).
  const driveAboutResponse = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!driveAboutResponse.ok) {
    throw new Error("Gagal mengambil informasi akun Google (pastikan token valid dan API Drive aktif).");
  }

  const data = (await driveAboutResponse.json()) as { user?: { emailAddress?: string } };
  if (!data.user?.emailAddress) {
    throw new Error("Akun Google tidak mengembalikan alamat email.");
  }

  return { email: data.user.emailAddress };
}
