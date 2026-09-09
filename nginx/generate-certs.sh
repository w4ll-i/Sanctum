#!/bin/sh
# Generate a self-signed TLS certificate for local use.
# Run this once before starting Docker: sh nginx/generate-certs.sh

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

# Check for existing certs
if [ -f "$CERT_DIR/cert.pem" ] && [ -f "$CERT_DIR/key.pem" ]; then
  echo "Certificates already exist in $CERT_DIR — skipping."
  echo "Delete them and re-run to regenerate."
  exit 0
fi

echo "Generating self-signed certificate for sanctum.local..."

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=sanctum.local/O=Sanctum/C=FR" \
  -addext "subjectAltName=DNS:sanctum.local,DNS:localhost,IP:127.0.0.1"

echo ""
echo "Done! Certificate valid for 10 years."
echo ""
echo "To trust the certificate on your devices:"
echo "  macOS/iOS : double-click cert.pem → Keychain → trust for SSL"
echo "  Windows   : certmgr.msc → Trusted Root CAs → import cert.pem"
echo "  Android   : Settings → Security → Install certificate"
echo "  Linux     : sudo cp cert.pem /usr/local/share/ca-certificates/sanctum.crt && sudo update-ca-certificates"
