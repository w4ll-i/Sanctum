<div align="center">

# Sanctum

<p align="center">
  <img src="logo.png" alt="Sanctum Logo" width="120">
</p>

**Self-hosted, zero-knowledge password manager**

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

Sanctum stores **only encrypted blobs**. Your master password and vault keys never leave your device.

</div>

---

## Features

- **End-to-end encryption** — AES-256-GCM with keys derived client-side via Argon2id + HKDF
- **TOTP / 2FA** — Built-in authenticator with QR code setup
- **Breach detection** — HIBP k-anonymity check (only first 5 chars of SHA-1 hash sent)
- **Offline mode** — Service Worker + IndexedDB cache; works without internet after first load
- **Password generator** — Accessible from the sidebar at any time, configurable charset and strength indicator
- **Import** — Import credentials from other managers
- **Auto-lock** — Configurable idle timeout (1 min to never)
- **Clipboard guard** — Copied passwords auto-cleared after 30 seconds
- **Keyboard shortcuts** — Full keyboard navigation
- **Audit log** — All authentication events recorded server-side
- **Rate limiting** — 10 auth attempts / 15 min per IP, account lockout after 5 failures
- **First-run setup wizard** — Web UI guides configuration on first launch
- **HTTPS auto-configured** — Self-signed certificate generated automatically at container startup
- **JWT secrets auto-generated** — No manual secret generation needed; persisted across restarts

## Security Model

```
Master Password + Salt
        │
        ▼
   Argon2id KDF           (64 MiB · 3 iterations · 4 threads — client-side)
        │
        ▼
   Master Key (32 bytes)  ← never leaves the device
        │
   ┌────┴────┐
   ▼         ▼
HKDF        HKDF
"vault"     "auth"
   │         │
   ▼         ▼
Vault Key  Auth Key Hex ──► BCrypt (rounds=14) stored in DB
   │
   ▼
AES-256-GCM ──► encrypted blobs stored on server
```

| Layer | Implementation |
|---|---|
| KDF | Argon2id — 64 MiB, 3 iterations, 4 threads |
| Vault encryption | AES-256-GCM (authenticated) |
| Key derivation | HKDF-SHA256 |
| Server-side hashing | BCrypt rounds=14 (~1 s/hash, 4× harder than rounds=12) |
| Access tokens | JWT HS256 — 15 min expiry |
| Refresh tokens | Rotated on each use, SHA-256 hashed in DB |
| Transport | Nginx TLS termination (HTTPS auto-configured) |
| Headers | Helmet (CSP, HSTS, X-Frame-Options…) |

**What the server never sees:** master password, vault key, symmetric encryption key, any plaintext credentials.

## Stack

| | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Framer Motion |
| Crypto (client) | hash-wasm (Argon2id), Web Crypto API (AES-GCM, HKDF) |
| Backend | Node.js 22+, Express, SQLite (native), Helmet, Zod |
| Infrastructure | Docker, Nginx |

## Quick Start

```bash
git clone https://github.com/w4ll-i/sanctum
cd sanctum
docker compose up -d
```

Access at **`https://localhost`** — the setup wizard will guide you through the rest.

> **Note:** Don't use the port links in Docker Desktop — they open HTTP instead of HTTPS.
> Always type `https://localhost` directly in your browser.

On first launch, accept the self-signed certificate warning, then:
1. **Name** — give your vault an instance name
2. **Account** — create your first user account

The TLS certificate and JWT secrets are generated automatically at container startup and persist across restarts via Docker volumes.

## Configuration

All fields are optional — JWT secrets are auto-generated if left blank.

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | auto-generated | 64-byte hex secret for access tokens |
| `JWT_REFRESH_SECRET` | auto-generated | 64-byte hex secret for refresh tokens |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `ALLOWED_ORIGINS` | `http://localhost https://localhost` | Space-separated CORS origins |
| `LOCKOUT_ATTEMPTS` | `5` | Failed login attempts before account lockout |
| `LOCKOUT_DURATION_MS` | `900000` | Lockout duration in ms (default: 15 min) |

> For Docker usage, all variables are set via `docker-compose.yml` — `.env` at the root is the only file needed.

## TLS Certificate

Generated automatically on first container start, stored in a Docker volume and reused across restarts.

To avoid the browser warning, import the certificate into your system's trusted root store:

```bash
docker compose cp nginx:/etc/nginx/certs/cert.pem ./cert.pem
```

| OS | How |
|---|---|
| Windows | `certmgr.msc` → Trusted Root CAs → Import `cert.pem` |
| macOS | Double-click `cert.pem` → Keychain → mark as trusted for SSL |
| Linux | `sudo cp cert.pem /usr/local/share/ca-certificates/sanctum.crt && sudo update-ca-certificates` |

## Resetting

To wipe all data and start fresh:

```bash
docker compose down -v
docker compose up -d
```

## Project Structure

```
sanctum/
├── backend/
│   └── src/
│       ├── config/         SQLite setup (users, vault, sessions, settings)
│       ├── middleware/      Auth, rate limiting, security headers, CORS
│       ├── routes/          auth.js · vault.js · totp.js · health.js · setup.js
│       └── utils/           Crypto helpers, JWT secret auto-generation
├── frontend/
│   └── src/
│       ├── crypto/          Client-side AES-256-GCM + Argon2id
│       ├── services/        HIBP breach detection
│       ├── stores/          Zustand state (auth, vault, setup)
│       ├── pages/           Login · Register · Vault · Unlock · Setup
│       └── components/      UI — vault items, TOTP setup, import, generator, sidebar
├── nginx/
│   ├── nginx.conf           Reverse proxy + TLS config (HTTP→HTTPS redirect)
│   ├── Dockerfile           Adds openssl; runs entrypoint for cert generation
│   └── entrypoint.sh        Auto-generates self-signed cert on first boot
├── Dockerfile               Multi-stage production build
└── docker-compose.yml       Nginx + Sanctum services, named volumes
```

## License

© 2026 Wall-E — All rights reserved.

Source code is public for **viewing and evaluation only**. Copying, using, or redistributing this code in any form is not permitted. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Sanctum</strong> — Built for security 🔐
</p>
