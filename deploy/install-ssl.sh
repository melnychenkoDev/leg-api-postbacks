#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-leg-api-postbacks.click}"
EMAIL="${1:-}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-ssl.sh your@email.com"
  exit 1
fi

if [[ -z "${EMAIL}" ]]; then
  echo "Usage: sudo bash deploy/install-ssl.sh your@email.com"
  exit 1
fi

echo "==> Obtaining SSL certificate for ${DOMAIN}..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

echo ""
echo "SSL installed. Site: https://${DOMAIN}"
echo "  Admin:    https://${DOMAIN}/"
echo "  Postback: https://${DOMAIN}/api/postback?type=REG&trader_id=123"
