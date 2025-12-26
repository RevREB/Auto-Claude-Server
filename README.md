# Auto-Claude Docker Setup

Run Auto-Claude as a containerized web application - no dependency management required.

## Quick Start

### Prerequisites

- **Docker Desktop** or Docker Engine + Docker Compose
- **Git** (for cloning repositories)
- **Node.js 18+** (for package management)
- **Claude Pro/Max subscription** (for Claude Code access)

### One-Command Setup

```bash
# Extract the package
tar -xzf auto-claude-docker.tar.gz
cd auto-claude-docker

# Run automated setup (clones repos, builds containers, starts services)
./setup.sh
```

That's it! The script will:
1. ✅ Check prerequisites
2. ✅ Clone Auto-Claude v2.7.1 from GitHub
3. ✅ Extract React frontend from Electron wrapper
4. ✅ Copy Python backend code
5. ✅ Set up directory structure
6. ✅ Install dependencies
7. ✅ Build Docker containers
8. ✅ Start all services

### Manual Setup (if you prefer step-by-step)

#### 1. Verify Prerequisites

```bash
./verify.sh  # Optional: check if everything is ready
```

#### 2. Get Your OAuth Token

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Get your OAuth token
claude setup-token
# Copy the token that's displayed
```

#### 3. Run Setup Script

```bash
./setup.sh
```

The script will prompt you to:
- Add your Claude Code OAuth token to `.env`
- Confirm before starting services

#### 4. Access the Application

Open your browser to: **http://localhost:3000**

The backend API is at: **http://localhost:8000**  
API documentation: **http://localhost:8000/docs**

### What the Setup Script Does

```
🔍 Checks prerequisites (Docker, Git, Node.js)
📦 Clones Auto-Claude v2.7.1 from GitHub
🏗️  Extracts React app from Electron wrapper
📋 Copies Python backend code to backend/auto-claude/
🎨 Sets up frontend with Vite configuration
⚙️  Creates .env from template
📦 Installs frontend npm dependencies
🔨 Builds Docker containers
🚀 Starts all services (backend, frontend, redis)
```

### First-Time Configuration

After running `./setup.sh`, configure authentication:

#### Claude OAuth Token (Required)

1. Run `claude setup-token` to get your token
2. Edit `.env` and add the token:
   ```env
   CLAUDE_CODE_OAUTH_TOKEN=your-token-here
   ```
3. Restart if needed: `docker-compose restart`

#### GitHub Authentication (Optional)

For GitHub integration features:

1. Create a Personal Access Token at https://github.com/settings/tokens
   - Required scopes: `repo`, `read:org`, `read:user`

2. Authenticate via API:
   ```bash
   curl -X POST http://localhost:8000/api/github/auth/login \
     -H "Content-Type: application/json" \
     -d '{"token": "your_github_token_here"}'
   ```

3. Verify authentication:
   ```bash
   curl http://localhost:8000/api/github/auth/status
   ```

The GitHub token is stored persistently in the `github-data` volume.

## Project Structure

```
auto-claude-docker/
├── docker-compose.yml          # Container orchestration
├── .env                        # Your configuration
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── api/
│   │   └── main.py            # FastAPI server
│   └── auto-claude/           # Original Python code (copy from repo)
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/                   # React app (extracted from auto-claude-ui)
└── projects/                  # Your projects mount here
```

## Usage

### Add a Project

1. Place your project in `./projects/my-project/`
2. Open http://localhost:3000
3. Click "Add Project" and select `/app/projects/my-project`

### Start a Build

1. Create a task in the Kanban board
2. Describe what you want to build
3. Click "Start Build"
4. Watch real-time progress via WebSocket

### Use Agent Terminals

Open up to 12 Claude Code terminal sessions with task context injection.

## Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild after code changes
docker-compose up -d --build

# Clean everything (including volumes)
docker-compose down -v

# Access backend shell
docker-compose exec backend bash

# Run Python commands directly
docker-compose exec backend python auto-claude/run.py --spec 001
```

## Volume Mounts

| Volume | Purpose |
|--------|---------|
| `./projects` | Your project code |
| `~/.claude` | Claude Code credentials (read-only) |
| `auto-claude-data` | Specs, plans, QA reports |
| `redis-data` | Session and queue persistence |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | From `claude setup-token` |
| `AUTO_BUILD_MODEL` | No | Default: claude-opus-4-5-20251101 |
| `PROJECTS_DIR` | No | Default: ./projects |

## Networking

| Service | Port | Purpose |
|---------|------|---------|
| frontend | 3000 | Web UI (React SPA) |
| backend | 8000 | REST API + WebSockets |
| redis | 6379 | Internal (task queue) |

## API Endpoints

### REST API

- `GET /health` - Health check
- `GET /api/projects` - List projects
- `POST /api/projects` - Add project
- `GET /api/tasks/{spec_id}` - Get task status
- `POST /api/build/start` - Start autonomous build
- `POST /api/build/{spec_id}/stop` - Stop build

### WebSockets

- `ws://localhost:8000/ws/build/{spec_id}` - Real-time build progress
- `ws://localhost:8000/ws/terminal/{session_id}` - Terminal sessions

## Migrating from Electron App

If you're currently using the Electron desktop app:

1. Your projects remain in the same location
2. The `.auto-claude/` directories are compatible
3. Existing specs and tasks carry over automatically
4. Git worktrees work identically

