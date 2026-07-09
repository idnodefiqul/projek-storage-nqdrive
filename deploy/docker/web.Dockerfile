# ============================================================================
# NQDRIVE web — build Vite lalu serve static via nginx:alpine.
# Build DARI ROOT REPO:
#   docker build -f deploy/docker/web.Dockerfile -t nqdrive-web .
#
# PENTING: VITE_WORKER_URL sengaja default KOSONG — di VPS semua fetch API
# dari browser relatif ke domain yang sama dan dirutekan nginx ke worker
# (beda dengan Cloudflare Pages yang fetch langsung ke domain Worker terpisah).
# ============================================================================

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

RUN pnpm install --filter @nqdrive/web... --frozen-lockfile

COPY packages/types packages/types
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/ui packages/ui
COPY apps/web apps/web

ARG VITE_WORKER_URL=""
ENV VITE_WORKER_URL=${VITE_WORKER_URL}

RUN pnpm --filter @nqdrive/web build

# ── Stage 2: serve ──────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# SPA fallback sederhana — routing download/api ditangani container nginx
# reverse-proxy di depannya (deploy/docker/nginx.conf)
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, max-age=31536000, immutable";\n\
        try_files $uri =404;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
