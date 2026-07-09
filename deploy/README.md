# NQDRIVE — Deploy Standalone ke VPS

Panduan ini untuk menjalankan NQDRIVE di VPS sendiri (Node + SQLite), sebagai
**tambahan** dari deployment Cloudflare yang sudah ada. Deployment Cloudflare
(`DEPLOY.md` di root repo) tetap berlaku dan tidak berubah.

Semua perintah di bawah **kamu jalankan sendiri via SSH** di VPS.

Ada dua jalur — pilih salah satu:

- **Jalur A — Nginx tanpa Docker** (`deploy/nginx-standalone/`)
- **Jalur B — Docker Compose** (`deploy/docker/`)

---

## 0. Persiapan awal VPS (kedua jalur)

### 0.1 Buat user non-root

```bash
adduser nqdrive
usermod -aG sudo nqdrive
# Salin SSH key kamu ke user baru
rsync --archive --chown=nqdrive:nqdrive ~/.ssh /home/nqdrive
# Login ulang sebagai nqdrive, jangan pakai root lagi
```

### 0.2 Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 0.3 DNS

Arahkan A record domain kamu (mis. `drive.example.com`) ke IP VPS.
Tunggu sampai `dig +short drive.example.com` mengembalikan IP VPS.

### 0.4 Google OAuth

Di Google Cloud Console → Credentials → OAuth client, tambahkan redirect URI
untuk domain VPS (nilai sama dengan `GOOGLE_OAUTH_REDIRECT_URI` di env).

### 0.5 CATATAN PENTING — CORS allowlist

`apps/worker/src/index.ts` punya `ALLOWED_ORIGINS` (allowlist origin eksplisit).
Karena file itu **tidak boleh diubah otomatis**, tambahkan sendiri domain VPS
kamu (mis. `https://drive.example.com`) ke set tersebut sebelum build/deploy,
lalu commit. Tanpa ini, request dengan header `Origin` dari domain VPS bisa
ditolak CORS. (Fetch same-origin lewat nginx umumnya lolos via
`Sec-Fetch-Site: same-origin`, tapi tetap tambahkan agar aman.)

---

## 1. Siapkan database SQLite (kedua jalur)

Skema ada di `apps/worker/dbcloud.sql` (idempoten — aman dijalankan berulang).

```bash
sudo apt-get install -y sqlite3
mkdir -p /path/ke/data
sqlite3 /path/ke/data/nqdrive.db < apps/worker/dbcloud.sql

# Verifikasi tabel terbentuk:
sqlite3 /path/ke/data/nqdrive.db ".tables"
```

- Jalur A: `/path/ke/data` = `/opt/nqdrive/apps/worker/data`
- Jalur B: `/path/ke/data` = `deploy/docker/data` (di-mount ke `/data` container)

---

## Jalur A — Nginx tanpa Docker

### A.1 Install Node 22 + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
sudo corepack enable && corepack prepare pnpm@9.12.0 --activate
node --version   # v22.x
pnpm --version   # 9.x
```

### A.2 Clone & install

```bash
sudo mkdir -p /opt/nqdrive && sudo chown nqdrive:nqdrive /opt/nqdrive
git clone <repo-kamu> /opt/nqdrive
cd /opt/nqdrive
pnpm install   # better-sqlite3 dikompilasi native di sini
```

### A.3 Siapkan database

```bash
mkdir -p /opt/nqdrive/apps/worker/data
sqlite3 /opt/nqdrive/apps/worker/data/nqdrive.db < /opt/nqdrive/apps/worker/dbcloud.sql
```

### A.4 Environment worker

```bash
sudo mkdir -p /etc/nqdrive
sudo cp /opt/nqdrive/apps/worker/.env.example /etc/nqdrive/worker.env
sudo nano /etc/nqdrive/worker.env
```

Isi (lihat komentar di `.env.example`):

- `DB_PATH=/opt/nqdrive/apps/worker/data/nqdrive.db`
- `PORT=8787`
- `GOOGLE_OAUTH_REDIRECT_URI` dan `WEB_APP_URL` = `https://drive.example.com`
- `JWT_SECRET` → `openssl rand -base64 48`
- `ENCRYPTION_KEY` → `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dari Google Cloud Console

```bash
sudo chmod 600 /etc/nqdrive/worker.env
```

### A.5 Build frontend

`VITE_WORKER_URL` **harus kosong** di VPS (fetch relatif, dirutekan nginx):

```bash
cd /opt/nqdrive
VITE_WORKER_URL="" pnpm build:web
# hasil: /opt/nqdrive/apps/web/dist
```

### A.6 Systemd service worker

```bash
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive-worker.service /etc/systemd/system/
sudo nano /etc/systemd/system/nqdrive-worker.service   # sesuaikan path/user bila perlu
sudo systemctl daemon-reload
sudo systemctl enable --now nqdrive-worker
systemctl status nqdrive-worker
journalctl -u nqdrive-worker -f   # harus muncul "listening on http://0.0.0.0:8787"
```

### A.7 Nginx

```bash
sudo apt-get install -y nginx
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive-proxy.conf /etc/nginx/snippets/
sudo cp /opt/nqdrive/deploy/nginx-standalone/nqdrive.nginx.conf /etc/nginx/sites-available/nqdrive.conf
sudo nano /etc/nginx/sites-available/nqdrive.conf
#   - ganti semua drive.example.com -> domain kamu
#   - root harus /opt/nqdrive/apps/web/dist
sudo ln -s /etc/nginx/sites-available/nqdrive.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### A.8 HTTPS via certbot (jalur A)

