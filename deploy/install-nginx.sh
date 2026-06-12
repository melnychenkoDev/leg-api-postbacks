#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-leg-api-postbacks.click}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-nginx.sh"
  exit 1
fi

echo "==> Installing nginx and certbot..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Installing site config for ${DOMAIN}..."
cp "${PROJECT_DIR}/deploy/nginx/${DOMAIN}.conf" "${NGINX_AVAILABLE}"
ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

# Disable default site if it conflicts
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl enable nginx
systemctl reload nginx

echo ""
echo "Nginx installed. Next steps:"
echo "  1. Point DNS A-record ${DOMAIN} -> your server IP"
echo "  2. Run SSL: sudo bash deploy/install-ssl.sh your@email.com"
echo "  3. In @BotFather: /setdomain -> ${DOMAIN}"
