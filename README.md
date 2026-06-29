# NQDRIVE

Platform cloud storage pribadi yang menggabungkan banyak akun Google Drive menjadi satu
virtual storage, didukung oleh Cloudflare Workers, Pages, dan D1.

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Shadcn UI, TanStack Router,
TanStack Query, TanStack Table, Zod, Lucide Icons

**Backend:** Cloudflare Workers, Hono, TypeScript, Cloudflare D1

**Auth:** JWT (admin lokal) + Google OAuth 2.0 (khusus koneksi akun Drive)

## Struktur Monorepo

Lihat [`PROJECT.md`](./PROJECT.md) untuk detail arsitektur lengkap.

```
apps/web      → Dashboard React (Cloudflare Pages)
apps/worker   → REST API & storage orchestration (Cloudflare Workers)
packages/     → types, shared, api, storage, ui
```

## Prasyarat

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Akun Cloudflare (untuk Workers, Pages, D1)
- Project Google Cloud dengan Google Drive API + OAuth 2.0 client credentials

## Instalasi

```bash
pnpm install
```

## Konfigurasi Environment (Worker)

```bash
cd apps/worker
cp .dev.vars.example .dev.vars
# isi JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ENCRYPTION_KEY
```

## Development

```bash
# Jalankan worker (terminal 1)
pnpm dev:worker

# Jalankan web app (terminal 2)
pnpm dev:web
```

Web app berjalan di `http://localhost:5173`, worker di `http://localhost:8787`
(request `/api/*` dari web otomatis di-proxy ke worker).

Saat pertama kali dibuka, NQDRIVE otomatis mengarahkan ke halaman **Setup** untuk membuat
akun admin (hanya bisa dilakukan sekali). Setelah itu, gunakan halaman **Login** untuk masuk
ke dashboard.

## Database (Cloudflare D1)

```bash
# Migrasi lokal
pnpm db:migrate:local

# Migrasi production
pnpm db:migrate:remote
```

### Seed data (opsional, development saja)

```bash
cd apps/worker
wrangler d1 execute nqdrive-db --local --file=./migrations/seed.sql
```

## Deploy

```bash
pnpm deploy:worker
pnpm deploy:web
```

## Status Pengembangan

Lihat tabel status tahap pengembangan di [`PROJECT.md`](./PROJECT.md#status-pengembangan).

## Lisensi

Private — proyek pribadi, tidak untuk distribusi publik.
