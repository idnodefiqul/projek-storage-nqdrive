const MS_OAUTH_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_OAUTH_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const MS_SCOPES = "Files.ReadWrite.All offline_access User.Read";

export interface OneDriveAuthCodeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface OneDriveTokenExchangeResult {
  accessToken: string;
  expiresAt: string;
}

export interface OneDriveAccountInfo {
  email: string;
}

export function buildOneDriveAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: MS_SCOPES,
    response_mode: "query",
    state: params.state,
  });
  return `${MS_OAUTH_AUTH_URL}?${query.toString()}`;
}

export async function exchangeOneDriveAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OneDriveAuthCodeResult> {
  const response = await fetch(MS_OAUTH_TOKEN_URL, {
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
    const errText = await response.text().catch(() => "");
    console.error("[exchangeOneDriveAuthCode] Microsoft menolak:", response.status, errText);
    let detail = "";
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.error_description || errJson.error || errText.slice(0, 200);
    } catch {
      detail = errText.slice(0, 200);
    }
    throw new Error(`Gagal menukar kode otorisasi OneDrive: ${detail}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) throw new Error("Microsoft tidak mengembalikan access token.");
  if (!data.refresh_token) throw new Error("Microsoft tidak mengembalikan refresh token. Pastikan scope offline_access tercantum.");

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export async function exchangeOneDriveRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<OneDriveTokenExchangeResult> {
  const response = await fetch(MS_OAUTH_TOKEN_URL, {
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
    throw new Error("Refresh token OneDrive tidak valid atau sudah dicabut.");
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error("Microsoft tidak mengembalikan access token yang valid.");

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export async function fetchOneDriveAccountInfo(accessToken: string): Promise<OneDriveAccountInfo> {
  const response = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Gagal mengambil informasi akun OneDrive.");
  }

  const data = (await response.json()) as { mail?: string; userPrincipalName?: string };
  const email = data.mail || data.userPrincipalName;
  if (!email) throw new Error("Akun OneDrive tidak mengembalikan alamat email.");

  return { email };
}