**Key differences:**
- Access via browser instead of desktop app
- Multiple users can access same instance (on network)
- Easier to run on remote servers
- No dependency management on your machine

## Development Mode

```bash
# Run with hot reload
docker-compose -f docker-compose.dev.yml up

# Backend only (for API development)
docker-compose up backend redis

# Frontend only (with local backend)
cd frontend
npm run dev
```

## Data Persistence & Backups

### Volume Architecture

Auto-Claude uses **Docker named volumes** (not bind mounts) for all persistent data. This design ensures compatibility with Kubernetes PersistentVolumeClaims (PVCs) for production deployment.

**Volumes:**
- `projects-data` → User code projects (`/app/projects`)
- `claude-data` → Claude OAuth tokens and profiles (`/root/.claude`)
- `github-data` → GitHub CLI OAuth tokens (`/root/.config/gh`)
- `auto-claude-data` → Application state (`/app/.auto-claude`)
- `redis-data` → Task queues and sessions

### Backup Your Data

```bash
# Create a backup
./scripts/backup.sh

# Backup with automatic cleanup (keeps last 7 days)
CLEANUP_OLD=true ./scripts/backup.sh

# Backups are stored in ./backups/
```

### Restore from Backup

```bash
# List available backups
ls -lh ./backups/

# Restore from a specific backup
./scripts/restore.sh ./backups/auto-claude-backup-TIMESTAMP.tar.gz
```

### Manual Volume Management

```bash
# List all volumes
docker volume ls | grep auto-claude

# Inspect a volume
docker volume inspect auto-claude-docker_projects-data

# View volume contents
docker run --rm -v auto-claude-docker_projects-data:/data alpine ls -la /data
```

For detailed information about volume management, backup strategies, and Kubernetes migration, see [VOLUMES.md](VOLUMES.md).

## Troubleshooting

### Setup Script Issues

#### "git clone failed"
```bash
# Check internet connection
ping github.com

# Try with SSH instead (if you have SSH keys set up)
# Edit setup.sh and change the clone URL to:
# git@github.com:AndyMik90/Auto-Claude.git

# Or clone manually first:
git clone --depth 1 --branch v2.7.1 https://github.com/AndyMik90/Auto-Claude.git temp/Auto-Claude
```

#### "npm install failed"
```bash
# Clear npm cache
npm cache clean --force

# Use npm ci instead of install
cd frontend && npm ci

# Or skip and install later:
# Comment out the npm install section in setup.sh
```

#### "Docker build failed"
```bash
# Check Docker daemon is running
docker info

# Check disk space
df -h

# Clean up Docker
docker system prune -a

# Try building manually
docker-compose build --no-cache
```

### OAuth Token Issues

```bash
# Verify token is set
docker-compose exec backend env | grep CLAUDE_CODE

# Test Claude Code CLI works
docker-compose exec backend claude --version

# Re-configure token
claude setup-token
# Edit .env with new token
docker-compose restart backend
```

### Build Failures

```bash
# Check backend logs
docker-compose logs backend

# Check if Python process is running
docker-compose exec backend ps aux | grep python

# Try running manually
docker-compose exec backend python auto-claude/run.py --help
```

### WebSocket Connection Issues

- Check browser console for errors
- Verify backend is accessible: `curl http://localhost:8000/health`
- Check nginx proxy config for WebSocket headers

### Projects Not Showing

```bash
# Verify volume mount
docker-compose exec backend ls -la /app/projects

# Check permissions
docker-compose exec backend chown -R root:root /app/projects

# Create a test project
mkdir -p projects/test-project
echo "# Test" > projects/test-project/README.md
```

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Or use different ports
# Edit docker-compose.yml:
# ports:
#   - "3001:80"  # Instead of 3000:80
```

### Container Won't Start

```bash
# Check container status
docker-compose ps

# View all logs
docker-compose logs

# Start in foreground to see errors
docker-compose up

# Reset everything
docker-compose down -v
docker system prune -a
./setup.sh
```

## Testing

Auto-Claude Docker includes a comprehensive test suite covering E2E, API, and component tests.

### Quick Start

```bash
# Run all tests
./tests/run-all-tests.sh

# Run E2E tests only
./tests/run-e2e-tests.sh

# Run backend API tests only
./tests/run-backend-tests.sh
```

### Test Suites

- **E2E Tests (Playwright)**: Full user workflow testing through browser
- **Backend API Tests (pytest)**: REST API endpoint testing
- **Frontend Component Tests (Vitest)**: React component unit tests
- **Security Tests**: XSS, SQL injection, path traversal prevention

### Test Coverage

- Authentication flows (Claude, GitHub)
- Project and task management
- Git operations
- Real-time WebSocket updates
- API error handling
- Input validation

### CI/CD Integration

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Manual workflow dispatch

For detailed testing documentation, see **[TESTING.md](TESTING.md)**.

## Production Deployment

For production deployment:

1. Use environment-specific `.env` files
2. Set up SSL/TLS (add nginx reverse proxy or use Caddy)
3. Configure proper CORS origins in `backend/api/main.py`
4. Use production-grade Redis (not Alpine)
5. Add authentication/authorization
6. Set up log aggregation
7. Configure auto-scaling if needed

### Example with Caddy (SSL)

```Caddyfile
auto-claude.example.com {
    reverse_proxy localhost:3000
}

api.auto-claude.example.com {
    reverse_proxy localhost:8000
}
```

## License

Same as Auto-Claude: AGPL-3.0
