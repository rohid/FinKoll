#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# generate-cert.sh — create a self-signed TLS certificate for FinKoll
#
# The cert is placed in data/ssl/ which is volume-mounted into the nginx
# container. Run this once on the Pi before the first docker compose up.
#
# Usage:
#   ./scripts/generate-cert.sh                    # uses hostname as CN
#   ./scripts/generate-cert.sh 192.168.1.105      # uses IP as CN + SAN
#   ./scripts/generate-cert.sh finkoll.local      # uses mDNS hostname
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-$(hostname -I | awk '{print $1}')}"
SSL_DIR="$(cd "$(dirname "$0")/.." && pwd)/data/ssl"

mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR"

echo "[cert] Generating self-signed certificate for: $DOMAIN"
echo "[cert] Output directory: $SSL_DIR"

# Build a Subject Alternative Name extension so modern browsers accept the cert
cat > /tmp/finkoll-openssl.cnf <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = $DOMAIN

[v3_req]
subjectAltName = @alt_names
keyUsage       = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
IP.1  = 127.0.0.1
EOF

# Also add IP SAN if the CN looks like an IP address
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "IP.2  = $DOMAIN" >> /tmp/finkoll-openssl.cnf
fi

openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out    "$SSL_DIR/cert.pem" \
  -config /tmp/finkoll-openssl.cnf

chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"
rm -f /tmp/finkoll-openssl.cnf

echo ""
echo "[cert] Done. Files created:"
echo "  $SSL_DIR/cert.pem  (certificate, valid 10 years)"
echo "  $SSL_DIR/key.pem   (private key)"
echo ""
echo "[cert] Next steps:"
echo "  1. Update FRONTEND_URL in .env to https://$DOMAIN"
echo "  2. docker compose up -d --build"
echo "  3. Open https://$DOMAIN in your browser"
echo "     Accept the security warning (self-signed cert) or install the CA"
echo "     on your devices to avoid the warning — see README for mkcert instructions."
