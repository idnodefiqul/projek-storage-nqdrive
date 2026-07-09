# NQDRIVE — Tutorial Deploy VPS dengan Nginx (tanpa Docker)

Tutorial ini membawa kamu dari VPS Ubuntu kosong sampai NQDRIVE berjalan di
domain HTTPS. Setiap perintah ditulis lengkap dan bisa langsung copy-paste.
Diuji untuk Ubuntu 22.04/24.04 LTS.

**Arsitektur yang akan terpasang:**

```
Browser
   │ HTTPS :443
   ▼
Nginx ──► file statis React (apps/web/dist)          [dashboard, halaman share]
   │
   └────► worker Node.js :8787 (systemd service)     [/api/*, /config, /captcha,
              │                                       /resource/*, /system/*,
              ▼                                       link download]
          SQLite (file .db, better-sqlite3)
```

File konfigurasi yang dipakai tutorial ini **sudah ada di repo** — jangan tulis ulang:

| File di repo | Dipasang ke |
|---|---|
| `deploy/nginx-standalone/nqdrive.nginx.conf` | `/etc/nginx/sites-available/nqdrive.conf` |
| `deploy/nginx-standalone/nqdrive-proxy.conf` | `/etc/nginx/snippets/nqdrive-proxy.conf` |
| `deploy/nginx-standalone/nqdrive-worker.service` | `/etc/systemd/system/nqdrive-worker.service` |
| `apps/worker/.env.example` | `/etc/nqdrive/worker.env` |

Sepanjang tutorial, ganti `drive.example.com` dengan domain kamu.

---

## Daftar Isi

