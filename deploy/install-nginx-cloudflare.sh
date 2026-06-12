#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-leg-api-postbacks.click}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
SSL_DIR="/etc/nginx/ssl"
CERT="${SSL_DIR}/cloudflare-origin.pem"
KEY="${SSL_DIR}/cloudflare-origin.key"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-nginx-cloudflare.sh"
  exit 1
fi

echo "==> Installing nginx..."
apt-get update
apt-get install -y nginx

mkdir -p "${SSL_DIR}"

if [[ ! -f "${CERT}" || ! -f "${KEY}" ]]; then
  echo ""
  echo "Cloudflare Origin Certificate not found."
  echo "1. Cloudflare dashboard -> SSL/TLS -> Origin Server -> Create Certificate"
  echo "2. Save the certificate to: ${CERT}"
  echo "3. Save the private key to:  ${KEY}"
  echo ""
  echo "Then re-run this script."
  echo "(You can use: sudo nano ${CERT}  and  sudo nano ${KEY})"
  exit 1
fi

chmod 600 "${KEY}"

echo "==> Installing site config for ${DOMAIN}..."
cp "${PROJECT_DIR}/deploy/nginx/${DOMAIN}.cloudflare.conf" "${NGINX_AVAILABLE}"
ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl enable nginx
systemctl reload nginx

echo ""
echo "Done. Now in Cloudflare:"
echo "  - DNS: A-record ${DOMAIN} -> server IP, Proxy ON (orange cloud)"
echo "  - SSL/TLS mode: Full (strict)"
echo "  - In @BotFather: /setdomain -> ${DOMAIN}"
echo ""
echo "Test: curl https://${DOMAIN}/health"
