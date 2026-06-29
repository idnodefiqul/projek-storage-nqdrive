# NQDRIVE — Panduan Deploy Lengkap ke Production

Panduan ini membawa kamu dari nol hingga NQDRIVE berjalan di production dengan custom domain,
mulai dari persiapan akun Cloudflare, Google Cloud, setup database D1, deploy Worker,
deploy Pages, hingga konfigurasi domain kustom untuk keduanya.

Ikuti setiap langkah secara urut. Jangan loncat-loncat.

---

## Daftar Isi

1. [Prasyarat & Tools](#1-prasyarat--tools)
2. [Clone & Install Dependencies](#2-clone--install-dependencies)
3. [Setup Google Cloud Project](#3-setup-google-cloud-project)
4. [Login Wrangler ke Cloudflare](#4-login-wrangler-ke-cloudflare)
5. [Buat D1 Database](#5-buat-d1-database)
6. [Konfigurasi wrangler.jsonc Worker](#6-konfigurasi-wranglerjsonc-worker)
7. [Generate Secrets & Set ke Worker](#7-generate-secrets--set-ke-worker)
8. [Konfigurasi CORS untuk Domain Production](#8-konfigurasi-cors-untuk-domain-production)
9. [Apply Migrasi Database ke Production](#9-apply-migrasi-database-ke-production)
10. [Deploy Worker ke Cloudflare](#10-deploy-worker-ke-cloudflare)
11. [Konfigurasi Environment Web App](#11-konfigurasi-environment-web-app)
12. [Build & Deploy Web App ke CF Pages](#12-build--deploy-web-app-ke-cf-pages)
13. [Custom Domain untuk Worker](#13-custom-domain-untuk-worker)
14. [Custom Domain untuk Pages](#14-custom-domain-untuk-pages)
15. [Update CORS setelah Custom Domain](#15-update-cors-setelah-custom-domain)
16. [Verifikasi Production](#16-verifikasi-production)
17. [Setup Admin Pertama](#17-setup-admin-pertama)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. Prasyarat & Tools

### Software yang harus sudah terinstall di komputer kamu:

**Node.js versi 20 atau lebih baru**
```bash
node --version
# Harus menampilkan v20.x.x atau lebih tinggi
# Jika belum: https://nodejs.org/en/download
```

**pnpm versi 9 atau lebih baru**
```bash
pnpm --version
# Harus menampilkan 9.x.x atau lebih tinggi
# Jika belum: npm install -g pnpm
```

**Wrangler CLI (Cloudflare)**
```bash
npm install -g wrangler
wrangler --version
# Harus menampilkan 3.x.x atau lebih tinggi
```

**openssl** (untuk generate secrets — sudah ada di Linux/macOS, Windows pakai Git Bash)
```bash
openssl version
# Harus tampil OpenSSL x.x.x
```

### Akun yang dibutuhkan:

- **Akun Cloudflare** — daftar gratis di https://dash.cloudflare.com/sign-up
- **Akun Google Cloud** — https://console.cloud.google.com (butuh kartu kredit untuk verifikasi, tapi tidak dicharge untuk OAuth biasa)
- **Domain** (opsional tapi direkomendasikan) — domain yang sudah nameserver-nya diarahkan ke Cloudflare

---

## 2. Clone & Install Dependencies

```bash
# Masuk ke folder project
cd nqdrive

# Install semua dependencies monorepo sekaligus
pnpm install
```

Tunggu sampai selesai. pnpm akan install dependencies untuk semua packages sekaligus
(`apps/worker`, `apps/web`, dan semua `packages/*`).

---

## 3. Setup Google Cloud Project

NQDrive butuh Google OAuth 2.0 untuk bisa terhubung ke akun Google Drive.
Ini hanya dipakai untuk mendapatkan refresh token — bukan untuk login user ke NQDRIVE.

### 3.1 Buat Project Google Cloud

1. Buka https://console.cloud.google.com
2. Klik dropdown project di pojok kiri atas → **New Project**
3. Isi nama project, misalnya `nqdrive-production`
4. Klik **Create**
5. Pastikan project yang baru dibuat sudah terpilih di dropdown

### 3.2 Aktifkan Google Drive API

1. Di sidebar kiri, klik **APIs & Services** → **Library**
2. Cari `Google Drive API`
3. Klik hasil pencarian → klik **Enable**

### 3.3 Buat OAuth 2.0 Credentials

1. Di sidebar kiri, klik **APIs & Services** → **Credentials**
2. Klik **+ Create Credentials** → pilih **OAuth client ID**
3. Jika diminta setup consent screen dulu, klik **Configure Consent Screen**:
   - Pilih **External** → klik **Create**
   - Isi **App name**: `NQDrive`
   - Isi **User support email**: email kamu
   - Isi **Developer contact information**: email kamu
   - Klik **Save and Continue**
   - Di halaman Scopes, klik **Add or Remove Scopes**
   - Cari dan centang: `https://www.googleapis.com/auth/drive`
   - Klik **Update** → **Save and Continue**
   - Di halaman Test users, klik **+ Add Users** → masukkan email Google Drive yang akan disambungkan ke NQDRIVE
   - Klik **Save and Continue** → **Back to Dashboard**
4. Kembali ke **Credentials** → klik **+ Create Credentials** → **OAuth client ID**
5. Pilih **Application type**: **Web application**
6. Isi **Name**: `NQDrive Worker`
7. Di bagian **Authorized redirect URIs**, klik **+ Add URI** dan tambahkan:
   ```
   https://developers.google.com/oauthplayground
   ```
   URI ini dipakai hanya untuk generate refresh token via OAuth Playground — bukan dipakai di production runtime NQDRIVE (karena NQDRIVE tidak pakai redirect flow, melainkan paste refresh token langsung).
8. Klik **Create**
9. Catat **Client ID** dan **Client Secret** yang muncul — simpan di tempat aman

### 3.4 Generate Refresh Token via OAuth Playground

Ini adalah cara mendapatkan refresh token Google Drive yang akan dipaste ke dashboard NQDRIVE.

1. Buka https://developers.google.com/oauthplayground
2. Klik ikon gear (⚙) di pojok kanan atas
3. Centang **Use your own OAuth credentials**
4. Isi **OAuth Client ID** dan **OAuth Client Secret** dari langkah 3.3
5. Klik **Close**
6. Di panel kiri, cari dan pilih scope: `https://www.googleapis.com/auth/drive`
7. Klik **Authorize APIs**
8. Login dengan akun Google Drive yang ingin disambungkan
9. Klik **Allow** saat diminta izin
10. Di Step 2, klik **Exchange authorization code for tokens**
11. Salin **Refresh token** yang muncul — ini yang akan dipakai di dashboard NQDRIVE

> **Catatan:** Refresh token ini tidak expired selama akun Google tidak mencabut akses.
> Simpan baik-baik. Ulangi langkah 3.4 ini untuk setiap akun Google Drive yang ingin disambungkan.

---

## 4. Login Wrangler ke Cloudflare

```bash
wrangler login
```

Browser akan terbuka dan meminta kamu login ke Cloudflare. Setelah login berhasil,
terminal akan menampilkan konfirmasi. Wrangler sekarang punya akses ke akun Cloudflare kamu.

Verifikasi login berhasil:
```bash
wrangler whoami
# Harus menampilkan nama dan email akun Cloudflare kamu
```

---

## 5. Buat D1 Database

```bash
wrangler d1 create nqdrive-db
```

Output yang akan muncul seperti ini:
```
✅ Successfully created DB 'nqdrive-db' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "nqdrive-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Salin `database_id`** dari output di atas. Kamu akan membutuhkannya di langkah berikutnya.

---

## 6. Konfigurasi wrangler.jsonc Worker

Buka file `apps/worker/wrangler.jsonc` dan edit bagian berikut:

### 6.1 Isi database_id

Ganti `REPLACE_WITH_REAL_D1_DATABASE_ID` dengan ID database dari langkah 5:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "nqdrive-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← ganti ini
    "migrations_dir": "migrations"
  }
],
```

### 6.2 Update GOOGLE_OAUTH_REDIRECT_URI

Di bagian `vars`, ganti nilai `GOOGLE_OAUTH_REDIRECT_URI`:

```jsonc
"vars": {
  "APP_ENV": "production",
  "GOOGLE_OAUTH_REDIRECT_URI": "https://developers.google.com/oauthplayground"
}
```

> Karena NQDRIVE menggunakan model paste refresh token langsung (bukan redirect OAuth flow),
> nilai ini harus sama dengan yang didaftarkan di Google Cloud Console pada langkah 3.3.

File `wrangler.jsonc` yang sudah terisi lengkap:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "nqdrive-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nqdrive-db",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "migrations_dir": "migrations"
    }
  ],

  "triggers": {
    "crons": ["*/10 * * * *"]
  },

  "vars": {
    "APP_ENV": "production",
    "GOOGLE_OAUTH_REDIRECT_URI": "https://developers.google.com/oauthplayground"
  },

  "observability": {
    "enabled": true
  }
}
```

---

## 7. Generate Secrets & Set ke Worker

Secrets adalah nilai sensitif yang **tidak boleh masuk ke file kode atau git**.
Semua secrets diset via Wrangler dan disimpan terenkripsi di Cloudflare.

### 7.1 Generate nilai untuk setiap secret

Buka terminal dan jalankan perintah ini satu per satu untuk mendapatkan nilainya:

```bash
# JWT_SECRET — untuk sign session token login dashboard
openssl rand -base64 48
# Contoh output: kJ3mP9xQ2nR7sT1vW4yZ6aB8cD0eF5gH7iJ2kL4mN6oP8qR0sT2uV4wX6yZ8aB0c

# ENCRYPTION_KEY — untuk enkripsi refresh token Google Drive di D1
openssl rand -base64 32
# Contoh output: mK4nP7qR0sT3uV5wX8yZ1aB3cD6eF9gH2iJ4kL7mN0oP3qR6sT8uV1wX4y
```

Catat kedua nilai di atas. Jangan sampai hilang dan jangan share ke siapapun.

### 7.2 Set JWT_SECRET

```bash
cd apps/worker
wrangler secret put JWT_SECRET
```

Wrangler akan meminta kamu mengetik/paste nilainya. Paste nilai JWT_SECRET dari langkah 7.1,
tekan Enter. Output konfirmasi:
```
✅ Successfully set the secret for JWT_SECRET
```

### 7.3 Set ENCRYPTION_KEY

```bash
wrangler secret put ENCRYPTION_KEY
```

Paste nilai ENCRYPTION_KEY dari langkah 7.1, tekan Enter.

### 7.4 Set GOOGLE_CLIENT_ID

```bash
wrangler secret put GOOGLE_CLIENT_ID
```

Paste Client ID dari Google Cloud Console (langkah 3.3), tekan Enter.

### 7.5 Set GOOGLE_CLIENT_SECRET

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
```

Paste Client Secret dari Google Cloud Console (langkah 3.3), tekan Enter.

### 7.6 Verifikasi semua secrets sudah terset

```bash
wrangler secret list
```

Output harus menampilkan keempat secrets:
```
┌─────────────────────┬──────────────────────────────┐
│ Name                │ Modified                     │
├─────────────────────┼──────────────────────────────┤
│ ENCRYPTION_KEY      │ 2025-01-01T00:00:00.000Z    │
│ GOOGLE_CLIENT_ID    │ 2025-01-01T00:00:00.000Z    │
│ GOOGLE_CLIENT_SECRET│ 2025-01-01T00:00:00.000Z    │
│ JWT_SECRET          │ 2025-01-01T00:00:00.000Z    │
└─────────────────────┴──────────────────────────────┘
```

Kembali ke root monorepo setelah selesai:
```bash
cd ../..
```

---

## 8. Konfigurasi CORS untuk Domain Production

Sebelum deploy, tambahkan domain production kamu ke allowlist CORS di Worker.
Buka file `apps/worker/src/index.ts` dan edit bagian `ALLOWED_ORIGINS`:

```typescript
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  // Tambahkan domain Pages kamu di sini:
  "https://nqdrive.pages.dev",              // URL default CF Pages (ganti dengan nama project kamu)
  "https://drive.yourdomain.com",           // Custom domain Pages (jika ada)
]);
```

> Ganti `nqdrive` dan `yourdomain.com` dengan nilai yang sesuai.
> Nama Pages kamu akan terlihat setelah deploy di langkah 12.
> Kalau belum tahu nama Pages-nya, deploy dulu tanpa custom domain,
> lalu update lagi setelah tahu URL Pages-nya (lihat langkah 15).

---

## 9. Apply Migrasi Database ke Production

Ini akan membuat semua tabel yang dibutuhkan di D1 database production:

```bash
pnpm db:migrate:remote
```

Output yang diharapkan:
```
🌀 Executing on remote database nqdrive-db (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 6 commands in 1.23ms
```

Verifikasi tabel berhasil dibuat:
```bash
wrangler d1 execute nqdrive-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Output harus menampilkan semua tabel:
```
┌──────────────────┐
│ name             │
├──────────────────┤
│ api_keys         │
│ download_logs    │
│ drive_accounts   │
│ files            │
│ folders          │
│ settings         │
│ upload_logs      │
│ users            │
└──────────────────┘
```

---

## 10. Deploy Worker ke Cloudflare

```bash
pnpm deploy:worker
```

Wrangler akan melakukan build TypeScript dan deploy ke Cloudflare Workers.
Output di bagian akhir akan menampilkan URL worker:

```
Total Upload: 245.32 KiB / gzip: 62.14 KiB
Worker Startup Time: 5 ms
Uploaded nqdrive-worker (3.45 sec)
Deployed nqdrive-worker triggers (0.45 sec)
  https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Catat URL worker ini** — format: `https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev`
Kamu butuh URL ini untuk langkah berikutnya.

### Verifikasi Worker berjalan

Coba akses endpoint auth dari terminal:
```bash
curl https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev/api/auth/setup-status
```

Harus mengembalikan:
```json
{"success":true,"data":{"setupCompleted":false}}
```

Kalau muncul response JSON seperti itu, Worker sudah berjalan dengan benar.

---

## 11. Konfigurasi Environment Web App

Web app butuh tahu URL Worker supaya bisa melakukan API calls ke backend.

### Opsi A — Edit file .env.production (untuk build manual)

Buka `apps/web/.env.production` dan ganti dengan URL worker dari langkah 10:

```env
VITE_WORKER_URL=https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev
```

### Opsi B — Set via Cloudflare Pages Dashboard (direkomendasikan)

Cara ini lebih aman karena nilai tidak masuk ke file yang mungkin di-commit.
Lakukan setelah deploy Pages pertama kali di langkah 12, lalu set di:
**Cloudflare Dashboard → Pages → nqdrive-web → Settings → Environment Variables**

Tambahkan:
- Variable name: `VITE_WORKER_URL`
- Value: `https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev`
- Environment: **Production**

Jika menggunakan custom domain untuk Worker (langkah 13), gunakan custom domain:
- Value: `https://api.yourdomain.com`

Setelah set environment variable via dashboard, lakukan redeploy Pages agar variabel terbaca.

---

## 12. Build & Deploy Web App ke CF Pages

```bash
pnpm build:web
```

Proses build Vite + TypeScript. Tunggu sampai selesai. Output akan muncul di `apps/web/dist/`.

Setelah build selesai, deploy ke Cloudflare Pages:

```bash
pnpm deploy:web
```

Output di bagian akhir:
```
✨ Compiled 1 worker successfully
✨ Uploading... (123 files)
✨ Success! Uploaded 123 files (2.12 sec)

✨ Deployment complete! Take a peek over at https://xxxxxxxx.nqdrive-web.pages.dev
```

Catat URL deployment yang muncul. URL default Pages kamu juga akan berformat:
`https://nqdrive-web.pages.dev`

> Nama project Pages ditentukan dari field `"name"` di `apps/web/wrangler.jsonc`
> yang isinya `"nqdrive-web"`. Jadi URL default Pages adalah `https://nqdrive-web.pages.dev`.

---

## 13. Custom Domain untuk Worker

Custom domain membuat Worker bisa diakses via `https://api.yourdomain.com`
alih-alih URL panjang `workers.dev`.

**Prasyarat:** Domain kamu harus sudah menggunakan nameserver Cloudflare.
Cek di Cloudflare Dashboard → pilih domain → pastikan status **Active**.

### 13.1 Via Cloudflare Dashboard (cara mudah)

1. Buka https://dash.cloudflare.com
2. Klik **Workers & Pages** di sidebar kiri
3. Klik worker **nqdrive-worker**
4. Klik tab **Settings** → klik **Domains & Routes**
5. Klik **+ Add** → pilih **Custom Domain**
6. Ketik subdomain yang diinginkan, misalnya: `api.yourdomain.com`
7. Klik **Add Custom Domain**
8. Cloudflare akan otomatis membuat DNS record dan provision SSL certificate
9. Tunggu 1-2 menit hingga status berubah menjadi **Active**

### 13.2 Via wrangler.jsonc (cara kode)

Tambahkan bagian `routes` di `apps/worker/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "nqdrive-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nqdrive-db",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "migrations_dir": "migrations"
    }
  ],

  "triggers": {
    "crons": ["*/10 * * * *"]
  },

  "routes": [
    {
      "pattern": "api.yourdomain.com/*",
      "custom_domain": true
    }
  ],

  "vars": {
    "APP_ENV": "production",
    "GOOGLE_OAUTH_REDIRECT_URI": "https://developers.google.com/oauthplayground"
  },

  "observability": {
    "enabled": true
  }
}
```

Ganti `api.yourdomain.com` dengan subdomain yang kamu inginkan.
Setelah edit, deploy ulang Worker:

```bash
pnpm deploy:worker
```

### 13.3 Verifikasi Custom Domain Worker

```bash
curl https://api.yourdomain.com/api/auth/setup-status
```

Harus mengembalikan:
```json
{"success":true,"data":{"setupCompleted":false}}
```

---

## 14. Custom Domain untuk Pages

Custom domain membuat dashboard bisa diakses via `https://drive.yourdomain.com`
alih-alih URL `pages.dev`.

### 14.1 Via Cloudflare Dashboard

1. Buka https://dash.cloudflare.com
2. Klik **Workers & Pages** di sidebar kiri
3. Klik project Pages **nqdrive-web**
4. Klik tab **Custom domains**
5. Klik **Set up a custom domain**
6. Ketik domain yang diinginkan, misalnya: `drive.yourdomain.com`
7. Klik **Continue**
8. Cloudflare akan menampilkan DNS record yang perlu ditambahkan. Jika domain sudah di CF, ini dilakukan otomatis.
9. Klik **Activate domain**
10. Tunggu 1-5 menit hingga status **Active** dan SSL certificate sudah provisioned

### 14.2 Verifikasi Custom Domain Pages

Buka browser dan akses `https://drive.yourdomain.com`.
Harus menampilkan halaman dashboard NQDRIVE (atau redirect ke `/setup` jika admin belum dibuat).

---

## 15. Update CORS setelah Custom Domain

Setelah kedua custom domain aktif, update `ALLOWED_ORIGINS` di Worker
supaya domain Pages kamu diizinkan mengakses Worker.

Buka `apps/worker/src/index.ts`:

```typescript
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "https://nqdrive-web.pages.dev",       // URL default Pages (tetap ada untuk safety)
  "https://drive.yourdomain.com",        // Custom domain Pages ← tambahkan ini
]);
```

Lalu update juga `VITE_WORKER_URL` di environment Pages agar menggunakan custom domain Worker:

1. Buka Cloudflare Dashboard → **Workers & Pages** → **nqdrive-web**
2. Klik **Settings** → **Environment variables**
3. Edit variable `VITE_WORKER_URL` → ubah nilainya ke:
   ```
   https://api.yourdomain.com
   ```
4. Klik **Save**

Deploy ulang Worker dengan CORS yang sudah diupdate:

```bash
pnpm deploy:worker
```

Lalu redeploy Pages agar environment variable baru terbaca:

```bash
pnpm build:web
pnpm deploy:web
```

---

## 16. Verifikasi Production

Lakukan serangkaian pengecekan berikut untuk memastikan semuanya berjalan benar.

### 16.1 Cek Worker endpoint

```bash
# Harus return 401 (bukan 200 karena belum login)
curl -i https://api.yourdomain.com/api/files
# Harus ada di response header: Access-Control-Allow-Origin dari domain Pages kamu

# Cek CORS preflight
curl -i -X OPTIONS https://api.yourdomain.com/api/auth/login \
  -H "Origin: https://drive.yourdomain.com" \
  -H "Access-Control-Request-Method: POST"
# Harus muncul: Access-Control-Allow-Origin: https://drive.yourdomain.com
```

### 16.2 Cek SSL Certificate

```bash
curl -vI https://api.yourdomain.com/api/auth/setup-status 2>&1 | grep -E "SSL|TLS|certificate|issuer"
# Harus muncul info certificate dari Cloudflare
```

### 16.3 Cek Security Headers

```bash
curl -I https://drive.yourdomain.com
```

Harus ada headers berikut di response:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: ...
```

### 16.4 Cek Cron Worker

Cek di Cloudflare Dashboard → **Workers & Pages** → **nqdrive-worker** → **Triggers** → **Cron Triggers**.
Harus ada cron `*/10 * * * *` yang aktif.

---

## 17. Setup Admin Pertama

Ini hanya dilakukan sekali, saat pertama kali NQDRIVE diakses.

1. Buka browser ke `https://drive.yourdomain.com`
2. Kamu akan otomatis diarahkan ke halaman `/setup`
3. Isi username dan password untuk akun admin
4. Klik **Setup** — akun admin dibuat dan kamu akan diarahkan ke halaman login
5. Login dengan credentials yang baru dibuat
6. Kamu sekarang berada di dashboard NQDRIVE

### Tambah Akun Google Drive Pertama

1. Di sidebar, klik **Google Accounts** (atau **Storage Accounts**)
2. Klik **+ Tambah Akun**
3. Paste refresh token yang didapat dari langkah 3.4
4. Klik **Hubungkan**
5. NQDRIVE akan memverifikasi token dan menambahkan akun Google Drive ke storage pool

Ulangi langkah ini untuk setiap akun Google Drive tambahan.

---

## 18. Troubleshooting

### Worker tidak bisa diakses setelah deploy

```bash
# Cek status deployment
wrangler deployments list --name nqdrive-worker

# Cek log Worker secara realtime
wrangler tail --name nqdrive-worker
```

### CORS error di browser

Pastikan:
1. Domain Pages sudah ada di `ALLOWED_ORIGINS` di `index.ts`
2. Worker sudah di-redeploy setelah update CORS
3. `VITE_WORKER_URL` di environment Pages sudah benar dan Pages sudah di-redeploy

Cek dari browser console: error CORS biasanya menyebut domain mana yang diblokir.

### Database error / tabel tidak ditemukan

```bash
# Cek apakah migrasi sudah apply
wrangler d1 execute nqdrive-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"

# Jika tabel belum ada, apply ulang migrasi
pnpm db:migrate:remote
```

### Secrets tidak terbaca di Worker

```bash
# Cek list secrets
cd apps/worker
wrangler secret list

# Jika ada secret yang kurang, set ulang
wrangler secret put NAMA_SECRET
```

### Custom domain belum aktif / SSL belum ready

Tunggu 5-15 menit setelah konfigurasi custom domain. Cloudflare perlu waktu untuk
provision SSL certificate via Let's Encrypt. Jika lebih dari 30 menit belum aktif:
1. Buka Cloudflare Dashboard → domain → **SSL/TLS** → pastikan mode **Full (Strict)**
2. Cek DNS record: harus ada CNAME record untuk subdomain yang mengarah ke `nqdrive-worker.workers.dev` atau `nqdrive-web.pages.dev`

### Pages build gagal

```bash
# Build secara lokal dulu untuk lihat error
pnpm build:web

# Jika error TypeScript, jalankan typecheck
pnpm --filter @nqdrive/web typecheck
```

### Cron tidak berjalan

Cek di Cloudflare Dashboard → **Workers & Pages** → **nqdrive-worker** → tab **Triggers**.
Jika cron belum terdaftar, pastikan bagian `triggers.crons` ada di `wrangler.jsonc` dan deploy ulang.

---

## Ringkasan Perintah Deploy

Setelah semua konfigurasi selesai, untuk deploy ulang di masa depan:

```bash
# Deploy Worker saja (setelah ada perubahan backend)
pnpm deploy:worker

# Deploy Web App saja (setelah ada perubahan frontend)
pnpm build:web && pnpm deploy:web

# Deploy keduanya sekaligus
pnpm deploy:worker && pnpm build:web && pnpm deploy:web
```

---

## Struktur File Konfigurasi yang Relevan

```
nqdrive/
├── apps/
│   ├── worker/
│   │   ├── wrangler.jsonc          ← konfigurasi Worker + D1 binding
│   │   ├── .dev.vars               ← secrets untuk development lokal (gitignored, buat sendiri)
│   │   ├── .dev.vars.example       ← template .dev.vars
│   │   └── migrations/             ← file SQL migrasi D1
│   └── web/
│       ├── wrangler.jsonc          ← konfigurasi Pages deployment
│       ├── .env.production         ← VITE_WORKER_URL untuk build
│       └── public/
│           ├── _headers            ← security headers untuk Pages
│           └── _redirects          ← SPA redirect rule
└── apps/worker/src/
    └── index.ts                    ← ALLOWED_ORIGINS CORS config
```
