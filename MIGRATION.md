# Migration Guide: Electron → Docker Web App

## Overview

This guide walks through converting Auto-Claude from an Electron desktop app to a containerized web application.

## Architecture Changes

### Before (Electron)
```
┌─────────────────────────────────┐
│   Electron Desktop App          │
│                                  │
│  ┌────────────┐   ┌──────────┐  │
│  │  Renderer  │──▶│   Main   │  │
│  │  (React)   │   │ Process  │  │
│  └────────────┘   └──────────┘  │
│                        │         │
│                        ▼         │
│                   ┌──────────┐  │
│                   │  Python  │  │
│                   │  Backend │  │
│                   └──────────┘  │
└─────────────────────────────────┘
```

### After (Docker)
```
┌──────────────────┐     ┌──────────────────┐
│   Browser        │────▶│   Nginx          │
│                  │     │   (Frontend)     │
└──────────────────┘     │   - React SPA    │
                         └──────────────────┘
                                 │
                                 ▼
                         ┌──────────────────┐
                         │   FastAPI        │
                         │   (Backend)      │
                         │   - REST API     │
                         │   - WebSockets   │
                         │   - Python code  │
                         └──────────────────┘
                                 │
                                 ▼
                         ┌──────────────────┐
                         │   Redis          │
                         │   (Sessions)     │
                         └──────────────────┘
```

## Key Conversion Steps

### 1. Backend: Electron Main Process → FastAPI

**Old (Electron IPC):**
```typescript
// main.ts
ipcMain.handle('start-build', async (event, data) => {
  const result = await pythonBridge.startBuild(data);
  return result;
});
```

**New (FastAPI):**
```python
# api/main.py
@app.post("/api/build/start")
async def start_build(build_req: BuildRequest):
    result = await start_build_process(build_req)
    return result
```

### 2. Frontend: Electron Renderer → React SPA

**Old (IPC calls):**
```typescript
// Old Electron code
const result = await window.electron.ipcRenderer.invoke('start-build', data);
```

**New (HTTP/WebSocket):**
```typescript
// New web API
import { api } from '@/api/client';
const result = await api.startBuild(data);
```

### 3. Real-time Updates: IPC Events → WebSockets

**Old:**
```typescript
window.electron.ipcRenderer.on('build-progress', (event, data) => {
  updateProgress(data);
});
```

**New:**
```typescript
const monitor = new BuildProgressMonitor(specId);
monitor.start(
  (output) => updateProgress(output),
  (exitCode) => handleComplete(exitCode)
);
```

## File-by-File Migration

### Phase 1: Setup Docker Infrastructure

1. **Create `docker-compose.yml`**
   - Define services: backend, frontend, redis
   - Set up volume mounts
   - Configure networking

2. **Create `backend/Dockerfile`**
   - Base image: python:3.11-slim
   - Install Node.js for Claude Code
   - Install Python dependencies
   - Copy auto-claude code

3. **Create `frontend/Dockerfile`**
   - Build stage: node:20-alpine
   - Production stage: nginx:alpine
   - Copy React build output

### Phase 2: Backend API Layer

1. **Create `backend/api/main.py`** ✅ (already provided above)
   - FastAPI app setup
   - CORS configuration
   - REST endpoints
   - WebSocket handlers

2. **Create `backend/requirements.txt`** ✅
   - FastAPI, uvicorn
   - WebSockets
   - Redis client
   - Original auto-claude deps

3. **Copy existing Python code**
   ```bash
   cp -r auto-claude/ docker-setup/backend/auto-claude/
   ```

### Phase 3: Frontend Extraction

1. **Extract React app from Electron**
   ```bash
   # Copy renderer process code
   cp -r auto-claude-ui/src/renderer/* frontend/src/
   ```

2. **Update `package.json`**
   ```bash
   # Remove Electron dependencies
   npm pkg delete dependencies.electron
   npm pkg delete devDependencies.electron-builder
   
   # Add standalone build tools
   npm install vite @vitejs/plugin-react
   ```

3. **Create `vite.config.ts`**
   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     server: {
       port: 3000,
       proxy: {
         '/api': 'http://localhost:8000',
         '/ws': {
           target: 'ws://localhost:8000',
           ws: true,
         },
       },
     },
   });
   ```

4. **Create API client** ✅ (provided above as `client.ts`)

5. **Update components to use new API**
   ```typescript
   // Find all instances of:
   window.electron.ipcRenderer.invoke(...)
   window.electron.ipcRenderer.send(...)
   
   // Replace with:
   await api.method(...)
   ```

### Phase 4: Component Updates

**Example: Kanban Board Component**

```typescript
// Before (Electron)
const KanbanBoard = () => {
  const startBuild = async (taskId: string) => {
    await window.electron.ipcRenderer.invoke('start-build', { taskId });
  };

  useEffect(() => {
    window.electron.ipcRenderer.on('build-progress', (e, data) => {
      setProgress(data);
    });
  }, []);
};

