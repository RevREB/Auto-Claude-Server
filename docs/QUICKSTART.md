# Auto-Claude Docker - Quick Start Guide

## TL;DR - Get Running in 5 Minutes

```bash
# 1. Extract and enter directory
tar -xzf auto-claude-docker.tar.gz
cd auto-claude-docker

# 2. Verify prerequisites
./verify.sh

# 3. Run automated setup
./setup.sh

# 4. Open in browser
open http://localhost:3000
```

## What Happens During Setup

### Step 1: Prerequisites Check ✓
- Verifies Docker, Git, Node.js are installed
- Checks Docker daemon is running

### Step 2: Repository Clone 📦
- Automatically clones `AndyMik90/Auto-Claude` v2.7.1 from GitHub
- Downloads ~50MB of source code

### Step 3: Code Extraction 🏗️
**Backend:**
- Copies `auto-claude/` Python code → `backend/auto-claude/`
- Sets up FastAPI wrapper

**Frontend:**
- Extracts React app from `auto-claude-ui/src/renderer/` 
- Removes Electron dependencies
- Configures Vite for standalone web app

### Step 4: Configuration ⚙️
- Creates `.env` from template
- Prompts for Claude Code OAuth token
- Configures environment variables

### Step 5: Dependency Installation 📦
- Runs `npm install` in frontend directory
- Adds Vite and React dependencies
- ~150MB of node_modules

### Step 6: Docker Build 🔨
- Builds backend image (~800MB)
  - Python 3.11 base
  - Node.js 20 for Claude Code CLI
  - All Python dependencies
- Builds frontend image (~50MB)
  - Node.js build stage
  - Nginx production stage

### Step 7: Start Services 🚀
- Backend API (port 8000)
- Frontend web app (port 3000)
- Redis (port 6379)

**Total Setup Time:** 5-10 minutes (depends on internet speed)

## Directory Structure After Setup

```
auto-claude-docker/
├── .env                          # Your configuration
├── docker-compose.yml            # Container orchestration
├── verify.sh                     # Prerequisites checker
├── setup.sh                      # Automated setup script
├── README.md                     # Full documentation
├── MIGRATION.md                  # Migration guide
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── api/
│   │   └── main.py              # FastAPI server (REST + WebSocket)
│   └── auto-claude/             # Cloned from GitHub during setup
│       ├── run.py
│       ├── spec_runner.py
│       ├── prompts/
│       └── ...
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json             # Modified for web (Electron removed)
│   ├── vite.config.ts           # Generated during setup
│   ├── index.html               # Generated during setup
│   ├── node_modules/            # Installed during setup
│   └── src/                     # Extracted from Electron renderer
│       ├── api/
│       │   └── client.ts        # API client (replaces Electron IPC)
│       ├── components/
│       ├── shared/
│       └── ...
│
├── projects/                     # Your projects go here
│   └── my-project/              # Example
│       ├── src/
│       └── .auto-claude/        # Auto-generated during builds
│
└── temp/                         # Temporary (deleted after setup)
    └── Auto-Claude/             # Cloned repo (removed after extraction)
```

## What Gets Created

### Files Generated During Setup
1. `frontend/vite.config.ts` - Vite configuration for React
2. `frontend/index.html` - HTML entry point
3. `.env` - Your environment configuration (from .env.example)
4. `frontend/package.json` - Modified to remove Electron deps

### Files Copied from GitHub
1. `backend/auto-claude/*` - All Python backend code
2. `frontend/src/*` - React components and UI code
3. `frontend/src/shared/*` - Shared utilities and types

### Files You Created (in this package)
1. `backend/api/main.py` - FastAPI wrapper
2. `backend/Dockerfile` - Backend container definition
3. `frontend/Dockerfile` - Frontend container definition
4. `frontend/nginx.conf` - Nginx web server config
5. `frontend/src/api/client.ts` - API client
6. `docker-compose.yml` - Service orchestration

## First Use

### 1. Add Your First Project

```bash
# Option A: Copy existing project
cp -r ~/my-existing-project ./projects/

# Option B: Create new project
mkdir -p ./projects/my-new-app
cd ./projects/my-new-app
git init
echo "# My App" > README.md
```

### 2. Access Web UI

