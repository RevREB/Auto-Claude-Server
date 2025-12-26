# Setup Validation Checklist

Use this checklist to validate your production-ready setup.

## ✅ Pre-Build Validation

### 1. Check Prerequisites (Host Machine)
```bash
# Should succeed - Docker is required
docker --version
docker-compose --version

# Should succeed - Git is required
git --version

# Should FAIL or SUCCEED - Node.js is NOT required on host!
node --version  # OK if this fails!
npm --version   # OK if this fails!
```

### 2. Verify Directory Structure
```bash
ls -la
# Should see:
# - setup.sh (executable)
# - docker-compose.yml
# - .env or .env.example
# - backend/ (directory)
# - frontend/ (directory)
# - projects/ (directory)
```

### 3. Check Dockerfile Content

**Backend Dockerfile should contain:**
```bash
grep "apt-get install.*nodejs" backend/Dockerfile
# Should find: apt-get install -y nodejs

grep "npm install -g @anthropic-ai/claude-code" backend/Dockerfile
# Should find: RUN npm install -g @anthropic-ai/claude-code

grep "pip install.*requirements.txt" backend/Dockerfile
# Should find: RUN pip install --no-cache-dir -r requirements.txt
```

**Frontend Dockerfile should contain:**
```bash
grep "npm pkg delete" frontend/Dockerfile
# Should find: npm pkg delete dependencies.electron || true

grep "npm install.*vite" frontend/Dockerfile
# Should find: npm install --save-dev vite @vitejs/plugin-react

grep "npm run build" frontend/Dockerfile
# Should find: RUN npm run build
```

### 4. Verify setup.sh Does NOT Install Dependencies Locally
```bash
grep "npm install" setup.sh
# Should ONLY find this in an echo/message, NOT as a command to run!
# Example: echo "npm install -g @anthropic-ai/claude-code" (this is OK)
# Example: npm install (this is BAD!)

grep "pip install" setup.sh
# Should find NOTHING - pip install happens in Dockerfile only
```

## ✅ Build-Time Validation

### 5. Run Setup Script
```bash
./setup.sh
```

**Expected behavior:**
- ✅ Checks for Docker and Git only (NOT Node.js)
- ✅ Clones Auto-Claude to temp directory
- ✅ Copies files to backend/ and frontend/
- ✅ Creates .env file
- ✅ Runs `docker-compose build`
- ✅ Build succeeds without errors

### 6. Verify Backend Build
```bash
docker-compose build backend
```

**Check logs for:**
- ✅ Installing Node.js from nodesource
- ✅ Installing @anthropic-ai/claude-code globally
- ✅ Installing Python packages from requirements.txt
- ✅ No errors

**Verify installed tools:**
```bash
docker-compose run --rm backend which node
# Should output: /usr/bin/node

docker-compose run --rm backend which claude
# Should output: /usr/local/bin/claude

docker-compose run --rm backend node --version
# Should output: v20.x.x

docker-compose run --rm backend claude --version
# Should output: @anthropic-ai/claude-code version x.x.x
```

### 7. Verify Frontend Build
```bash
docker-compose build frontend
```

**Check logs for:**
- ✅ Copying package.json
- ✅ Removing Electron dependencies (npm pkg delete)
- ✅ Installing dependencies (npm install)
- ✅ Installing vite and @vitejs/plugin-react
- ✅ Building with `npm run build`
- ✅ `dist/` directory created
- ✅ Copying to nginx

**Verify build output:**
```bash
# This will fail if build didn't work:
docker-compose run --rm frontend ls /usr/share/nginx/html
# Should output: index.html, assets/, etc.
```

## ✅ Runtime Validation

### 8. Start Services
```bash
docker-compose up -d
```

**Expected behavior:**
- ✅ 3 containers start: backend, frontend, redis
- ✅ All health checks pass

### 9. Verify Service Health
```bash
docker-compose ps
```

