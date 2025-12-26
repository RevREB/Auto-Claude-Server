# Auto-Claude Docker Conversion Package
## Complete Setup for Converting Electron App to Docker Web App

**Version:** 1.0  
**Target:** Auto-Claude v2.7.1  
**Created:** December 2024

---

## 📦 Package Contents

This package contains everything needed to run Auto-Claude as a containerized web application instead of an Electron desktop app.

### Core Files

| File | Purpose |
|------|---------|
| `setup.sh` | **Automated setup script** - One command to rule them all |
| `verify.sh` | Prerequisites checker - Verify before setup |
| `docker-compose.yml` | Container orchestration configuration |
| `.env.example` | Environment variables template |

### Documentation

| File | Description |
|------|-------------|
| `README.md` | Complete documentation with all commands |
| `QUICKSTART.md` | 5-minute quick start guide (read this first!) |
| `MIGRATION.md` | Detailed migration guide from Electron to Docker |

### Backend Setup

```
backend/
├── Dockerfile              # Python 3.11 + Node.js 20 + Claude Code CLI
├── requirements.txt        # FastAPI + dependencies
└── api/
    └── main.py            # FastAPI server (REST + WebSocket APIs)
```

### Frontend Setup

```
frontend/
├── Dockerfile             # Node build stage + Nginx production stage
├── nginx.conf            # Web server configuration with API proxy
└── src/api/
    └── client.ts         # API client (replaces Electron IPC)
```

---

## 🚀 Quick Start (30 seconds)

```bash
# Extract
tar -xzf auto-claude-docker.tar.gz
cd auto-claude-docker

# Setup (automatic - clones repos, builds containers, starts services)
./setup.sh

# Done! Open browser
open http://localhost:3000
```

---

## 📋 What the Setup Script Does

### Automatic Repository Cloning
✅ Clones `AndyMik90/Auto-Claude` v2.7.1 from GitHub  
✅ Extracts Python backend to `backend/auto-claude/`  
✅ Extracts React frontend from Electron wrapper  
✅ Removes Electron dependencies  
✅ Configures for standalone web deployment  

### Automatic Configuration
✅ Creates `.env` from template  
✅ Prompts for Claude Code OAuth token  
✅ Generates Vite config for React  
✅ Creates standalone index.html  
✅ Installs npm dependencies  

### Automatic Docker Setup
✅ Builds backend container (~800MB)  
✅ Builds frontend container (~50MB)  
✅ Starts all services (backend, frontend, redis)  
✅ Verifies health checks  

**Total time:** 5-10 minutes (first run)

---

## 📚 Documentation Guide

**New to Auto-Claude Docker?**  
→ Read `QUICKSTART.md` first (5-minute guide)

**Want full documentation?**  
→ See `README.md` (complete reference)

**Migrating from Electron app?**  
→ Read `MIGRATION.md` (detailed conversion guide)

**Having issues?**  
→ Run `./verify.sh` to check prerequisites  
→ Check troubleshooting section in `README.md`

---

## 🎯 Key Features

### Zero Dependency Management
- Everything runs in Docker containers
- No need to install Python, Node.js, or Claude Code manually
- Works on Mac, Windows, Linux

### Automatic Code Extraction
- Clones official Auto-Claude repository
- Extracts React app from Electron wrapper
- Removes desktop-specific dependencies
- Configures for web deployment

### One-Command Setup
- Single `./setup.sh` script
- Handles cloning, building, configuration
- Interactive prompts for OAuth token
- Automatic container startup

### Web-Based UI
- Access from any browser
- Multi-user capable
- Remote access (with proper security)
- Same features as desktop app

---

## 🔧 Prerequisites

Before running `./setup.sh`, you need:

- ✅ **Docker Desktop** (or Docker Engine + Docker Compose)
- ✅ **Git** (for cloning repositories)
- ✅ **Node.js 18+** (for package management)
- ✅ **Claude Pro/Max** subscription (for Claude Code)

Check with: `./verify.sh`

---

## 📖 Architecture

### Before (Electron Desktop App)
```
Electron → Main Process → Python Backend
   ↓
React UI (Renderer)
```

### After (Docker Web App)
```
Browser → Nginx → React SPA
              ↓
          FastAPI → Python Backend
              ↓
          Redis (sessions)
```

### Key Changes
| Component | Old | New |
|-----------|-----|-----|
| UI Access | Desktop app | Web browser |
| Communication | Electron IPC | REST + WebSocket |
| Deployment | Install .dmg/.exe | `docker-compose up` |
| Updates | Download installer | `docker-compose pull` |
| Multi-user | No | Yes |

---

## 🗂️ Directory Structure After Setup

