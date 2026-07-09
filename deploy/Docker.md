# NQDRIVE — Tutorial Deploy VPS dengan Docker Compose

Tutorial ini membawa kamu dari VPS Ubuntu kosong sampai NQDRIVE berjalan di
domain HTTPS, semuanya dalam container. Setiap perintah lengkap dan bisa
langsung copy-paste. Diuji untuk Ubuntu 22.04/24.04 LTS.

**Arsitektur yang akan terpasang (4 container, didefinisikan di
`deploy/docker/docker-compose.yml`):**

```
Browser
   │ HTTPS :443
   ▼
[nginx]  nginx:alpine — reverse proxy (config: deploy/docker/nginx.conf)
   │
   ├──► [web]     nginx:alpine berisi hasil build React      (SPA dashboard)
   │              (build: deploy/docker/web.Dockerfile)
   │
   └──► [worker]  Node 22 + better-sqlite3 :8787             (semua API + download)
                  (build: deploy/docker/worker.Dockerfile)
                  volume ./data ──► /data/nqdrive.db (SQLite, persist)

[certbot] loop renewal sertifikat tiap 12 jam (volume bersama dengan nginx)
```

File yang dipakai tutorial ini **sudah ada di repo** — jangan tulis ulang:

| File di repo | Fungsi |
|---|---|
| `deploy/docker/docker-compose.yml` | Definisi 4 service di atas |
| `deploy/docker/worker.Dockerfile` | Image worker Node |
| `deploy/docker/web.Dockerfile` | Image frontend (multi-stage build → nginx) |
| `deploy/docker/nginx.conf` | Config reverse proxy (routing sama dengan versi non-Docker) |
| `apps/worker/.env.example` | Template env worker → disalin jadi `deploy/docker/worker.env` |

Sepanjang tutorial, ganti `drive.example.com` dengan domain kamu.

---

## Daftar Isi

