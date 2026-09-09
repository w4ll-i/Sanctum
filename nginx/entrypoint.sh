#!/bin/sh
set -e

mkdir -p /etc/nginx/certs

if [ ! -f /etc/nginx/certs/cert.pem ]; then
  echo "[entrypoint] Generating self-signed certificate..."
  openssl req -x509 -nodes -days 3650 \
    -newkey rsa:2048 \
    -keyout /etc/nginx/certs/key.pem \
    -out    /etc/nginx/certs/cert.pem \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  echo "[entrypoint] Certificate generated."
fi

exec nginx -g "daemon off;"