Open http://localhost:3000

### 3. Add Project in UI

1. Click "Add Project"
2. Select `/app/projects/my-new-app` (or your project path)
3. Give it a name

### 4. Create Your First Task

1. Click "New Task" in Kanban board
2. Describe what you want to build:
   ```
   Add a user authentication system with JWT tokens
   ```
3. Click "Create Spec"
4. Wait for AI to create detailed specification

### 5. Start Autonomous Build

1. Review the generated spec
2. Click "Start Build"
3. Watch real-time progress in the UI
4. AI will:
   - Write code
   - Run tests
   - Fix issues
   - Create QA report

### 6. Review and Merge

1. Review QA results
2. Test in the worktree: `cd projects/my-app/.worktrees/auto-claude/`
3. Merge to main when satisfied

## Daily Usage

```bash
# Start Auto-Claude
docker-compose up -d

# Stop Auto-Claude
docker-compose down

# View logs
docker-compose logs -f

# Restart everything
docker-compose restart

# Update to latest Auto-Claude
git pull  # In the cloned Auto-Claude repo
./setup.sh  # Re-run setup to get new code
```

## Key Differences from Electron App

| Aspect | Electron App | Docker Web App |
|--------|--------------|----------------|
| **Access** | Desktop only | Browser anywhere |
| **Install** | Download installer | `./setup.sh` |
| **Dependencies** | Manual install | Containerized |
| **Updates** | Download new version | `docker-compose pull` |
| **Multi-user** | No | Yes (same server) |
| **Resources** | ~300MB RAM/user | Shared resources |
| **Offline** | Works | Needs server |

## Tips & Best Practices

### Performance
- **First run is slow** - Docker image builds take 5-10 min
- **Subsequent starts are fast** - ~10 seconds
- **Use SSD for projects/** - Much faster git operations

### Storage
- Backend image: ~800MB
- Frontend image: ~50MB
- node_modules: ~150MB
- Total: ~1GB disk space

### Security
- **Don't expose port 8000 publicly** - Use nginx reverse proxy with SSL
- **Keep OAuth token secure** - Never commit .env file
- **Projects in ./projects/** - Mounted into containers, keep them backed up

### Workflows

**Development:**
```bash
# Frontend changes (with hot reload)
cd frontend
npm run dev  # Access at http://localhost:5173

# Backend changes (with auto-reload)
docker-compose up backend  # Uvicorn auto-reloads
```

**Production:**
```bash
# Use production builds
docker-compose -f docker-compose.prod.yml up -d

# Set up SSL with Caddy or nginx
# Configure proper CORS origins
# Use environment-specific .env files
```

## Getting Help

1. **Check logs:** `docker-compose logs -f backend`
2. **Run verify:** `./verify.sh`
3. **Check API health:** `curl http://localhost:8000/health`
4. **Join Discord:** [Auto-Claude Community](https://discord.gg/KCXaPBr4Dj)

## Common First-Time Questions

**Q: Do I need to install Python or Node.js on my machine?**  
A: No! Everything runs in Docker containers. You only need Docker, Git, and Node.js for the initial setup script.

**Q: Can I use my existing Auto-Claude projects?**  
A: Yes! Just copy them to `./projects/` and they'll work identically.

**Q: Where is my data stored?**  
A: Projects are in `./projects/` on your host machine. Specs and build data are in Docker volume `auto-claude-data`.

**Q: Can multiple people use the same instance?**  
A: Yes! Anyone on your network can access http://your-ip:3000. Add authentication for security.

**Q: How do I update Auto-Claude?**  
A: The setup script clones v2.7.1. To update, change `AUTO_CLAUDE_VERSION` in setup.sh and re-run it.

**Q: What if I want to use the Electron app instead?**  
A: Both can coexist! The Docker version is just another way to run Auto-Claude.

## Next Steps

1. ✅ Complete setup with `./setup.sh`
2. ✅ Add your first project
3. ✅ Create a simple task to test
4. ✅ Explore the Kanban board features
5. ✅ Try the agent terminals (up to 12 concurrent Claude Code sessions)
6. ✅ Review the MIGRATION.md for advanced features

---

**Ready to 10x your development velocity?** Run `./setup.sh` now!