1. [Provisioning VPS: user non-root, SSH, firewall](#1-provisioning-vps)
2. [Install Docker + Compose plugin, sqlite3](#2-install-docker)
3. [Clone repo](#3-clone-repo)
4. [Siapkan worker.env (semua variable dijelaskan)](#4-siapkan-workerenv)
5. [Migrasi database SQLite](#5-migrasi-database-sqlite)
6. [VITE_WORKER_URL kosong: web.Dockerfile + .env.production.local](#6-vite_worker_url-kosong)
7. [Edit domain di nginx.conf](#7-edit-domain-di-nginxconf)
8. [DNS: A record ke IP VPS](#8-dns-a-record)
9. [HTTPS 2 tahap: sertifikat dulu, baru compose up](#9-https-2-tahap)
10. [⚠️ WAJIB: ALLOWED_ORIGINS + Google OAuth redirect URI](#10-wajib-allowed_origins--google-oauth-redirect-uri)
11. [Verifikasi menyeluruh](#11-verifikasi)
12. [Update aplikasi & troubleshooting](#12-update-aplikasi--troubleshooting)

---

## 1. Provisioning VPS

Sama seperti jalur non-Docker: jangan jalankan apa pun sebagai root.

### 1.1 Buat user non-root

```bash
adduser nqdrive
# Isi password; field lain boleh Enter kosong.

usermod -aG sudo nqdrive
```

### 1.2 Salin SSH key

```bash
rsync --archive --chown=nqdrive:nqdrive ~/.ssh /home/nqdrive
```

Tes dari komputer lokal (terminal baru): `ssh nqdrive@IP_VPS_KAMU`.
Lanjutkan seluruh tutorial sebagai user `nqdrive`.

### 1.3 Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Ketik y saat diminta konfirmasi.

sudo ufw status
```

> Catatan khusus Docker: port yang di-`ports:` di compose (80/443 milik
> service nginx) dibuka Docker langsung lewat iptables — ufw tidak
> menghalanginya. Karena compose file ini hanya mem-publish 80/443 (worker
> dan web hanya `expose` internal), tidak ada port lain yang bocor.

---

## 2. Install Docker

### 2.1 Docker Engine + Compose plugin (script resmi)

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Supaya bisa menjalankan docker tanpa sudo:

```bash
sudo usermod -aG docker nqdrive
# WAJIB logout lalu SSH lagi supaya group baru berlaku.
exit
```

SSH lagi, lalu verifikasi:

```bash
docker --version
docker compose version
# docker compose v2.x — kalau "compose" tidak dikenal, install plugin:
#   sudo apt-get install -y docker-compose-plugin
```

### 2.2 sqlite3 CLI (di host, untuk migrasi database)

```bash
sudo apt-get install -y sqlite3
```

> Node.js/pnpm TIDAK perlu di-install di host — semuanya terjadi di dalam
> image saat `docker compose build`.

---

## 3. Clone Repo

```bash
git clone URL_REPO_KAMU ~/nqdrive
cd ~/nqdrive/deploy/docker
```

Semua perintah `docker compose` selanjutnya dijalankan **dari folder
`~/nqdrive/deploy/docker`** (compose file ada di situ; build context menunjuk
root repo).

---

## 4. Siapkan worker.env

Compose service `worker` membaca `env_file: ./worker.env`. Buat dari template:

```bash
cp ../../apps/worker/.env.example ./worker.env
nano worker.env
```

### Bedanya dengan .env worker biasa (non-Docker)

Dua variable **boleh dibiarkan apa adanya** karena `docker-compose.yml`
menimpanya lewat blok `environment:` (nilai `environment:` menang atas
`env_file:`):

- `DB_PATH` → dipaksa jadi `/data/nqdrive.db` (path di dalam container;
  di-mount dari `./data` di host)
- `PORT` → dipaksa jadi `8787`

Sisanya WAJIB diisi, sama seperti jalur non-Docker:

| Variable | Nilai | Cara dapat |
|---|---|---|
| `APP_ENV` | `production` | — |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://drive.example.com` | Harus sama dengan yang didaftarkan di Google Console (langkah 4.2 + 10) |
| `WEB_APP_URL` | `https://drive.example.com` | — |
| `JWT_SECRET` | hasil generate | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | hasil generate | `openssl rand -base64 32` — ⚠️ jangan sampai hilang; dipakai mengenkripsi refresh token Drive di DB |
| `GOOGLE_CLIENT_ID` | dari Google Console | Lihat 4.2 |
| `GOOGLE_CLIENT_SECRET` | dari Google Console | Lihat 4.2 |

### 4.1 Generate secrets

```bash
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY
```

### 4.2 Google OAuth credentials

1. <https://console.cloud.google.com/> → buat/pilih project.
2. **APIs & Services → Library** → **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → isi nama + email →
   Save. Tambahkan Gmail kamu di **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   type **Web application**.
5. **Authorized redirect URIs** → tambahkan:

   ```
   https://drive.example.com/api/storage/accounts/oauth/callback
   ```

6. **Create** → salin Client ID + Client secret ke `worker.env`.

### 4.3 Amankan

```bash
chmod 600 worker.env
```

(`worker.env` dan `data/` sudah masuk `.gitignore` repo — tidak akan
ke-commit.)

---

## 5. Migrasi Database SQLite

Skema idempoten ada di `apps/worker/dbcloud.sql`. Folder `./data` di sini
akan di-mount compose ke `/data` di container worker:

```bash
mkdir -p data
sqlite3 data/nqdrive.db < ../../apps/worker/dbcloud.sql

# Verifikasi (harus 15 tabel: users, settings, drive_accounts, files, ...):
sqlite3 data/nqdrive.db ".tables"
```

---

## 6. VITE_WORKER_URL Kosong

### Kenapa harus kosong (sama alasannya dengan jalur non-Docker)

Di Cloudflare, dashboard dan API ada di dua domain berbeda sehingga frontend
perlu `VITE_WORKER_URL`. Di VPS Docker semuanya satu domain: container nginx
menerima semua request lalu merutekan `/api/*` dkk. ke container worker.
`VITE_WORKER_URL` kosong ⇒ semua `fetch()` frontend pakai **path relatif**
lewat nginx yang sama — tanpa CORS lintas domain.

### Yang sudah disiapkan repo: ARG di web.Dockerfile + .dockerignore

`deploy/docker/web.Dockerfile` sudah mendeklarasikan:

```dockerfile
ARG VITE_WORKER_URL=""
ENV VITE_WORKER_URL=${VITE_WORKER_URL}
```

dan `docker-compose.yml` sudah meneruskan `VITE_WORKER_URL: ""` sebagai build
arg.

Root repo juga sudah punya `.dockerignore` yang mengecualikan file `.env.*`
dan `*.env` dari build context — **kecuali** `apps/web/.env.production.local`
yang di-whitelist eksplisit. Ini mencegah file secrets lain (seperti
`apps/worker/.env`, `worker.env`) ikut ter-bake ke image, sambil tetap
mengizinkan override yang kita buat di bawah.

### Buat override lokal: `apps/web/.env.production.local`

`apps/web/.env.production` ter-track di repo dan berisi nilai Cloudflare
(`VITE_WORKER_URL=https://apiweb.fiqul.id` dll.). Jangan diedit.

Vite untuk mode production memuat `.env.production` **dan**
`.env.production.local`, dengan `.env.production.local` menang untuk key yang
sama. File `.env.*.local` sudah ter-cover pola `.gitignore` root → **tidak
pernah bisa ke-commit**.

Buat file override — **sebelum `docker compose build`**:

```bash
printf 'VITE_WORKER_URL=\n' > ../../apps/web/.env.production.local
```

Verifikasi:

```bash
cat ../../apps/web/.env.production.local
# Output: VITE_WORKER_URL=
```

File ini akan otomatis ter-copy ke build context (whitelist di
`.dockerignore`), dan Vite membacanya dengan prioritas di atas
`.env.production` dari repo → hasil build frontend punya `VITE_WORKER_URL`
kosong, fetch relatif ke nginx.

> Tidak ada `git checkout` / `git stash` yang perlu dijalankan setelah build.
> File ini tidak masuk `git status`. Build berikutnya cukup overwrite atau
> hapus file ini kalau mau kembali ke nilai Cloudflare.

---

## 7. Edit Domain di nginx.conf

Config reverse proxy repo: `deploy/docker/nginx.conf` (di-mount read-only ke
container nginx). Ganti semua `drive.example.com` (ada di blok 80, blok 443,
dan dua path sertifikat):

```bash
sed -i 's/drive\.example\.com/DOMAINKAMU/g' nginx.conf
nano nginx.conf   # cek ulang hasilnya
```

---

## 8. DNS: A Record

Di panel DNS domain kamu:

1. **Type** `A`, **Name** `drive` (atau `@`), **Value** = IP publik VPS.
2. Kalau pakai Cloudflare DNS: set **DNS only** (awan abu-abu) dulu selama
   penerbitan sertifikat.

Tunggu propagasi (menit-an sampai beberapa jam):

```bash
dig +short drive.example.com
# Harus IP VPS kamu. Jangan lanjut sebelum benar.
```

---

## 9. HTTPS 2 Tahap

### Kenapa harus 2 tahap

`deploy/docker/nginx.conf` punya blok `listen 443 ssl` yang menunjuk file
sertifikat di `/etc/letsencrypt/live/...`. **Nginx menolak start kalau file
itu belum ada** — sedangkan untuk menerbitkan sertifikat, Let's Encrypt perlu
mengakses domain kamu lewat HTTP. Telur-ayam. Solusinya: terbitkan sertifikat
SEKALI di awal dengan certbot mode standalone (dia membuka port 80 sendiri,
sebelum nginx naik), baru setelah itu seluruh stack dinyalakan. Renewal
selanjutnya otomatis lewat service `certbot` di compose (mode webroot, tanpa
perlu port 80 bebas).

### Tahap 1 — terbitkan sertifikat (standalone, sekali saja)

Port 80 harus masih kosong (belum ada `docker compose up`):

```bash
docker run --rm -p 80:80 \
  -v nqdrive_certbot-etc:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d drive.example.com \
  --agree-tos -m emailkamu@example.com --no-eff-email
```

Penjelasan:

- `-v nqdrive_certbot-etc:...` — nama volume = `<project>_<volume>`; project
  name di `docker-compose.yml` adalah `nqdrive` dan volume-nya `certbot-etc`,
  jadi sertifikat yang diterbitkan di sini langsung terlihat oleh container
  nginx nanti.
- `--standalone` — certbot membuka web server mini di port 80 untuk menjawab
  challenge Let's Encrypt.
- `-m emailkamu@example.com` — email notifikasi kedaluwarsa. `--agree-tos` dan
  `--no-eff-email` membuat prosesnya non-interaktif.

Sukses = pesan `Successfully received certificate`.

### Tahap 2 — nyalakan seluruh stack

```bash
docker compose up -d --build
```

Build pertama memakan beberapa menit (install pnpm workspace + build Vite +
kompilasi/download better-sqlite3). Setelah selesai:

```bash
docker compose ps
# 4 service: worker, web, nginx, certbot — semua Up

docker compose logs -f worker
# Harus muncul:
#   [node-entry] SQLite terbuka: /data/nqdrive.db
#   [node-entry] NQDRIVE worker (Node standalone) listening on http://0.0.0.0:8787
# (Ctrl+C untuk berhenti melihat log)
```

### Renewal otomatis

Service `certbot` di compose sudah loop `certbot renew` tiap 12 jam (mode
webroot lewat volume `certbot-www` yang juga di-serve nginx di
`/.well-known/acme-challenge/`). Supaya nginx memuat sertifikat baru setelah
renewal, tambahkan reload terjadwal di host:

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * docker compose -f $HOME/nqdrive/deploy/docker/docker-compose.yml exec nginx nginx -s reload") | crontab -
```

---

## 10. ⚠️ WAJIB: ALLOWED_ORIGINS + Google OAuth Redirect URI

**Tanpa dua hal ini, login dan API DITOLAK walau HTTPS sudah aktif.**

### 10.1 Tambah domain ke ALLOWED_ORIGINS

Worker menolak request browser yang origin-nya tidak terdaftar. Edit
`apps/worker/src/index.ts` — definisinya di **baris 54-61**:

```bash
nano ~/nqdrive/apps/worker/src/index.ts
```

Tambahkan domain kamu sebelum `]);`:

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

> Perubahan ini **aman di-commit** (hanya menambah origin, tidak mengganggu
> deployment Cloudflare) — commit supaya tidak hilang saat `git pull`.

### 10.2 Cek ulang worker.env

```bash
nano ~/nqdrive/deploy/docker/worker.env
# GOOGLE_OAUTH_REDIRECT_URI=https://drive.example.com
# WEB_APP_URL=https://drive.example.com
```

### 10.3 Daftarkan redirect URI di Google Cloud Console

<https://console.cloud.google.com/apis/credentials> → OAuth client kamu →
**Authorized redirect URIs** harus memuat:

```
https://drive.example.com/api/storage/accounts/oauth/callback
```

Tanpa ini Google menolak dengan `redirect_uri_mismatch`.

### 10.4 Apply: rebuild container worker

Kode `index.ts` ter-copy saat build image, jadi perubahan butuh rebuild:

```bash
cd ~/nqdrive/deploy/docker
docker compose up -d --build worker
```

---

## 11. Verifikasi

### 11.1 Status container & log

```bash
docker compose ps
# worker, web, nginx, certbot semua "Up" / "running"

docker compose logs -f worker     # log API + cron tiap 10 menit
docker compose logs -f nginx      # access/error log proxy
# Ctrl+C untuk keluar
```

### 11.2 API lewat HTTPS

```bash
curl -s -H "X-App-Client: nqdrive-web" https://drive.example.com/config
# Harus: {"success":true,"data":{"brand_color":"","theme_mode":"light"}}

curl -s -o /dev/null -w "%{http_code}\n" https://drive.example.com/config
# Tanpa header harus: 404 (guard API bekerja)
```

### 11.3 Browser end-to-end

1. Buka `https://drive.example.com` → halaman setup admin pertama.
2. Buat admin → login.
3. **Storage** → hubungkan akun Google Drive (uji OAuth langkah 10).
4. Upload file kecil → sukses.
5. Jadikan public → buka link download → file terunduh.

### 11.4 Resumable download

```bash
curl -s -o /dev/null -w "%{http_code}\n" -r 0-99 "https://drive.example.com/LINK_DOWNLOAD_FILE_KAMU"
# Harus: 206 (Partial Content)
```

### 11.5 Tahan reboot

Semua service memakai `restart: unless-stopped`:

```bash
sudo reboot
# SSH lagi setelah ±1 menit:
cd ~/nqdrive/deploy/docker && docker compose ps   # semua Up lagi
```

---

## 12. Update Aplikasi & Troubleshooting

### Update ke versi terbaru

```bash
cd ~/nqdrive
git pull

# Pastikan override VPS masih ada (atau buat ulang kalau terhapus):
printf 'VITE_WORKER_URL=\n' > apps/web/.env.production.local

cd deploy/docker
docker compose up -d --build
```

### Troubleshooting cepat

| Gejala | Cek |
|---|---|
| nginx restart-loop | `docker compose logs nginx` — biasanya sertifikat belum ada (ulangi tahap 1 langkah 9) atau typo domain di nginx.conf |
| 502 Bad Gateway | `docker compose logs worker` — worker crash? env wajib kosong? |
| Login ditolak / CORS error | Domain belum di `ALLOWED_ORIGINS` + belum `up -d --build worker` (langkah 10) |
| `redirect_uri_mismatch` | Redirect URI Google Console tidak sama persis (langkah 10.3) |
| Dashboard fetch ke `apiweb.fiqul.id` | Build web memakai `.env.production` nilai Cloudflare — pastikan `apps/web/.env.production.local` ada dengan isi `VITE_WORKER_URL=`, lalu `docker compose up -d --build web` |
| Data hilang setelah rebuild | Pastikan file DB memang di `./data/nqdrive.db` (volume host), bukan di dalam container |

### Backup database

```bash
cd ~/nqdrive/deploy/docker
sqlite3 data/nqdrive.db ".backup $HOME/nqdrive-backup-$(date +%F).db"
```
