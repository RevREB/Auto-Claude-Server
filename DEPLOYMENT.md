# Production Deployment Guide

This guide covers deploying Auto-Claude in a production environment with HTTPS, proper routing, and optional authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  :80/:443 │
                    │   nginx   │  ← SSL termination
                    │ (frontend)│  ← Static files (React)
                    └─────┬─────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │   /api/*  │   │   /ws/*   │   │/api/term/ │
    │   REST    │   │ WebSocket │   │  ws/*     │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │               │               │
          └───────────────┼───────────────┘
                          │
                    ┌─────▼─────┐
                    │   :8000   │
                    │  backend  │  ← FastAPI + Python agents
                    │ (internal)│
                    └───────────┘
```

## Quick Start

### 1. Generate SSL Certificates

#### Option A: Tailscale (Recommended for Tailnet)

Real Let's Encrypt certs for your Tailscale hostname - trusted by all browsers:

```bash
tailscale cert your-machine.your-tailnet.ts.net
mv your-machine.*.crt certs/cert.pem
mv your-machine.*.key certs/key.pem
```

#### Option B: Caddy (Auto HTTPS - Easiest)

Use Caddy instead of nginx for automatic certificate management:

```bash
# Build frontend first
docker-compose --profile build up frontend-builder

# Start with Caddy (auto-manages HTTPS)
HOSTNAME=your-host.ts.net docker-compose -f docker-compose.caddy.yml up -d
```

Caddy automatically:
- Gets Let's Encrypt certs for public hostnames
- Uses internal CA for private hostnames (install root cert in browser)
- Renews certs before expiry

#### Option C: step-ca (Internal ACME CA)

Full internal PKI for private networks:

```bash
# Start internal CA
docker-compose -f step-ca/docker-compose.step-ca.yml up -d

# Get root CA cert (install in browser/OS)
docker exec step-ca step ca root > root-ca.crt

# Use with certbot or configure Caddy to use this ACME endpoint
```

#### Option D: Let's Encrypt (Public deployments)

```bash
certbot certonly --standalone -d your-hostname.example.com
cp /etc/letsencrypt/live/your-hostname.example.com/fullchain.pem certs/cert.pem
cp /etc/letsencrypt/live/your-hostname.example.com/privkey.pem certs/key.pem
```

#### Option E: Self-signed (Development only)

```bash
cd certs
./generate-self-signed.sh your-hostname.example.com
```

⚠️ Browsers will show security warnings with self-signed certs.

### 2. Configure Environment

```bash
cp .env.prod.example .env.prod
```

Edit `.env.prod`:
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional
AUTO_BUILD_MODEL=claude-sonnet-4-20250514
CODE_SERVER_PASSWORD=your-secure-password
SESSION_SECRET=$(openssl rand -hex 32)
```

### 3. Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Verify

```bash
# Check all containers are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

## File Structure

```
auto-claude-docker/
├── docker-compose.yml          # Development (ports exposed)
├── docker-compose.prod.yml     # Production (nginx only exposed)
├── .env.prod.example           # Production env template
├── certs/                      # SSL certificates
│   ├── cert.pem
│   ├── key.pem
│   └── generate-self-signed.sh
├── frontend/
│   ├── Dockerfile              # Development build
│   ├── Dockerfile.prod         # Production build
│   ├── nginx.conf              # Development nginx config
│   └── nginx.prod.conf         # Production nginx config (SSL)
└── backend/
    └── Dockerfile              # Backend (same for dev/prod)
```

## URL Routing

| Path | Destination | Timeout |
|------|-------------|---------|
| `http://*` | Redirect to `https://*` | - |
| `https://*/` | nginx → React SPA | - |
| `https://*/api/*` | proxy → backend:8000 | 5 min |
| `https://*/ws/*` | WebSocket → backend:8000 | 24 hours |
| `https://*/api/terminal/ws/*` | Terminal WS → backend:8000 | 24 hours |
| `https://*/health` | nginx returns 200 OK | - |

## Frontend URL Auto-Detection

The frontend automatically detects the correct API/WebSocket URLs:

| Environment | API URL | WebSocket URL |
|-------------|---------|---------------|
| Production (non-localhost) | `window.location.origin` | `wss://current-host` |
| Development (localhost) | `http://localhost:8000` | `ws://localhost:8000` |
| Env override | `VITE_API_URL` | `VITE_WS_URL` |

**Implementation:** `frontend/src/lib/url-utils.ts`

```typescript
// Auto-detects based on window.location
export function getApiUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.location.hostname !== 'localhost') return '';  // relative URLs
  return 'http://localhost:8000';
}

export function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.hostname !== 'localhost') {
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:8000';
}
```

## Security Considerations

### Exposed Ports

| Mode | Port 80 | Port 443 | Port 8000 | Port 8080 | Port 6379 |
|------|---------|----------|-----------|-----------|-----------|
| Development | - | - | Backend | Code Server | Redis |
| Production | nginx (redirect) | nginx (SSL) | Internal only | Internal only | Internal only |

### Security Headers (nginx.prod.conf)

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### SSL Configuration

- TLS 1.2 and 1.3 only
- Modern cipher suites
- Session caching enabled

## Adding Authentication (TSIDP)

To add Tailscale-based authentication, you'll need:

1. A running TSIDP instance on your Tailnet
2. Backend OAuth middleware (FastAPI)
3. Frontend auth provider (React)

See `docs/AUTH.md` for detailed instructions (future).

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs frontend
docker-compose -f docker-compose.prod.yml logs backend

# Verify certs exist
ls -la certs/
```

### SSL certificate errors
```bash
# Verify cert is valid
openssl x509 -in certs/cert.pem -text -noout

# Check cert matches key
openssl x509 -noout -modulus -in certs/cert.pem | md5
openssl rsa -noout -modulus -in certs/key.pem | md5
# (should match)
```

### WebSocket connection fails
```bash
# Check nginx config syntax
docker exec auto-claude-frontend nginx -t

# Check backend is accessible from nginx
docker exec auto-claude-frontend curl -s http://backend:8000/health
```

### Frontend shows blank page
```bash
# Check static files exist
docker exec auto-claude-frontend ls -la /usr/share/nginx/html/

# Check nginx is serving
curl -I https://localhost/
```

## Scaling

For high availability, consider:

1. **Load balancer** in front of nginx
2. **Redis Cluster** for session/queue management
3. **Persistent volumes** for projects and Claude data
4. **Multiple backend replicas** (stateless)

## Backup

Important data to backup:

| Volume | Contains |
|--------|----------|
| `projects-data` | User project files |
| `claude-data` | Claude OAuth tokens |
| `github-data` | GitHub CLI tokens |
| `auto-claude-data` | Task state, specs |

```bash
# Backup example
docker run --rm -v auto-claude-docker_claude-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/claude-data-backup.tar.gz -C /data .
```