Blok `443 ssl` belum bisa jalan sebelum sertifikat ada. Cara paling sederhana:

```bash
sudo apt-get install -y certbot python3-certbot-nginx

# Sementara: comment seluruh blok server 443 di nqdrive.conf, lalu:
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d drive.example.com
# certbot otomatis memasang path sertifikat & renewal timer

# Un-comment blok 443, pastikan path ssl_certificate sesuai output certbot:
sudo nginx -t && sudo systemctl reload nginx

# Tes renewal:
sudo certbot renew --dry-run
```

### A.9 Verifikasi

```bash
curl -s -H "X-App-Client: nqdrive-web" https://drive.example.com/config
# harus: {"success":true,"data":{"brand_color":...,"theme_mode":...}}
```

Buka `https://drive.example.com` → halaman setup admin pertama muncul.

### A.10 Update aplikasi

```bash
cd /opt/nqdrive
git pull
pnpm install
VITE_WORKER_URL="" pnpm build:web
sudo systemctl restart nqdrive-worker
```

---

## Jalur B — Docker Compose

### B.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker nqdrive   # logout-login supaya berlaku
docker compose version
```

### B.2 Clone & siapkan

```bash
git clone <repo-kamu> ~/nqdrive
cd ~/nqdrive/deploy/docker

# Env worker
cp ../../apps/worker/.env.example ./worker.env
nano worker.env
#   DB_PATH & PORT boleh dibiarkan — compose menimpanya
#   (DB_PATH=/data/nqdrive.db, PORT=8787). Isi sisanya seperti jalur A.4.
chmod 600 worker.env

# Database
sudo apt-get install -y sqlite3
mkdir -p data
sqlite3 data/nqdrive.db < ../../apps/worker/dbcloud.sql

# Domain
nano nginx.conf   # ganti semua drive.example.com -> domain kamu
```

### B.3 HTTPS pertama kali (bootstrap sertifikat)

Nginx tidak bisa start sebelum sertifikat ada. Terbitkan dulu dengan certbot
standalone (port 80 masih bebas):

```bash
docker run --rm -p 80:80 \
  -v nqdrive_certbot-etc:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d drive.example.com --agree-tos -m emailkamu@example.com --no-eff-email
```

> Nama volume `nqdrive_certbot-etc` = `<project name>_certbot-etc`;
> project name di compose file ini adalah `nqdrive`.

### B.4 Jalankan semua service

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f worker   # harus "listening on http://0.0.0.0:8787"
```

Renewal selanjutnya otomatis oleh service `certbot` (loop 12 jam, webroot).
Reload nginx sesudah renewal bisa dijadwalkan via cron host:

```bash
(crontab -l; echo "0 4 * * * docker compose -f ~/nqdrive/deploy/docker/docker-compose.yml exec nginx nginx -s reload") | crontab -
```

### B.5 Verifikasi

```bash
curl -s -H "X-App-Client: nqdrive-web" https://drive.example.com/config
```

### B.6 Update aplikasi

```bash
cd ~/nqdrive && git pull
cd deploy/docker && docker compose up -d --build
```

---

## Tes manual LOKAL (sebelum ke VPS)

Dari mesin dev (repo ini):

```bash
# 1. Buat DB kosong dari skema
cd apps/worker
sqlite3 test.db < dbcloud.sql

# 2. Env test
cp .env.example .env
#    edit: DB_PATH=./test.db, APP_ENV=development, isi JWT_SECRET,
#    ENCRYPTION_KEY, GOOGLE_CLIENT_ID/SECRET (nilai test bebas untuk nyala)

# 3. Jalankan server Node
pnpm install         # sekali, dari root repo
pnpm start:node      # dari apps/worker
#    -> "[node-entry] NQDRIVE worker (Node standalone) listening on http://0.0.0.0:8787"

# 4. Bandingkan respons dengan versi Cloudflare
curl -s -H "X-App-Client: nqdrive-web" http://localhost:8787/config
#    harus sama bentuknya: {"success":true,"data":{"brand_color":"","theme_mode":"light"}}
curl -s http://localhost:8787/config
#    tanpa header -> 404 kosong (guard sama seperti di Cloudflare)

# 5. Build kedua image Docker (dari ROOT repo)
docker build -f deploy/docker/worker.Dockerfile -t nqdrive-worker .
docker build -f deploy/docker/web.Dockerfile -t nqdrive-web .
```

---

## Catatan arsitektur

- **Nginx meniru** `apps/web/functions/[[catchall]].ts`: path download
  (`/download/`, `/public/folder/`, segmen-pertama-23-karakter, path
  berekstensi) dicoba ke worker dulu; worker 404 → fallback SPA. `/api/`
  diproxy **semua path** (tanpa whitelist sempit — backend punya
  `/api/upload`, `/api/security`, `/api/audit-logs` yang tidak ada di
  whitelist Pages Function; guard sesungguhnya ada di worker sendiri).
- **Endpoint non-/api** (`/config`, `/captcha`, `/resource/`, `/system/`)
  juga diproxy ke worker karena web app memanggilnya langsung, dan di VPS
  `VITE_WORKER_URL` kosong sehingga semua fetch relatif ke domain yang sama.
- **`proxy_buffering off` + `proxy_request_buffering off`** wajib untuk
  streaming download resumable (Range request) dan upload besar.
- **SQLite WAL**: worker membuka DB dengan `journal_mode=WAL` — hanya SATU
  proses worker yang boleh menulis file `.db` yang sama.
- **Backup**: cukup salin file `.db` (plus `-wal`/`-shm` saat hot) atau
  gunakan `sqlite3 nqdrive.db ".backup backup.db"`.
