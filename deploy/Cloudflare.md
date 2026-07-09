# NQDRIVE — Tutorial Deploy ke Cloudflare Workers + Pages

Tutorial ini membawa kamu dari nol sampai NQDRIVE berjalan di Cloudflare
dengan dua custom domain HTTPS: satu untuk **Worker** (API) dan satu untuk
**Pages** (dashboard). Semua perintah dijalankan dari **komputer lokal kamu**
(bukan VPS) di dalam folder repo.

**Arsitektur Cloudflare (berbeda dengan jalur VPS!):**

```
Browser
   ├── https://drive.example.com  ──► Cloudflare Pages (React dist
   │        │                         + Pages Function [[catchall]].ts)
   │        └── link download/share ──proxy──► Worker
   │
   └── fetch API dashboard LANGSUNG ke:
       https://api.example.com    ──► Cloudflare Worker (Hono API)
                                          │
                                          ▼
                                      D1 Database (SQLite terkelola)
```

Di Cloudflare, dashboard fetch API **lintas domain** langsung ke Worker
(`VITE_WORKER_URL` DIISI — kebalikan dari jalur VPS yang mengosongkannya).

File yang dipakai (semua sudah ada di repo):

| File | Fungsi |
|---|---|
| `apps/worker/wrangler.jsonc` | Config Worker: D1 binding, cron `*/10 * * * *`, vars |
| `apps/worker/dbcloud.sql` | Skema database (idempoten) |
| `apps/worker/scripts/migrate-d1.mjs` | Wrapper migrasi (dipanggil script `db:migrate:remote`) |
| `apps/web/wrangler.jsonc` | Config Pages: `pages_build_output_dir: ./dist` |
| `apps/web/.env.production` | Nilai `VITE_*` yang dibaca saat build frontend |
| `apps/web/functions/[[catchall]].ts` | Pages Function proxy link download → Worker |

Sepanjang tutorial: domain Pages = `drive.example.com`, domain Worker =
`api.example.com` — ganti dengan punyamu. Domain harus sudah dikelola DNS-nya
oleh Cloudflare (zona aktif di akunmu).

---

## Daftar Isi

