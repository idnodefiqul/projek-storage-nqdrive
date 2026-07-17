const DROPBOX_OAUTH_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_OAUTH_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";

export interface DropboxAuthCodeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface DropboxTokenExchangeResult {
  accessToken: string;
  expiresAt: string;
}

export interface DropboxAccountInfo {
  email: string;
}

export function buildDropboxAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    token_access_type: "offline",
    state: params.state,
  });
  return `${DROPBOX_OAUTH_AUTH_URL}?${query.toString()}`;
}

export async function exchangeDropboxAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<DropboxAuthCodeResult> {
  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      grant_type: "authorization_code",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!response.ok) {
    console.error("[exchangeDropboxAuthCode] Dropbox menolak:", response.status, await response.text());
    throw new Error("Gagal menukar kode otorisasi Dropbox. Coba hubungkan ulang akun.");
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) throw new Error("Dropbox tidak mengembalikan access token.");
  if (!data.refresh_token) throw new Error("Dropbox tidak mengembalikan refresh token. Pastikan token_access_type=offline.");

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 14400) * 1000).toISOString(),
  };
}

export async function exchangeDropboxRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<DropboxTokenExchangeResult> {
  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error("Refresh token Dropbox tidak valid atau sudah dicabut.");
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error("Dropbox tidak mengembalikan access token yang valid.");

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 14400) * 1000).toISOString(),
  };
}

export async function fetchDropboxAccountInfo(accessToken: string): Promise<DropboxAccountInfo> {
  const response = await fetch(`${DROPBOX_API_BASE}/users/get_current_account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Gagal mengambil informasi akun Dropbox.");
  }

  const data = (await response.json()) as { email?: string };
  if (!data.email) throw new Error("Akun Dropbox tidak mengembalikan alamat email.");

  return { email: data.email };
}
