# ── Build frontend ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
# npm install instead of npm ci (no lockfile required)
RUN npm install --prefer-offline

COPY frontend/ .
RUN npm run build

# ── Production image ────────────────────────────────────────────
# Uses Node 22 built-in sqlite (node:sqlite) — zero native compilation,
# works on any architecture (x64, arm64, armv7).
FROM node:22-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app/backend

COPY backend/package*.json ./
# No native modules to compile — node:sqlite is built into Node 22
RUN npm install --omit=dev --prefer-offline

COPY backend/src ./src

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Data directory
RUN mkdir -p /app/backend/data && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# --experimental-sqlite activates the built-in node:sqlite module (Node 22)
CMD ["node", "--experimental-sqlite", "src/index.js"]