1. [Prasyarat & install dependencies](#1-prasyarat)
2. [Login wrangler](#2-login-wrangler)
3. [Buat D1 database & pasang database_id](#3-buat-d1-database)
4. [Jalankan skema database](#4-jalankan-skema-database)
5. [Set secrets Worker](#5-set-secrets-worker)
6. [Set vars di wrangler.jsonc](#6-set-vars-di-wranglerjsonc)
7. [Deploy Worker](#7-deploy-worker)
8. [Custom domain untuk Worker](#8-custom-domain-untuk-worker)
9. [Build & deploy frontend ke Pages](#9-build--deploy-frontend-ke-pages)
10. [Custom domain untuk Pages](#10-custom-domain-untuk-pages)
11. [Pages Function & WAJIB CEK: WORKER_ORIGIN](#11-pages-function--wajib-cek-worker_origin)
12. [⚠️ Finalisasi: ALLOWED_ORIGINS + Google OAuth](#12-finalisasi-allowed_origins--google-oauth)
13. [Verifikasi menyeluruh](#13-verifikasi)

---

## 1. Prasyarat

- Akun Cloudflare (gratis cukup) dengan **domain yang sudah ditambahkan
  sebagai zona** (DNS domain dikelola Cloudflare).
- Node.js ≥ 20 dan pnpm ≥ 9 di komputer lokal (root `package.json` — cek:
  `node --version`, `pnpm --version`).
- Google OAuth credentials (Client ID + Secret) — cara membuatnya ada di
  langkah 5.2.

Clone dan install (kalau belum):

```bash
git clone URL_REPO_KAMU nqdrive
cd nqdrive
pnpm install
```

`wrangler` sudah terpasang sebagai devDependency `apps/worker` dan `apps/web`
— tidak perlu install global. Semua perintah `wrangler` di bawah dijalankan
lewat `pnpm exec` dari folder app yang sesuai.

---

## 2. Login Wrangler

```bash
cd apps/worker
pnpm exec wrangler login
```

Browser terbuka → klik **Allow** untuk mengizinkan wrangler mengakses akun
Cloudflare kamu. Terminal akan menampilkan `Successfully logged in`.

Verifikasi:

```bash
pnpm exec wrangler whoami
# Menampilkan email + Account ID kamu
```

---

## 3. Buat D1 Database

Nama database harus `nqdrive-db` (sesuai `database_name` di
`apps/worker/wrangler.jsonc` dan `DB_NAME` di
`apps/worker/scripts/migrate-d1.mjs`):

```bash
# masih di apps/worker
pnpm exec wrangler d1 create nqdrive-db
```

Output memuat blok seperti:

```
✅ Successfully created DB 'nqdrive-db'

[[d1_databases]]
binding = "DB"
database_name = "nqdrive-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Catat `database_id`** lalu pasang ke `apps/worker/wrangler.jsonc` — ganti
nilai `database_id` yang ada (baris ~15):

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "nqdrive-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   // ← ID kamu
  }
],
```

---

## 4. Jalankan Skema Database

Repo sudah punya script khusus (lihat `apps/worker/package.json` →
`db:migrate:remote` yang menjalankan `scripts/migrate-d1.mjs --remote`;
script itu menjalankan ALTER legacy yang aman lalu
`wrangler d1 execute nqdrive-db --remote --file=./dbcloud.sql`):

```bash
# masih di apps/worker
pnpm db:migrate:remote
```

Saat ditanya konfirmasi eksekusi ke database remote, jawab **y**. Output
berakhir dengan `[migrate] Done.`

Verifikasi tabel:

```bash
pnpm exec wrangler d1 execute nqdrive-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# Harus memuat: api_keys, audit_logs, drive_accounts, files, folders,
# migration_items, migration_jobs, settings, users, dll.
```

---

## 5. Set Secrets Worker

Empat secret WAJIB. Setiap perintah `wrangler secret put NAMA` membuka prompt
interaktif — **paste nilai lalu Enter** (input tidak ditampilkan di layar):

```bash
# masih di apps/worker

# 1. JWT_SECRET — generate dulu nilainya:
openssl rand -base64 48
pnpm exec wrangler secret put JWT_SECRET
# → paste hasil openssl di prompt "Enter a secret value:"

# 2. ENCRYPTION_KEY — WAJIB 32 byte base64:
openssl rand -base64 32
pnpm exec wrangler secret put ENCRYPTION_KEY
# ⚠️ simpan nilai ini di password manager — kalau hilang, semua akun Drive
#    yang terhubung harus dihubungkan ulang.

# 3 & 4. Google OAuth (cara dapat: lihat 5.2)
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
```

> Kalau worker belum pernah di-deploy, wrangler menawarkan
> *"Create a new Worker to store the secret?"* → jawab **y**.

### 5.2 Cara dapat GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

1. <https://console.cloud.google.com/> → buat/pilih project.
2. **APIs & Services → Library** → **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → isi nama app +
   email → Save. Tambahkan Gmail kamu di **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   type **Web application**.
5. **Authorized redirect URIs** — diisi final di langkah 12; untuk sekarang
   boleh dikosongkan atau isi placeholder domain Pages kamu.
6. **Create** → salin Client ID & Client secret untuk perintah di atas.

---

## 6. Set Vars di wrangler.jsonc

Vars non-secret ada di `apps/worker/wrangler.jsonc` blok `"vars"` (baris
~32-36). Isi sementara dengan domain final yang kamu rencanakan (difinalkan
lagi di langkah 12):

```jsonc
"vars": {
  "APP_ENV": "production",
  "GOOGLE_OAUTH_REDIRECT_URI": "https://api.example.com",
  "WEB_APP_URL": "https://drive.example.com"
},
```

| Var | Isi | Fungsi |
|---|---|---|
| `APP_ENV` | `production` | Sembunyikan detail error dari response |
| `GOOGLE_OAUTH_REDIRECT_URI` | domain Worker | Basis URL callback OAuth Google |
| `WEB_APP_URL` | domain Pages | Tujuan redirect setelah login/OAuth |

> Cron trigger `*/10 * * * *` (sinkronisasi token Drive, purge trash, lanjut
> migrasi) sudah terdefinisi di file yang sama — tidak perlu diubah.

---

## 7. Deploy Worker

Dari **root repo** (script `deploy:worker` ada di root `package.json`):

```bash
cd ../..        # kembali ke root repo
pnpm deploy:worker
```

Output menampilkan URL default:

```
Deployed nqdrive-worker triggers (x.xx sec)
  https://nqdrive-worker.SUBDOMAIN-KAMU.workers.dev
  schedule: */10 * * * *
```

Worker sudah hidup, tapi kita akan mengaksesnya lewat custom domain (langkah
8) — URL `workers.dev` cukup untuk memastikan deploy sukses.

---

## 8. Custom Domain untuk Worker

Di dashboard Cloudflare (<https://dash.cloudflare.com/>):

1. Menu kiri **Workers & Pages** → klik worker **nqdrive-worker**.
2. Tab **Settings** → **Domains & Routes** → **Add** → **Custom Domain**.
3. Isi: `api.example.com` → **Add Custom Domain**.
4. Cloudflare otomatis membuat DNS record + sertifikat. Tunggu status
   **Active** (biasanya < 1 menit).

Tes:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.example.com/
# 404 = benar (root path memang blank 404 by design)
```

---

## 9. Build & Deploy Frontend ke Pages

### 9.1 Edit apps/web/.env.production

Di Cloudflare, `VITE_WORKER_URL` **DIISI** dengan custom domain Worker
(kebalikan dari jalur VPS). File ini dibaca Vite saat build **dan** oleh
`apps/web/scripts/generate-headers.mjs` (auto-jalan lewat script `prebuild`)
yang men-generate `public/_headers` (CSP dll.) — jadi pastikan nilainya benar:

```bash
nano apps/web/.env.production
```

```
VITE_WORKER_URL=https://api.example.com
VITE_APP_URL=https://drive.example.com
VITE_ALLOWED_API_ORIGINS=https://api.example.com
VITE_SITE_NAME="NQDRIVE"
```

(Nilai ini nilai produksi Cloudflare yang sah — **boleh di-commit**, beda
dengan kasus VPS.)

### 9.2 Build + deploy — Opsi A: manual via wrangler (paling sederhana)

Script sudah ada di root `package.json`: `deploy:web:full` =
`pnpm build:web && pnpm deploy:web` (deploy = `wrangler pages deploy dist`
dari `apps/web`, output dir dari `apps/web/wrangler.jsonc` →
`pages_build_output_dir: ./dist`, project name `nqdrive-web`):

```bash
pnpm deploy:web:full
```

Deploy pertama kali, wrangler bertanya:

- *"The project you specified does not exist: nqdrive-web. Would you like to
  create it?"* → pilih **Create a new project**.
- *"Enter the production branch name:"* → Enter (default `main`).

Output akhir: `✨ Deployment complete! ... https://nqdrive-web.pages.dev`

### 9.2 alternatif — Opsi B: connect ke Git (auto-deploy tiap push)

Dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → pilih repo. Konfigurasi build:

| Field | Nilai |
|---|---|
| Production branch | `main` (atau branch kamu) |
| Build command | `pnpm build:web` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` (root monorepo — JANGAN `apps/web`, karena build butuh workspace packages/) |

Lalu di **Settings → Environment variables** project Pages, tambahkan
(scope Production):

```
VITE_WORKER_URL=https://api.example.com
VITE_APP_URL=https://drive.example.com
VITE_ALLOWED_API_ORIGINS=https://api.example.com
```

> Catatan: dengan Opsi A (deploy manual), nilai `VITE_*` diambil dari
> `.env.production` **lokal** saat `pnpm build:web` — env var di dashboard
> TIDAK berpengaruh (build terjadi di mesinmu). Env var dashboard hanya
> dipakai kalau build dilakukan Cloudflare (Opsi B).

---

## 10. Custom Domain untuk Pages

1. Dashboard → **Workers & Pages** → project **nqdrive-web** → tab
   **Custom domains** → **Set up a custom domain**.
2. Isi `drive.example.com` → **Continue** → **Activate domain**.
3. Cloudflare membuat CNAME otomatis. Tunggu status **Active**.

---

## 11. Pages Function & WAJIB CEK: WORKER_ORIGIN

### Pages Function jalan otomatis

`apps/web/functions/[[catchall]].ts` adalah **Pages Function** yang memproxy
link download/share (`/download/...`, `shareCode/slug`, dll.) dari domain
Pages ke Worker. Folder `functions/` yang berada di samping
`pages_build_output_dir` **otomatis ter-deploy** oleh
`wrangler pages deploy` maupun build Git-connect — **tidak perlu setup
tambahan**. (Bisa dicek: dashboard → project Pages → deployment terbaru →
tab **Functions** menampilkan route `/*`.)

### 🚨 WAJIB CEK: environment variable WORKER_ORIGIN

Function ini menentukan ke mana proxy diarahkan dari env `WORKER_ORIGIN`,
dengan **default hardcoded** di `apps/web/functions/[[catchall]].ts` baris 19:

```ts
const DEFAULT_WORKER_ORIGIN = "https://apiweb.fiqul.id";
```

Artinya: **kalau kamu tidak men-set `WORKER_ORIGIN`, semua link download di
domain Pages kamu akan diproxy ke `apiweb.fiqul.id`** — domain orang lain,
bukan Worker kamu. Ini WAJIB di-set, bukan opsional:

1. Dashboard → **Workers & Pages** → project **nqdrive-web** →
   **Settings** → **Variables and Secrets** (atau *Environment variables*) →
   **Add**.
2. Scope **Production** (dan Preview kalau dipakai):

   ```
   WORKER_ORIGIN = https://api.example.com
   ```

3. **Save**, lalu **re-deploy** supaya function membaca nilai baru:

   ```bash
   pnpm deploy:web
   ```

   (Env var Pages baru berlaku pada deployment berikutnya.)

---

## 12. ⚠️ Finalisasi: ALLOWED_ORIGINS + Google OAuth

**Tanpa langkah ini, dashboard tidak bisa login walau semua domain aktif.**

### 12.1 Tambah domain Pages ke ALLOWED_ORIGINS

Worker hanya menerima request browser dari origin terdaftar. Edit
`apps/worker/src/index.ts` **baris 54-61**:

```ts
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  // Production domains
  "https://drive.fiqul.id",
  "https://www.drive.fiqul.id",
  // Domain kamu:
  "https://drive.example.com",
]);
```

(Yang dimasukkan **domain Pages** — origin tempat dashboard berjalan. Domain
Worker sendiri tidak perlu.)

### 12.2 Finalkan vars di wrangler.jsonc

Pastikan `apps/worker/wrangler.jsonc` blok `"vars"` sudah menunjuk domain
final (sudah dilakukan di langkah 6 — cek ulang):

```jsonc
"GOOGLE_OAUTH_REDIRECT_URI": "https://api.example.com",
"WEB_APP_URL": "https://drive.example.com"
```

### 12.3 Daftarkan redirect URI di Google Cloud Console

<https://console.cloud.google.com/apis/credentials> → OAuth client kamu →
**Authorized redirect URIs** → tambahkan:

```
https://api.example.com/api/storage/accounts/oauth/callback
```

→ **Save**. (Callback OAuth ditangani Worker, jadi pakai **domain Worker** —
bukan domain Pages.)

### 12.4 Deploy ulang Worker

```bash
pnpm deploy:worker
```

Commit perubahan `index.ts` + `wrangler.jsonc` + `.env.production` supaya
konfigurasi ini permanen:

```bash
git add apps/worker/src/index.ts apps/worker/wrangler.jsonc apps/web/.env.production
git commit -m "chore: konfigurasi domain production Cloudflare"
```

---

## 13. Verifikasi

### 13.1 curl ke domain Worker langsung

```bash
curl -s -H "X-App-Client: nqdrive-web" -H "Origin: https://drive.example.com" https://api.example.com/config
# Harus: {"success":true,"data":{"brand_color":"","theme_mode":"light"}}

curl -s -o /dev/null -w "%{http_code}\n" https://api.example.com/config
# Tanpa header harus: 404 (guard bekerja)
```

### 13.2 curl ke domain Pages (menguji Pages Function proxy)

```bash
# /api/* di Pages diproxy function [[catchall]].ts ke Worker (whitelist path dashboard):
curl -s -o /dev/null -w "%{http_code}\n" https://drive.example.com/api/me
# 401/404 dari Worker = proxy JALAN (bukan halaman HTML Pages).

# Path download tak dikenal harus jatuh ke SPA (HTML):
curl -s -o /dev/null -w "%{content_type}\n" https://drive.example.com/
# text/html
```

### 13.3 Browser end-to-end

1. Buka `https://drive.example.com` → halaman **setup admin pertama**.
2. Buat admin → login. (Kalau login gagal dengan error network/CORS di
   DevTools → langkah 12.1 belum benar atau Worker belum di-deploy ulang.)
3. **Storage** → hubungkan akun Google Drive (uji langkah 12.3 — error
   `redirect_uri_mismatch` berarti URI di Google Console belum persis).
4. Upload file kecil → sukses.
5. Jadikan file public → buka link download dari **domain Pages** → function
   memproxy ke Worker → file terunduh. (Kalau 404/salah domain → cek
   `WORKER_ORIGIN` langkah 11.)

### 13.4 Cron

Dashboard → **Workers & Pages** → nqdrive-worker → tab **Logs** (atau
**Settings → Triggers**): cron `*/10 * * * *` terdaftar; setelah ±10 menit
ada invocation `scheduled` di log.

---

## Troubleshooting cepat

| Gejala | Cek |
|---|---|
| Login gagal, DevTools menunjukkan CORS error | Domain Pages belum di `ALLOWED_ORIGINS` + `pnpm deploy:worker` ulang (12.1, 12.4) |
| Link download di domain Pages menuju domain orang lain / 404 | `WORKER_ORIGIN` belum di-set di Pages dashboard (langkah 11) + re-deploy |
| `redirect_uri_mismatch` saat hubungkan Drive | URI di Google Console harus sama persis dengan 12.3 (domain Worker + path callback) |
| Dashboard fetch ke URL salah | `.env.production` salah isi saat build (9.1) — perbaiki lalu `pnpm deploy:web:full` |
| `wrangler d1 execute` error "not authorized" | `pnpm exec wrangler login` ulang; pastikan akun punya akses zona |
| Setup admin tidak muncul, error 500 | Skema belum dijalankan — ulangi langkah 4 |
