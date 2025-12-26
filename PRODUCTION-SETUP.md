# Production-Ready Auto-Claude Docker Setup

This is a production-ready Docker package for Auto-Claude. Users only need **Docker** and **Git** installed on their host machine. Everything else (Node.js, npm, Python dependencies, Claude Code CLI) is installed inside containers.

## Prerequisites

**ONLY** these two tools are required on your host machine:
- Docker (with docker-compose)
- Git

❌ **NOT REQUIRED**: Node.js, npm, Python, or any other dependencies

## Quick Start

### 1. Clone this repository
```bash
git clone <this-repo-url>
cd auto-claude-docker
```

### 2. Run the setup script
```bash
chmod +x setup.sh
./setup.sh
```

The setup script will:
1. ✅ Check for Docker and Git (only prerequisites)
2. ✅ Clone the Auto-Claude repository to a temp directory
3. ✅ Copy source files to `backend/` and `frontend/` directories
4. ✅ Create `.env` configuration file
5. ✅ Build Docker containers (all dependencies installed here)
6. ✅ Optionally start the services

### 3. Configure your API token

Edit `.env` and add your Claude Code OAuth token:
```bash
CLAUDE_CODE_OAUTH_TOKEN=your-token-here
```

To get your token:
- If you have Claude CLI installed locally: run `claude setup-token`
- Otherwise, the backend container includes Claude CLI: `docker-compose exec backend claude setup-token`

### 4. Start Auto-Claude

```bash
docker-compose up -d
```

Access the application:
- 🌐 Web UI: http://localhost:3000
- 🔧 API: http://localhost:8000
- 📚 API Docs: http://localhost:8000/docs

## Architecture

### Frontend Container
- **Base Image**: node:20-alpine (build) → nginx:alpine (production)
- **Build Process**:
  1. Copies `package.json`
  2. Removes Electron dependencies via `npm pkg delete`
  3. Updates scripts for Vite
  4. Installs all dependencies (including Vite and React plugin)
  5. Builds React app with `npm run build`
  6. Serves `dist/` via nginx
- **Port**: 3000 → 80 (nginx)

### Backend Container
- **Base Image**: python:3.11-slim
- **Includes**:
  - Node.js 20 (via apt-get from nodesource)
  - Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
  - Python dependencies from `requirements.txt`
  - FastAPI server with uvicorn
- **Port**: 8000

### Redis Container
- **Image**: redis:7-alpine
- **Purpose**: Task queuing and session management
- **Port**: 6379

## Directory Structure

```
auto-claude-docker/
├── setup.sh              # Main setup script (requires only Docker + Git)
├── docker-compose.yml    # Multi-container orchestration
├── .env                  # Environment configuration
├── backend/
│   ├── Dockerfile        # Python + Node.js + Claude CLI
│   ├── requirements.txt  # Python dependencies
│   ├── auto-claude/      # Auto-Claude Python code (copied by setup.sh)
│   └── api/              # FastAPI wrapper
├── frontend/
│   ├── Dockerfile        # React build + nginx
│   ├── nginx.conf        # nginx configuration
│   ├── package.json      # Node.js dependencies (copied by setup.sh)
│   ├── vite.config.ts    # Vite configuration
│   └── src/              # React source code (copied by setup.sh)
└── projects/             # User projects directory
```

## Key Implementation Details

### Frontend Dockerfile
```dockerfile
# Copies only package.json first
COPY package.json ./

# Removes Electron deps IN CONTAINER
RUN npm pkg delete dependencies.electron || true && \
    npm pkg delete devDependencies.electron* || true && \
    npm pkg set scripts.build="vite build"

# Installs ALL dependencies in container
RUN npm install && \
    npm install --save-dev vite @vitejs/plugin-react

# Builds the app
RUN npm run build

# Copies dist/ to nginx
COPY --from=builder /app/dist /usr/share/nginx/html
```

### Backend Dockerfile
```dockerfile
# Installs Node.js via apt-get
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Installs Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Installs Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

### setup.sh
```bash
# Only checks for Docker + Git (NO Node.js check)
if ! command -v git &> /dev/null; then
    echo "❌ Git not found"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found"
    exit 1
fi

# Clones Auto-Claude to temp directory
git clone --depth 1 --branch "$AUTO_CLAUDE_VERSION" "$AUTO_CLAUDE_REPO" "$TEMP_DIR/Auto-Claude"

# Copies files to backend/frontend/
cp -r "$TEMP_DIR/Auto-Claude/auto-claude"/* "$BACKEND_DIR/auto-claude/"
cp -r "$TEMP_DIR/Auto-Claude/auto-claude-ui/src/renderer"/* "$FRONTEND_DIR/src/"
cp "$TEMP_DIR/Auto-Claude/auto-claude-ui/package.json" "$FRONTEND_DIR/"

# Creates .env from template
cp .env.example .env

# Builds containers (this installs everything)
docker-compose build

# Does NOT run npm install locally!
```

## Development

### View logs
```bash
docker-compose logs -f
docker-compose logs -f backend  # Backend only
docker-compose logs -f frontend # Frontend only
```

### Restart services
```bash
docker-compose restart
```

### Stop services
```bash
docker-compose down
```

### Rebuild after code changes
```bash
docker-compose build
docker-compose up -d
```

### Access backend shell
```bash
docker-compose exec backend bash
```

### Access frontend build logs
```bash
docker-compose logs frontend
```

## Environment Variables

Edit `.env` to configure:

```env
# Required: Your Claude Code OAuth token
CLAUDE_CODE_OAUTH_TOKEN=

# Optional: Claude model to use
AUTO_BUILD_MODEL=claude-opus-4-5-20251101

# Optional: Projects directory location
PROJECTS_DIR=./projects

# Optional: API endpoints (for frontend)
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

## Volumes

The setup uses Docker volumes for persistence:
- `auto-claude-data`: Auto-Claude state and configuration
- `redis-data`: Redis data persistence
- `./projects`: User projects (bind mount to host)
- `~/.claude`: Claude Code OAuth tokens (read-only)

## Health Checks

All services include health checks:
- **Backend**: `curl -f http://localhost:8000/health`
- **Frontend**: `wget --spider http://localhost/`
- **Redis**: Redis built-in health check

## Troubleshooting

### "Docker not found"
Install Docker Desktop from https://www.docker.com/products/docker-desktop

### "Git not found"
Install Git from https://git-scm.com/downloads

### Build fails with npm errors
This shouldn't happen since all npm operations are in containers. Check Docker logs:
```bash
docker-compose build --no-cache frontend
```

### Backend can't find Claude CLI
The Claude CLI is installed globally in the container. Verify:
```bash
docker-compose exec backend which claude
docker-compose exec backend claude --version
```

### Frontend shows blank page
Check nginx logs and verify the build succeeded:
```bash
docker-compose logs frontend
docker-compose exec frontend ls -la /usr/share/nginx/html
```

## Production Deployment

This setup is production-ready and can be deployed to any environment with Docker:

1. **Single Server**: Use as-is with `docker-compose`
2. **Kubernetes**: Convert docker-compose.yml to k8s manifests
3. **Cloud Platforms**:
   - AWS: ECS, Fargate, or EC2 with Docker
   - GCP: Cloud Run, GKE, or Compute Engine
   - Azure: Container Instances or AKS

### Security Recommendations

1. Use environment-specific `.env` files
2. Store `CLAUDE_CODE_OAUTH_TOKEN` in secrets manager
3. Enable HTTPS via reverse proxy (nginx, Traefik, Caddy)
4. Restrict network access to backend port (8000)
5. Regularly update base images

## License

Follow Auto-Claude's original license terms.
