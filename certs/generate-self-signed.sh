#!/bin/bash
# Generate self-signed certificates for development/testing
# For production, use Let's Encrypt or your CA

DOMAIN="${1:-localhost}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},IP:127.0.0.1"

echo "Generated cert.pem and key.pem for ${DOMAIN}"
echo "For Tailscale, you can use 'tailscale cert' to get real certs"