1. [Provisioning VPS: user non-root, SSH, firewall](#1-provisioning-vps)
2. [Install Node.js 22, pnpm, git, sqlite3](#2-install-tooling)
3. [Clone repo & install dependencies](#3-clone-repo--install-dependencies)
4. [Migrasi database SQLite](#4-migrasi-database-sqlite)
5. [Setup .env worker (semua variable dijelaskan)](#5-setup-env-worker)
6. [Build frontend (VITE_WORKER_URL kosong)](#6-build-frontend)
7. [Pasang worker sebagai systemd service](#7-pasang-worker-sebagai-systemd-service)
8. [Install & konfigurasi Nginx](#8-install--konfigurasi-nginx)
9. [DNS: A record ke IP VPS](#9-dns-a-record)
10. [HTTPS dengan Certbot](#10-https-dengan-certbot)
11. [⚠️ WAJIB: ALLOWED_ORIGINS + Google OAuth redirect URI](#11-wajib-allowed_origins--google-oauth-redirect-uri)
12. [Restart worker](#12-restart-worker)
13. [Verifikasi menyeluruh](#13-verifikasi)
14. [Update aplikasi & troubleshooting](#14-update-aplikasi--troubleshooting)

---

## 1. Provisioning VPS

Login pertama biasanya sebagai `root`. Jangan jalankan aplikasi sebagai root —
buat user khusus.

### 1.1 Buat user non-root

```bash
adduser nqdrive
# Isi password saat diminta; field lain (Full Name dll.) boleh Enter kosong.

usermod -aG sudo nqdrive
```

### 1.2 Salin SSH key ke user baru

Supaya kamu bisa SSH langsung sebagai `nqdrive` dengan key yang sama:

```bash
rsync --archive --chown=nqdrive:nqdrive ~/.ssh /home/nqdrive
```

Tes dari komputer lokal kamu (terminal baru, jangan tutup sesi root dulu):

```bash
ssh nqdrive@IP_VPS_KAMU
```

Kalau berhasil masuk, lanjutkan seluruh tutorial **sebagai user `nqdrive`**.
(Opsional tapi disarankan: matikan login root SSH — edit
`/etc/ssh/sshd_config`, set `PermitRootLogin no`, lalu `sudo systemctl restart ssh`.)

### 1.3 Firewall (ufw)

Buka hanya SSH, HTTP, dan HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Ketik y saat ditanya "Command may disrupt existing ssh connections. Proceed?"

sudo ufw status
# Harus menampilkan: 22/tcp (OpenSSH), 80/tcp, 443/tcp = ALLOW
```

> Port 8787 (worker Node) **sengaja tidak dibuka** — hanya nginx di mesin yang
> sama yang boleh mengaksesnya via 127.0.0.1.

---

## 2. Install Tooling

### 2.1 Node.js 22 (via NodeSource)

Root `package.json` mensyaratkan `"node": ">=20.0.0"`; kita pakai Node 22 LTS
(sama dengan image Docker project ini):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version
# Harus v22.x.x
```

### 2.2 Toolchain build (fallback kompilasi native better-sqlite3)

`better-sqlite3` versi di repo (^12.4.1) punya prebuilt binary untuk Node 22
Linux x64 — biasanya tidak perlu kompilasi. Tapi pasang toolchain-nya sebagai
jaring pengaman (arsitektur ARM, versi Node non-standar, dll.):

```bash
sudo apt-get install -y build-essential python3
```

### 2.3 pnpm (via corepack)

Root `package.json` mensyaratkan `"pnpm": ">=9.0.0"` dengan
`"packageManager": "pnpm@9.12.0"`:

```bash
sudo corepack enable
corepack prepare pnpm@9.12.0 --activate

pnpm --version
# Harus 9.12.0
```

### 2.4 git dan sqlite3 CLI

```bash
sudo apt-get install -y git sqlite3

sqlite3 --version
# Versi apa pun 3.x cukup
```

---

## 3. Clone Repo & Install Dependencies

```bash
sudo mkdir -p /opt/nqdrive
sudo chown nqdrive:nqdrive /opt/nqdrive

git clone URL_REPO_KAMU /opt/nqdrive
cd /opt/nqdrive

pnpm install
```

`pnpm install` juga memasang `better-sqlite3` (prebuilt) dan `tsx` yang dipakai
service systemd nanti. Kalau muncul error kompilasi better-sqlite3, pastikan
langkah 2.2 sudah dijalankan lalu ulangi `pnpm install`.

---

## 4. Migrasi Database SQLite

Skema lengkap & idempoten ada di `apps/worker/dbcloud.sql` (aman dijalankan
berulang — hanya `CREATE TABLE IF NOT EXISTS`, tanpa DROP/DELETE).

```bash
mkdir -p /opt/nqdrive/apps/worker/data
sqlite3 /opt/nqdrive/apps/worker/data/nqdrive.db < /opt/nqdrive/apps/worker/dbcloud.sql
```

Verifikasi tabel terbentuk:

```bash
sqlite3 /opt/nqdrive/apps/worker/data/nqdrive.db ".tables"
```

Harus muncul (15 tabel):

```
api_keys           download_logs      login_attempts     settings
audit_logs         drive_accounts     migration_items    upload_logs
download_attempts  files              migration_jobs     upload_sessions
folders            sqlite_sequence    users
```

---

## 5. Setup .env Worker

Template ada di `apps/worker/.env.example`. Simpan versi produksinya di
`/etc/nqdrive/worker.env` (di luar repo, supaya tidak ke-commit dan tidak
tertimpa `git pull`):

```bash
sudo mkdir -p /etc/nqdrive
sudo cp /opt/nqdrive/apps/worker/.env.example /etc/nqdrive/worker.env
sudo nano /etc/nqdrive/worker.env
```

### Penjelasan SETIAP variable

| Variable | Nilai untuk deploy ini | Penjelasan |
|---|---|---|
| `DB_PATH` | `/opt/nqdrive/apps/worker/data/nqdrive.db` | Path file SQLite yang dibuat di langkah 4. |
| `PORT` | `8787` | Port worker Node. Harus cocok dengan `upstream` di `nqdrive.nginx.conf` (127.0.0.1:8787). |
| `APP_ENV` | `production` | `production` menyembunyikan stack trace error dari response API. |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://drive.example.com` | URL yang dituju Google setelah user menyetujui OAuth. Harus SAMA PERSIS dengan yang didaftarkan di Google Cloud Console (langkah 5.2 + 11). |
| `WEB_APP_URL` | `https://drive.example.com` | URL publik web app; dipakai untuk redirect setelah login/OAuth. |
| `JWT_SECRET` | hasil generate | Menandatangani session token login. Lihat 5.1. |
| `GOOGLE_CLIENT_ID` | dari Google Console | Lihat 5.2. |
| `GOOGLE_CLIENT_SECRET` | dari Google Console | Lihat 5.2. |
| `ENCRYPTION_KEY` | hasil generate | Kunci AES 32-byte (base64) untuk mengenkripsi refresh token Google Drive di database. Lihat 5.1. |

### 5.1 Generate JWT_SECRET dan ENCRYPTION_KEY

```bash
# JWT_SECRET:
openssl rand -base64 48

# ENCRYPTION_KEY (WAJIB 32 byte = output base64 dari 32):
openssl rand -base64 32
```

Salin masing-masing output ke variable-nya di `/etc/nqdrive/worker.env`.

> ⚠️ Simpan `ENCRYPTION_KEY` baik-baik. Kalau hilang/berubah, semua refresh
> token Google Drive yang tersimpan tidak bisa didekripsi lagi dan setiap akun
> Drive harus dihubungkan ulang.

### 5.2 Dapatkan GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET

1. Buka <https://console.cloud.google.com/> → buat project baru (atau pakai
   yang sudah ada).
2. Menu **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. Menu **APIs & Services → OAuth consent screen** → pilih **External** →
   isi nama app + email → **Save**. (Status "Testing" cukup; tambahkan alamat
   Gmail kamu di **Test users**.)
4. Menu **APIs & Services → Credentials** → **Create Credentials →
   OAuth client ID** → Application type: **Web application**.
5. Di **Authorized redirect URIs**, tambahkan (sementara — difinalkan lagi di
   langkah 11):

   ```
   https://drive.example.com/api/storage/accounts/oauth/callback
   ```

6. **Create** → salin **Client ID** dan **Client secret** ke
   `/etc/nqdrive/worker.env`.

### 5.3 Amankan file env

```bash
sudo chmod 600 /etc/nqdrive/worker.env
sudo chown root:root /etc/nqdrive/worker.env
```

---

## 6. Build Frontend

### Kenapa `VITE_WORKER_URL` HARUS kosong di VPS

Di Cloudflare, dashboard (Pages) dan API (Worker) berada di **dua domain
berbeda**, jadi browser perlu tahu URL worker → `VITE_WORKER_URL` diisi.

Di VPS ini semuanya **satu domain**: nginx menerima semua request lalu
merutekan `/api/*`, `/config`, dll. ke worker Node di mesin yang sama. Dengan
`VITE_WORKER_URL` kosong, semua `fetch()` di frontend memakai **path relatif**
(`/api/...`) yang otomatis menuju domain nginx — tanpa CORS lintas domain.

### File yang menentukan untuk build VPS: `apps/web/.env.production.local`

`apps/web/.env.production` ter-track di repo dan berisi nilai produksi
Cloudflare (`VITE_WORKER_URL=https://apiweb.fiqul.id` dll.) — jangan diedit,
nilai itu dipakai oleh build Cloudflare Pages dan kalau ikut kosong akan
merusak deploy Cloudflare berikutnya.

Vite untuk mode production memuat `.env.production` **dan**
`.env.production.local`, dengan `.env.production.local` menang untuk key yang
sama. File `.env.production.local` sudah ter-cover pola `.env.*.local` di
`.gitignore` root → **tidak pernah bisa ter-commit**, tanpa perlu langkah
revert manual. Tidak ada dockerignore yang perlu dirubah untuk jalur ini
(build langsung dengan `pnpm build:web`, bukan lewat Docker).

Buat file overrides:

```bash
printf 'VITE_WORKER_URL=\n' > /opt/nqdrive/apps/web/.env.production.local
```

Hasilnya di folder `apps/web/`:

```
.env.production         ← tracked, nilai Cloudflare (fique)
.env.production.local   ← local-only, override VPS (kosongkan VITE_WORKER_URL)
```

> Tidak ada `git checkout` / `git stash` yang perlu dijalankan. File
> `.env.production.local` otomatis tidak masuk `git status`. Build berikutnya
> cukup overwrite isi file ini (`printf 'VITE_WORKER_URL=\n' > ...`) atau
> hapus saja kalau mau kembali ke nilai Cloudflare.

### Build

```bash
cd /opt/nqdrive
pnpm build:web
```

(Script `build:web` ada di root `package.json` =
`pnpm --filter @nqdrive/web build`; otomatis menjalankan `prebuild`
`scripts/generate-headers.mjs` lalu `tsc -b && vite build`.)

Hasil build: `/opt/nqdrive/apps/web/dist`. File
`apps/web/.env.production.local` boleh dibiarkan (untuk re-deploy berikutnya)
atau dihapus kalau mau kembali ke default Cloudflare:

```bash
# hapus override kalau mau kembali murni ke nilai Cloudflare
rm /opt/nqdrive/apps/web/.env.production.local
```

---

## 7. Pasang Worker sebagai systemd Service

Template service **sudah ada** di `deploy/nginx-standalone/nqdrive-worker.service`:

```bash
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive-worker.service /etc/systemd/system/
```

Isi template sudah cocok dengan layout tutorial ini
(`User=nqdrive`, `WorkingDirectory=/opt/nqdrive/apps/worker`,
`EnvironmentFile=/etc/nqdrive/worker.env`,
`ExecStart=/opt/nqdrive/apps/worker/node_modules/.bin/tsx src/node-entry.ts`,
`ReadWritePaths=/opt/nqdrive/apps/worker/data`). Kalau kamu memakai path/user
lain, sesuaikan dengan `sudo nano /etc/systemd/system/nqdrive-worker.service`.

Aktifkan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nqdrive-worker
```

Cek status dan log:

```bash
systemctl status nqdrive-worker
# Harus: Active: active (running)

journalctl -u nqdrive-worker -f
# Harus muncul:
#   [node-entry] SQLite terbuka: /opt/nqdrive/apps/worker/data/nqdrive.db
#   [node-entry] NQDRIVE worker (Node standalone) listening on http://0.0.0.0:8787
# (Ctrl+C untuk keluar dari log)
```

Kalau service gagal start, `journalctl -u nqdrive-worker -n 50` menunjukkan
alasannya — paling umum: env wajib kosong (pesan
`Env berikut wajib diisi ...`) atau `DB_PATH` salah (pesan
`File database tidak ditemukan`).

Tes worker langsung (dari VPS):

```bash
curl -s -H "X-App-Client: nqdrive-web" -H "Sec-Fetch-Site: same-origin" http://127.0.0.1:8787/config
# Harus: {"success":true,"data":{"brand_color":"","theme_mode":"light"}}
```

---

## 8. Install & Konfigurasi Nginx

```bash
sudo apt-get install -y nginx
```

Pasang **kedua** file dari repo (config utama merujuk snippet via `include`,
jadi snippet wajib ada duluan):

```bash
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive-proxy.conf /etc/nginx/snippets/nqdrive-proxy.conf
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive.nginx.conf /etc/nginx/sites-available/nqdrive.conf
```

Edit domain (ganti semua `drive.example.com` — ada di blok 80, blok 443, dan
dua path sertifikat). Cara cepat dengan `sed` (ganti `DOMAINKAMU` dengan
domain aslimu, mis. `drive.contoh.id`):

```bash
sudo sed -i 's/drive\.example\.com/DOMAINKAMU/g' /etc/nginx/sites-available/nqdrive.conf
sudo nano /etc/nginx/sites-available/nqdrive.conf
# Cek ulang hasil sed. Pastikan juga: root /opt/nqdrive/apps/web/dist;
# (sudah default di file repo)
```

Aktifkan site, matikan default:

```bash
sudo ln -s /etc/nginx/sites-available/nqdrive.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

> **Jangan `nginx -t` dulu** — blok `443 ssl` merujuk sertifikat
> `/etc/letsencrypt/live/...` yang belum ada, jadi test pasti gagal. Itu
> normal; kita selesaikan di langkah 10.

---

## 9. DNS: A Record

Di panel DNS domain kamu (registrar atau Cloudflare DNS):

1. Tambah record: **Type** `A`, **Name** `drive` (atau `@` untuk apex domain),
   **Value** = IP publik VPS, **TTL** default.
2. Kalau pakai Cloudflare DNS: set awan **abu-abu (DNS only)** dulu selama
   setup certbot — proxy oranye membuat challenge HTTP certbot lebih rumit.

Tunggu propagasi — biasanya menit-an, bisa sampai beberapa jam tergantung TTL
dan resolver:

```bash
dig +short drive.example.com
# Harus mengembalikan IP VPS kamu. Kalau masih kosong/IP lama, tunggu lagi.
```

Jangan lanjut ke certbot sebelum `dig` mengembalikan IP yang benar — validasi
Let's Encrypt akan gagal.

---

## 10. HTTPS dengan Certbot

### 10.1 Install

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 10.2 Nonaktifkan sementara blok 443

Sertifikat belum ada, jadi nginx belum bisa load blok `443 ssl`. Comment
seluruh blok `server { listen 443 ssl; ... }` (dari baris `server {` kedua
sampai `}` penutupnya) di `/etc/nginx/sites-available/nqdrive.conf`:

```bash
sudo nano /etc/nginx/sites-available/nqdrive.conf
# Tambahkan '#' di depan setiap baris blok server 443 (blok kedua).

sudo nginx -t
# Sekarang harus: syntax is ok / test is successful
sudo systemctl reload nginx
```

### 10.3 Jalankan certbot

```bash
sudo certbot --nginx -d drive.example.com
```

Prompt interaktif yang akan muncul, berurutan:

1. **Enter email address** → isi email kamu (untuk notifikasi kedaluwarsa
   sertifikat).
2. **Terms of Service (A)gree/(C)ancel** → ketik `A`.
3. **Share email with EFF? (Y)es/(N)o** → bebas, `N` tidak masalah.
4. Certbot melakukan validasi domain (lewat blok port 80 yang sudah aktif)
   lalu menulis sertifikat ke
   `/etc/letsencrypt/live/drive.example.com/`.
5. Kalau ditanya **redirect HTTP→HTTPS**, pilihan mana pun aman — file config
   repo sudah punya `return 301 https://...` sendiri di blok 80.

### 10.4 Aktifkan kembali blok 443

Un-comment blok server 443 yang tadi di-comment, pastikan dua baris ini
menunjuk file yang barusan diterbitkan (sesuai output certbot):

```nginx
ssl_certificate     /etc/letsencrypt/live/drive.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/drive.example.com/privkey.pem;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 10.5 Tes auto-renewal

Certbot memasang systemd timer otomatis. Verifikasi:

```bash
sudo certbot renew --dry-run
# Harus: Congratulations, all simulated renewals succeeded
```

---

## 11. ⚠️ WAJIB: ALLOWED_ORIGINS + Google OAuth Redirect URI

**Tanpa dua hal ini, HTTPS boleh saja sudah hijau tapi login dan API akan
DITOLAK.** Ini langkah yang paling sering terlewat.

### 11.1 Tambah domain ke ALLOWED_ORIGINS

Worker menolak request browser yang origin-nya tidak ada di allowlist. Edit
`apps/worker/src/index.ts` — definisinya ada di **baris 54-61**:

```bash
nano /opt/nqdrive/apps/worker/src/index.ts
```

Sebelum:

```ts
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  // Production domains
  "https://drive.fiqul.id",
  "https://www.drive.fiqul.id",
]);
```

Sesudah (tambahkan domain VPS kamu sebelum `]);`):

```ts
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  // Production domains
  "https://drive.fiqul.id",
  "https://www.drive.fiqul.id",
  // VPS
  "https://drive.example.com",
]);
```

> Perubahan ini **aman di-commit** (beda dengan `.env.production`!) — ia hanya
> MENAMBAH origin dan tidak mengubah perilaku deployment Cloudflare. Commit
> supaya tidak hilang saat `git pull` berikutnya.

### 11.2 Pastikan GOOGLE_OAUTH_REDIRECT_URI di env sudah benar

```bash
sudo nano /etc/nqdrive/worker.env
# GOOGLE_OAUTH_REDIRECT_URI=https://drive.example.com
# WEB_APP_URL=https://drive.example.com
```

### 11.3 Daftarkan redirect URI di Google Cloud Console

Buka <https://console.cloud.google.com/apis/credentials> → klik OAuth client
kamu → bagian **Authorized redirect URIs** → pastikan ada:

```
https://drive.example.com/api/storage/accounts/oauth/callback
```

→ **Save**. Tanpa entri ini Google menolak OAuth dengan error
`redirect_uri_mismatch` saat menghubungkan akun Drive.

---

## 12. Restart Worker

Perubahan `index.ts` dan `worker.env` butuh restart service:

```bash
sudo systemctl restart nqdrive-worker
systemctl status nqdrive-worker
# Active: active (running)
```

> Perubahan ini mengubah kode yang di-load worker (`index.ts`) dan env
> eksternal (`worker.env`); **bukan** `apps/web/.env.production`, jadi tidak
> ada hubungannya dengan override `.env.production.local`.

---

## 13. Verifikasi

### 13.1 API lewat nginx (HTTPS)

```bash
curl -s -H "X-App-Client: nqdrive-web" https://drive.example.com/config
# Harus: {"success":true,"data":{"brand_color":"","theme_mode":"light"}}

curl -s -o /dev/null -w "%{http_code}\n" https://drive.example.com/config
# Tanpa header X-App-Client harus: 404  (guard API bekerja)
```

### 13.2 Browser end-to-end

1. Buka `https://drive.example.com` → halaman **setup admin pertama** muncul
   (database masih kosong).
2. Buat akun admin → login.
3. **Storage** → hubungkan akun Google Drive (di sinilah OAuth langkah 11
   teruji — kalau muncul `redirect_uri_mismatch`, ulangi 11.3).
4. Upload file kecil dari dashboard → harus sukses.
5. Jadikan file public → buka link download-nya → file terunduh.

### 13.3 Test resumable download (Range request)

```bash
# Ambil byte 0-99 saja dari link download file public kamu:
curl -s -o /dev/null -w "%{http_code}\n" -r 0-99 "https://drive.example.com/LINK_DOWNLOAD_FILE_KAMU"
# Harus: 206  (Partial Content — resume/seek bekerja lewat nginx)
```

### 13.4 Service tahan reboot

```bash
sudo reboot
# Tunggu ±1 menit, SSH lagi, lalu:
systemctl status nqdrive-worker    # Active: active (running)
systemctl status nginx             # Active: active (running)
curl -s -H "X-App-Client: nqdrive-web" https://drive.example.com/config
```

---

## 14. Update Aplikasi & Troubleshooting

### Update ke versi terbaru

```bash
cd /opt/nqdrive
git pull
pnpm install

# Pastikan override VPS masih ada (atau buat ulang kalau terhapus):
printf 'VITE_WORKER_URL=\n' > /opt/nqdrive/apps/web/.env.production.local

pnpm build:web

sudo systemctl restart nqdrive-worker
```

### Troubleshooting cepat

| Gejala | Cek |
|---|---|
| 502 Bad Gateway | `systemctl status nqdrive-worker` — worker mati? `journalctl -u nqdrive-worker -n 50` |
| Login ditolak / CORS error di console browser | Domain belum ada di `ALLOWED_ORIGINS` (langkah 11.1) + belum restart worker |
| `redirect_uri_mismatch` dari Google | Redirect URI di Google Console tidak sama persis dengan langkah 11.3 |
| Dashboard blank / fetch ke `apiweb.fiqul.id` | Frontend ter-build tanpa override `.env.production.local` (atau file terhapus). Buat ulang dengan `printf 'VITE_WORKER_URL=\n' > /opt/nqdrive/apps/web/.env.production.local` lalu `pnpm build:web` ulang |
| Download 404 tapi file ada | Cek `download_endpoint` di Settings dashboard; link lama tidak berlaku setelah endpoint diganti |
| Sertifikat kedaluwarsa | `sudo certbot renew` manual, lalu cek `systemctl list-timers | grep certbot` |

### Backup database

```bash
sqlite3 /opt/nqdrive/apps/worker/data/nqdrive.db ".backup /home/nqdrive/nqdrive-backup-$(date +%F).db"
```
