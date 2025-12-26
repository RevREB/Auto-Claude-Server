# CI/CD Proposal: Local Quality Gate

## Overview

A lightweight, container-based CI/CD system that acts as a **local quality gate** before code is pushed to GitHub for release builds. Uses Woodpecker CI with an agent-based topology for scalable, parallel builds.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Local Environment                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Gitea /    │    │  Woodpecker  │    │  Woodpecker  │       │
│  │  Git Server  │───▶│    Server    │───▶│    Agents    │       │
│  │  (webhooks)  │    │   (coord)    │    │   (1..N)     │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         │                   ▼                   ▼                │
│         │            ┌──────────────┐    ┌──────────────┐       │
│         │            │   Postgres   │    │   Registry   │       │
│         │            │  (CI state)  │    │   (local)    │       │
│         └───────────▶└──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (after local CI passes)
                              ▼
                    ┌──────────────────┐
                    │     GitHub       │
                    │  (release CI)    │
                    └──────────────────┘
```

## Pipeline Topology

### Trigger Points

| Event | Pipeline | Purpose |
|-------|----------|---------|
| Push to `feature/*` | `test` | Fast feedback on feature work |
| Push to `subtask/*` | `test` | Validate subtask before merge |
| PR to `dev` | `test` + `build` | Full validation before merge |
| PR to `release/*` | `test` + `build` + `integration` | Release candidate validation |
| Push to `dev` | `test` + `build` | Nightly/integration builds |
| Tag `v*` | `test` + `build` + `publish` | Prepare for GitHub release |

### Pipeline Stages

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Lint   │───▶│  Test   │───▶│  Build  │───▶│  Scan   │───▶│ Publish │
│         │    │         │    │         │    │         │    │         │
│ - ESLint│    │ - Unit  │    │ - Docker│    │ - Trivy │    │ - Local │
│ - Black │    │ - Integ │    │ - Assets│    │ - SAST  │    │   Reg   │
│ - Types │    │ - E2E   │    │         │    │         │    │         │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     └──────────────┴──────────────┴──────────────┴──────────────┘
                              Parallel where possible
```

## Docker Compose Configuration

```yaml
# docker-compose.ci.yml
version: '3.8'

services:
  # ============================================
  # Woodpecker CI Server
  # ============================================
  woodpecker-server:
    image: woodpeckerci/woodpecker-server:latest
    container_name: woodpecker-server
    ports:
      - "8000:8000"
    volumes:
      - woodpecker-server-data:/var/lib/woodpecker
    environment:
      # Server configuration
      - WOODPECKER_OPEN=true
      - WOODPECKER_HOST=${WOODPECKER_HOST:-http://localhost:8000}
      - WOODPECKER_ADMIN=${WOODPECKER_ADMIN:-admin}

      # Agent secret (shared with agents)
      - WOODPECKER_AGENT_SECRET=${WOODPECKER_AGENT_SECRET}

      # Git forge integration (Gitea example)
      - WOODPECKER_GITEA=true
      - WOODPECKER_GITEA_URL=${GITEA_URL:-http://gitea:3000}
      - WOODPECKER_GITEA_CLIENT=${GITEA_CLIENT_ID}
      - WOODPECKER_GITEA_SECRET=${GITEA_CLIENT_SECRET}

      # Database
      - WOODPECKER_DATABASE_DRIVER=postgres
      - WOODPECKER_DATABASE_DATASOURCE=postgres://woodpecker:woodpecker@woodpecker-db:5432/woodpecker?sslmode=disable
    depends_on:
      - woodpecker-db
    networks:
      - ci-network
    restart: unless-stopped

  # ============================================
  # Woodpecker CI Agent(s)
  # ============================================
  woodpecker-agent:
    image: woodpeckerci/woodpecker-agent:latest
    container_name: woodpecker-agent
    command: agent
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WOODPECKER_SERVER=woodpecker-server:9000
      - WOODPECKER_AGENT_SECRET=${WOODPECKER_AGENT_SECRET}
      - WOODPECKER_MAX_WORKFLOWS=4
      - WOODPECKER_HEALTHCHECK=true
    depends_on:
      - woodpecker-server
    networks:
      - ci-network
    restart: unless-stopped
    # Scale agents: docker-compose up -d --scale woodpecker-agent=3

  # ============================================
  # CI Database
  # ============================================
  woodpecker-db:
    image: postgres:15-alpine
    container_name: woodpecker-db
    volumes:
      - woodpecker-db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=woodpecker
      - POSTGRES_PASSWORD=woodpecker
      - POSTGRES_DB=woodpecker
    networks:
      - ci-network
    restart: unless-stopped

  # ============================================
  # Local Container Registry
  # ============================================
  registry:
    image: registry:2
    container_name: local-registry
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry
    environment:
      - REGISTRY_STORAGE_DELETE_ENABLED=true
    networks:
      - ci-network
    restart: unless-stopped

  # ============================================
  # Registry UI (optional)
  # ============================================
  registry-ui:
    image: joxit/docker-registry-ui:latest
    container_name: registry-ui
    ports:
      - "5001:80"
    environment:
      - REGISTRY_TITLE=Local CI Registry
      - REGISTRY_URL=http://registry:5000
      - SINGLE_REGISTRY=true
    depends_on:
      - registry
    networks:
      - ci-network
    restart: unless-stopped

volumes:
  woodpecker-server-data:
  woodpecker-db-data:
  registry-data:

networks:
  ci-network:
    driver: bridge
```

## Pipeline as Code

### Base Pipeline Template

```yaml
# .woodpecker.yml
when:
  - event: [push, pull_request, tag]

variables:
  - &node_image 'node:20-alpine'
  - &python_image 'python:3.11-slim'
  - &docker_image 'docker:24-dind'

# ============================================
# Lint Stage
# ============================================
steps:
  lint-frontend:
    image: *node_image
    group: lint
    commands:
      - cd frontend
      - npm ci --quiet
      - npm run lint
      - npm run typecheck
    when:
      path:
        include: ['frontend/**']

  lint-backend:
    image: *python_image
    group: lint
    commands:
      - cd backend
      - pip install -q ruff mypy
      - ruff check .
      - mypy --ignore-missing-imports .
    when:
      path:
        include: ['backend/**']

# ============================================
# Test Stage
# ============================================
  test-frontend:
    image: *node_image
    group: test
    commands:
      - cd frontend
      - npm ci --quiet
      - npm run test:unit -- --coverage
    when:
      path:
        include: ['frontend/**']
    depends_on: [lint-frontend]

  test-backend:
    image: *python_image
    group: test
    commands:
      - cd backend
      - pip install -q -r requirements.txt -r requirements-dev.txt
      - pytest --cov=. --cov-report=xml
    when:
      path:
        include: ['backend/**']
    depends_on: [lint-backend]

# ============================================
# Build Stage (PRs and main branches)
# ============================================
  build-images:
    image: *docker_image
    group: build
    commands:
      - docker build -t ${CI_REPO}:${CI_COMMIT_SHA:0:8} .
      - docker tag ${CI_REPO}:${CI_COMMIT_SHA:0:8} localhost:5000/${CI_REPO}:${CI_COMMIT_SHA:0:8}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    when:
      - event: pull_request
      - event: push
        branch: [dev, release/*, main]
    depends_on: [test-frontend, test-backend]

# ============================================
# Security Scan
# ============================================
  security-scan:
    image: aquasec/trivy:latest
    group: scan
    commands:
      - trivy image --exit-code 1 --severity HIGH,CRITICAL localhost:5000/${CI_REPO}:${CI_COMMIT_SHA:0:8}
    when:
      - event: pull_request
      - event: push
        branch: [release/*, main]
    depends_on: [build-images]

# ============================================
# Publish to Local Registry
# ============================================
  publish-local:
    image: *docker_image
    commands:
      - docker push localhost:5000/${CI_REPO}:${CI_COMMIT_SHA:0:8}
      - |
        if [ "${CI_COMMIT_TAG}" != "" ]; then
          docker tag localhost:5000/${CI_REPO}:${CI_COMMIT_SHA:0:8} localhost:5000/${CI_REPO}:${CI_COMMIT_TAG}
          docker push localhost:5000/${CI_REPO}:${CI_COMMIT_TAG}
        fi
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    when:
      - event: push
        branch: [dev, release/*, main]
      - event: tag
    depends_on: [security-scan]

# ============================================
# Notify (optional)
# ============================================
  notify-success:
    image: curlimages/curl:latest
    commands:
      - |
        curl -X POST "${WEBHOOK_URL}" \
          -H "Content-Type: application/json" \
          -d '{"event":"ci_complete","repo":"${CI_REPO}","commit":"${CI_COMMIT_SHA}","status":"success"}'
    when:
      status: success
    depends_on: [publish-local]

  notify-failure:
    image: curlimages/curl:latest
    commands:
      - |
        curl -X POST "${WEBHOOK_URL}" \
          -H "Content-Type: application/json" \
          -d '{"event":"ci_failed","repo":"${CI_REPO}","commit":"${CI_COMMIT_SHA}","status":"failure"}'
    when:
      status: failure
```

### Matrix Builds for Multi-Version Testing

```yaml
# .woodpecker/matrix-test.yml
when:
  - event: pull_request
    branch: [dev, main]

matrix:
  NODE_VERSION:
    - 18
    - 20
    - 22

steps:
  test-node-versions:
    image: node:${NODE_VERSION}-alpine
    commands:
      - node --version
      - cd frontend
      - npm ci --quiet
      - npm run test:unit
```

### Reusable Pipeline Fragments

```yaml
# .woodpecker/includes/docker-build.yml
steps:
  build:
    image: docker:24-dind
    commands:
      - docker build -t ${IMAGE_NAME}:${IMAGE_TAG} ${BUILD_CONTEXT:-.}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Integration with Branching Model

### Branch-Specific Behaviors

| Branch Pattern | CI Behavior |
|----------------|-------------|
| `feature/*` | Lint + Unit Tests only (fast feedback) |
| `subtask/*` | Lint + Unit Tests only (fast feedback) |
| `dev` | Full pipeline + Nightly integration |
| `release/*` | Full pipeline + Security scan + Integration tests |
| `main` | Full pipeline + Security scan + Tag for GitHub |
| `hotfix/*` | Full pipeline + Priority queue |

### Pipeline Configuration by Branch

```yaml
# .woodpecker.yml - Branch-aware configuration
when:
  branch:
    exclude: [main]  # Main only builds on PR merge

steps:
  # Fast path for feature branches
  quick-test:
    image: node:20-alpine
    commands:
      - npm ci --quiet
      - npm run test:unit
    when:
      branch: [feature/*, subtask/*]
      event: push

  # Full path for release branches
  full-test:
    image: node:20-alpine
    commands:
      - npm ci
      - npm run lint
      - npm run typecheck
      - npm run test:unit
      - npm run test:integration
    when:
      branch: [dev, release/*]
      event: [push, pull_request]
```

## Integration with Sprint Workflow

### Sprint CI Events

When a Sprint transitions states, trigger appropriate CI:

```yaml
# Sprint lifecycle CI triggers
Sprint State Changes:
  Planning → Active:
    - Create release branch
    - Trigger baseline build
    - Run dependency audit

  Active → Review:
    - Full integration test suite
    - Security scan
    - Performance benchmarks
    - Generate changelog draft

  Review → Complete:
    - Final build + tag
    - Push to local registry
    - Notify GitHub for release build
```

### Auto-claude Integration

The AI agent can:
1. **Check CI status** before merging
2. **Retry failed builds** with fixes
3. **Block merges** on CI failure
4. **Auto-fix** lint issues and re-push

```typescript
// Example: AI checks CI before merge
interface CIStatus {
  pipeline: string;
  status: 'pending' | 'running' | 'success' | 'failure';
  stages: {
    name: string;
    status: string;
    duration?: number;
    logs?: string;
  }[];
}

async function waitForCI(branch: string): Promise<CIStatus> {
  // Poll Woodpecker API for pipeline status
  const status = await woodpeckerClient.getPipelineStatus(branch);

  if (status.status === 'failure') {
    // AI can attempt to fix and retry
    const failedStage = status.stages.find(s => s.status === 'failure');
    if (failedStage?.name === 'lint') {
      await autoFixLint(branch);
      return waitForCI(branch);  // Retry after fix
    }
  }

  return status;
}
```

## Environment Variables

```bash
# .env.ci
# Woodpecker Configuration
WOODPECKER_HOST=http://localhost:8000
WOODPECKER_AGENT_SECRET=<generate-secure-secret>
WOODPECKER_ADMIN=admin

# Git Forge (Gitea)
GITEA_URL=http://gitea:3000
GITEA_CLIENT_ID=<oauth-client-id>
GITEA_CLIENT_SECRET=<oauth-client-secret>

# Notifications
WEBHOOK_URL=http://auto-claude-backend:3001/api/webhooks/ci

# Registry
REGISTRY_URL=localhost:5000
```

## Scaling Agents

```bash
# Start with 3 build agents
docker-compose -f docker-compose.ci.yml up -d --scale woodpecker-agent=3

# Check agent status
docker-compose -f docker-compose.ci.yml ps woodpecker-agent

# Scale up during sprint crunch
docker-compose -f docker-compose.ci.yml up -d --scale woodpecker-agent=5
```

## Local Development Workflow

```
Developer Workflow:

  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
  │  Code   │───▶│  Push   │───▶│ Local   │───▶│ GitHub  │
  │         │    │         │    │   CI    │    │   CI    │
  └─────────┘    └─────────┘    └─────────┘    └─────────┘
       │              │              │              │
       │              │              │              │
       ▼              ▼              ▼              ▼
    Coder IDE    Git commit    Woodpecker    Actions/
    (dev env)    (local)       (quality      Release
                               gate)          builds
```

### Pre-Push Hook (Optional)

```bash
#!/bin/bash
# .git/hooks/pre-push

# Run local CI check before pushing
echo "Running local CI validation..."

# Quick lint check
npm run lint || exit 1

# Quick test
npm run test:unit || exit 1

echo "Local checks passed, pushing..."
```

## Monitoring & Observability

### Woodpecker Metrics

Woodpecker exposes Prometheus metrics at `/metrics`:

```yaml
# Add to docker-compose.ci.yml for monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    networks:
      - ci-network
```

### Build Notifications

Integrate with the main app via webhooks:

```typescript
// backend/src/routes/webhooks/ci.ts
router.post('/ci', async (req, res) => {
  const { event, repo, commit, status, pipeline } = req.body;

  // Update task/sprint status based on CI result
  if (event === 'ci_complete' && status === 'success') {
    await notifyTaskReady(commit);
  } else if (event === 'ci_failed') {
    await notifyTaskBlocked(commit, pipeline);
  }

  // Broadcast to connected clients
  wsServer.broadcast(`ci.${repo}`, { event, status, commit });

  res.sendStatus(200);
});
```

## Migration Path

### Phase 1: Basic Setup
1. Add `docker-compose.ci.yml` to project
2. Configure Gitea OAuth (or GitHub App for direct integration)
3. Create basic `.woodpecker.yml` with lint + test
4. Test with a feature branch

### Phase 2: Full Pipeline
1. Add build stages
2. Configure local registry
3. Add security scanning
4. Set up notifications to main app

### Phase 3: Sprint Integration
1. Add CI status to Sprint dashboard
2. Implement AI-aware CI checks
3. Auto-fix capabilities for lint failures
4. Block merges on CI failure

### Phase 4: Optimization
1. Add caching (npm, pip, docker layers)
2. Matrix builds for version testing
3. Scale agents based on queue depth
4. Add performance benchmarks

## Comparison: Local CI vs GitHub Actions

| Aspect | Local CI (Woodpecker) | GitHub Actions |
|--------|----------------------|----------------|
| Purpose | Quality gate, fast feedback | Release builds, deployments |
| Trigger | Every push, local PRs | PR to main, releases |
| Speed | Fast (local network) | Slower (cloud) |
| Cost | Free (self-hosted) | Minutes-based |
| Secrets | Local only | Production secrets |
| Artifacts | Local registry | GitHub Packages / DockerHub |

## Security Considerations

1. **Agent isolation**: Agents run with Docker socket access - use rootless Docker if needed
2. **Secrets management**: Use Woodpecker's built-in secrets, never commit to repo
3. **Network**: CI network isolated from production
4. **Registry**: Local registry for internal images only
5. **Scanning**: Trivy scans catch vulnerabilities before push to GitHub

## Summary

This CI/CD setup provides:
- **Fast feedback** on every commit
- **Quality gate** before code reaches GitHub
- **Scalable** agent-based architecture
- **Pipeline as code** for versioned, reviewable CI config
- **Integration** with Sprint and Branching workflows
- **AI-aware** hooks for auto-fix capabilities