// After (Web)
import { api, BuildProgressMonitor } from '@/api/client';

const KanbanBoard = () => {
  const startBuild = async (taskId: string) => {
    await api.startBuild({ taskId });
    
    const monitor = new BuildProgressMonitor(taskId);
    monitor.start(
      (output) => setProgress(output),
      (exitCode) => handleComplete(exitCode)
    );
  };
};
```

## Configuration Migration

### Environment Variables

**Old (Electron):**
```
.env in auto-claude-ui/
NODE_ENV=production
```

**New (Docker):**
```
.env in project root
CLAUDE_CODE_OAUTH_TOKEN=xxx
PROJECTS_DIR=./projects
VITE_API_URL=http://localhost:8000
```

### Data Persistence

**Old:**
- Specs stored in: `your-project/.auto-claude/`
- No session management needed

**New:**
- Specs stored in: Docker volume `auto-claude-data`
- Redis for session management
- Projects mounted from host: `./projects/`

## Testing the Migration

### 1. Test Backend API

```bash
# Start backend only
docker-compose up backend redis

# Test health endpoint
curl http://localhost:8000/health

# Test projects endpoint
curl http://localhost:8000/api/projects

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c ws://localhost:8000/ws/build/001
```

### 2. Test Frontend

```bash
# Start all services
docker-compose up

# Open browser
open http://localhost:3000

# Check console for API calls
# Verify WebSocket connections
```

### 3. End-to-End Test

1. Add a project via UI
2. Create a task
3. Start a build
4. Monitor real-time progress
5. Review QA results
6. Merge to main

## Rollout Strategy

### Option A: Big Bang Migration
1. Build Docker setup completely
2. Test thoroughly
3. Switch all users at once

### Option B: Gradual Migration
1. Run Docker version alongside Electron
2. Migrate users gradually
3. Deprecate Electron after validation

### Option C: Hybrid (Recommended)
1. Keep Electron for desktop users
2. Offer Docker for:
   - Remote access
   - Team collaboration
   - CI/CD integration

## Common Issues & Solutions

### Issue: WebSocket Connection Refused

**Solution:**
```nginx
# In nginx.conf, ensure WebSocket headers:
location /ws {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Issue: CORS Errors

**Solution:**
```python
# In api/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Specific origin
    allow_credentials=True,
)
```

### Issue: Claude Code Token Not Found

**Solution:**
```bash
# Mount Claude config as read-only
volumes:
  - ~/.claude:/root/.claude:ro
```

### Issue: Projects Not Accessible

**Solution:**
```yaml
# Ensure correct volume mount
volumes:
  - ./projects:/app/projects  # Relative to docker-compose.yml
```

## Performance Considerations

### Electron App
- ✅ Instant startup (native)
- ✅ No network latency
- ❌ Heavy resource usage (Chromium + Node + Python)
- ❌ Single user only

### Docker Web App
- ✅ Lightweight (shared resources)
- ✅ Multi-user capable
- ✅ Remote access
- ❌ Network latency
- ❌ ~2-3s initial load

## Security Considerations

### Electron
- ✅ Local-only access
- ❌ No authentication
- ❌ Updates require download

### Docker
- ✅ Can add authentication
- ✅ SSL/TLS for remote access
- ✅ Auto-updates via registry
- ❌ Need to secure API endpoints

## Cost Comparison

### Running Electron App
- User's machine resources
- No server costs
- Each user installs separately

### Running Docker
- Server costs (if hosted)
- Shared resources across users
- One deployment for all users

## Next Steps After Migration

1. **Add Authentication**
   - OAuth2 / JWT tokens
   - User management
   - Project permissions

2. **Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Error tracking (Sentry)

3. **CI/CD Integration**
   - GitHub Actions
   - Automated builds
   - Deploy to cloud

4. **Scaling**
   - Kubernetes deployment
   - Load balancing
   - Redis clustering

## Conclusion

The Docker migration transforms Auto-Claude from a single-user desktop app into a scalable web application while maintaining all core functionality.

**Benefits:**
- No dependency management for users
- Multi-user capable
- Easier deployment
- Remote access
- Better resource utilization

**Trade-offs:**
- Requires Docker knowledge
- Network dependency
- Slightly more complex setup

Choose this migration if you want easier deployment, remote access, or multi-user support.