**Expected output:**
```
NAME                    STATUS
auto-claude-backend     Up (healthy)
auto-claude-frontend    Up (healthy)
auto-claude-redis       Up
```

### 10. Test Frontend
```bash
curl -I http://localhost:3000
# Should return: HTTP/1.1 200 OK

curl http://localhost:3000
# Should return: HTML content with React app
```

### 11. Test Backend API
```bash
curl http://localhost:8000/health
# Should return: {"status": "healthy"} or similar

curl http://localhost:8000/docs
# Should return: OpenAPI/Swagger docs HTML
```

### 12. Test Backend Has Claude CLI
```bash
docker-compose exec backend claude --version
# Should output: @anthropic-ai/claude-code version x.x.x

docker-compose exec backend which claude
# Should output: /usr/local/bin/claude
```

### 13. View Logs
```bash
docker-compose logs -f
# Should show:
# - Backend: uvicorn server running
# - Frontend: nginx serving on port 80
# - Redis: ready to accept connections
# - NO npm install errors
# - NO missing dependency errors
```

## ✅ Host Machine Validation

### 14. Confirm Host Machine is Clean
```bash
# These directories should NOT exist on host (only in containers):
ls -la frontend/node_modules 2>/dev/null
# Should output: "No such file or directory" ← THIS IS GOOD!

ls -la backend/.venv 2>/dev/null
# Should output: "No such file or directory" ← THIS IS GOOD!

# Only these directories should exist on host:
ls -d frontend/src backend/auto-claude backend/api projects/
# Should output: All exist
```

## 🎯 Success Criteria

**Your setup is production-ready if:**

✅ Only Docker and Git are required on host machine
✅ `setup.sh` does NOT run npm install or pip install
✅ Frontend Dockerfile modifies package.json IN CONTAINER
✅ Frontend Dockerfile installs deps and builds IN CONTAINER
✅ Backend Dockerfile installs Node.js, Claude CLI, and Python deps IN CONTAINER
✅ All containers build successfully
✅ All containers start and pass health checks
✅ Web UI accessible at http://localhost:3000
✅ API accessible at http://localhost:8000
✅ Claude CLI available in backend container
✅ NO node_modules/ directory on host machine

## ❌ Common Issues

### Issue: "Node.js not found" during setup.sh
**Solution**: This is a bug! setup.sh should NOT check for Node.js. Remove the check from setup.sh.

### Issue: npm install runs during setup.sh
**Solution**: This is a bug! setup.sh should NOT run npm install. Remove it from setup.sh.

### Issue: Frontend build fails - "command not found: vite"
**Solution**: Dockerfile needs to install vite. Add `npm install --save-dev vite @vitejs/plugin-react`.

### Issue: Backend can't run claude command
**Solution**: Dockerfile missing `npm install -g @anthropic-ai/claude-code`. Add it.

### Issue: Frontend Dockerfile uses `npm ci`
**Solution**: Change to `npm install` because we modify package.json first.

### Issue: node_modules/ exists on host machine
**Solution**: This is wrong! Delete it and ensure setup.sh doesn't run npm install.

## 📋 Final Checklist

Before shipping to users:

- [ ] Only Docker + Git required on host
- [ ] setup.sh has NO Node.js check
- [ ] setup.sh does NOT run npm install
- [ ] setup.sh does NOT run pip install
- [ ] Frontend Dockerfile modifies package.json using npm pkg delete
- [ ] Frontend Dockerfile runs npm install (NOT npm ci)
- [ ] Frontend Dockerfile installs vite and @vitejs/plugin-react
- [ ] Backend Dockerfile installs Node.js via apt-get
- [ ] Backend Dockerfile installs claude-code via npm
- [ ] Backend Dockerfile installs Python deps via pip
- [ ] docker-compose build succeeds
- [ ] docker-compose up succeeds
- [ ] All health checks pass
- [ ] No node_modules/ on host machine
- [ ] Documentation is clear and accurate
