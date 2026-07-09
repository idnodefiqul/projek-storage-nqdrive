# ============================================================================
# NQDRIVE worker — image Node standalone (VPS).
# Build DARI ROOT REPO (butuh workspace pnpm penuh):
#   docker build -f deploy/docker/worker.Dockerfile -t nqdrive-worker .
# ============================================================================

FROM node:22-slim

# Toolchain untuk kompilasi native better-sqlite3
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Manifest workspace dulu supaya layer install ke-cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/storage/package.json packages/storage/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --filter @nqdrive/worker... --frozen-lockfile

# Source code
COPY packages/types packages/types
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/storage packages/storage
COPY apps/worker apps/worker

WORKDIR /app/apps/worker

# File .db dipersist lewat volume (lihat docker-compose.yml), path via DB_PATH
EXPOSE 8787

CMD ["pnpm", "start:node"]
