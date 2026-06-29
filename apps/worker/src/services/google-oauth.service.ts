/**
 * Google OAuth 2.0 utility — versi minimal yang hanya perlu:
 *   1. fetchGoogleAccountInfo  — ambil email dari access token
 *   2. exchangeRefreshToken    — tukar refresh token -> access token baru
 *
 * Flow OAuth consent screen (buildGoogleAuthorizationUrl / exchangeGoogleAuthCode) DIHAPUS.
 * Admin sekarang menambahkan akun dengan paste refresh token langsung ke form dashboard,
 * bukan lewat redirect Google consent. Ini lebih simpel dan tidak perlu setup redirect URI.
 */

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";

export interface GoogleTokenExchangeResult {
  accessToken: string;
  expiresAt: string;
}

export interface GoogleAccountInfo {
  email: string;
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