```
auto-claude-docker/
├── .env                       # Your config (created during setup)
├── docker-compose.yml         # Orchestration
├── setup.sh                   # Run this to set up everything
├── verify.sh                  # Check prerequisites
│
├── backend/
│   ├── auto-claude/          # ← Cloned from GitHub automatically
│   │   ├── run.py
│   │   ├── spec_runner.py
│   │   └── prompts/
│   └── api/
│       └── main.py           # FastAPI wrapper
│
├── frontend/
│   ├── src/                  # ← Extracted from Electron automatically
│   │   ├── components/
│   │   └── api/
│   │       └── client.ts     # Replaces Electron IPC
│   ├── vite.config.ts        # ← Generated during setup
│   └── index.html            # ← Generated during setup
│
└── projects/                  # Your projects go here
    └── my-project/
        └── .auto-claude/      # Build artifacts
```

---

## 💡 Common Use Cases

### Solo Developer
```bash
./setup.sh
# Access at http://localhost:3000
# All features work identically to desktop app
```

### Team Environment
```bash
# Run on a server
./setup.sh

# Team members access at http://server-ip:3000
# Add nginx reverse proxy with SSL for security
# Consider adding authentication
```

### CI/CD Integration
```bash
# Run as part of your pipeline
docker-compose up -d backend
# Use API endpoints to trigger builds
curl -X POST http://localhost:8000/api/build/start
```

### Remote Development
```bash
# Deploy to cloud (AWS, GCP, Azure)
# Access from anywhere
# Same workflow as local
```

---

## 🔐 Security Considerations

### Included
✅ Docker container isolation  
✅ CORS configuration  
✅ Environment variable management  
✅ Read-only volume mounts where applicable  

### You Should Add (for production)
⚠️ SSL/TLS termination (use Caddy or nginx reverse proxy)  
⚠️ Authentication/authorization  
⚠️ Rate limiting  
⚠️ Network security groups  
⚠️ Secrets management (Vault, AWS Secrets Manager)  

---

## 📊 Resource Usage

### Disk Space
- Backend image: ~800MB
- Frontend image: ~50MB
- node_modules: ~150MB
- **Total:** ~1GB

### Memory (running)
- Backend: ~200MB
- Frontend: ~10MB (nginx)
- Redis: ~50MB
- **Total:** ~260MB

### First Build Time
- Backend: 3-5 minutes
- Frontend: 2-3 minutes
- **Total:** 5-10 minutes (one-time)

### Startup Time (after first build)
- ~10 seconds (all services)

---

## 🆘 Getting Help

### If Setup Fails

1. **Check prerequisites:** `./verify.sh`
2. **Check logs:** `docker-compose logs -f`
3. **Common issues:** See `README.md` troubleshooting section

### If App Won't Start

1. **Check containers:** `docker-compose ps`
2. **View all logs:** `docker-compose logs`
3. **Reset everything:** `docker-compose down -v && ./setup.sh`

### Resources

- **Discord:** [Auto-Claude Community](https://discord.gg/KCXaPBr4Dj)
- **GitHub:** [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)
- **API Docs:** http://localhost:8000/docs (when running)

---

## 🎓 Learning Path

1. **Start Here:** `QUICKSTART.md` (5 minutes)
2. **Run Setup:** `./setup.sh` (10 minutes)
3. **First Project:** Add a project via UI (5 minutes)
4. **First Build:** Create and run a task (varies)
5. **Deep Dive:** `MIGRATION.md` for architecture details
6. **Production:** `README.md` production deployment section

---

## 🔄 Updates

### Updating Auto-Claude Version

```bash
# Edit setup.sh
# Change: AUTO_CLAUDE_VERSION="v2.7.1"
# To:     AUTO_CLAUDE_VERSION="v2.8.0"

# Re-run setup
./setup.sh

# Rebuild containers
docker-compose up -d --build
```

### Updating This Package

This package is version-locked to Auto-Claude v2.7.1. For newer versions:
- Update `AUTO_CLAUDE_VERSION` in `setup.sh`
- May need to update API endpoints in `backend/api/main.py`
- May need to update frontend client in `frontend/src/api/client.ts`

---

## 📝 Version History

**v1.0** (Current)
- Automated repository cloning
- Complete Electron → Docker conversion
- FastAPI backend wrapper
- React SPA frontend extraction
- WebSocket real-time updates
- One-command setup script
- Comprehensive documentation

---

## 📄 License

Same as Auto-Claude: **AGPL-3.0**

This conversion package inherits Auto-Claude's license. You must:
- Keep source open if you distribute
- Attribute the original project
- Share modifications under AGPL-3.0

For commercial/closed-source use, contact Auto-Claude maintainers.

---

## 🙏 Credits

**Original Project:** [Auto-Claude by AndyMik90](https://github.com/AndyMik90/Auto-Claude)  
**Conversion Package:** Created for easy Docker deployment  
**Powered By:** Anthropic Claude Code

---

## ✨ Ready to Get Started?

```bash
# Extract package
tar -xzf auto-claude-docker.tar.gz
cd auto-claude-docker

# Read quick start (optional but recommended)
cat QUICKSTART.md

# Run automated setup
./setup.sh

# Open in browser
open http://localhost:3000
```

**Questions?** Check `README.md` or join the Discord community!

---

**Package Version:** 1.0  
**Last Updated:** December 2024  
**Compatible With:** Auto-Claude v2.7.1
