# CI/CD Specification: Local Quality Gate

## 1. Overview

Local container-based CI/CD using Woodpecker CI as a quality gate before GitHub release builds.

**Goals:**
- Test every commit and merge request locally
- Fast feedback loop for developers
- Scalable agent-based build topology
- Pipeline-as-code model
- Integration with Sprint and Branching workflows

## 2. System Components

### 2.1 Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `woodpecker-server` | `woodpeckerci/woodpecker-server` | 8000 | CI coordinator, UI, API |
| `woodpecker-agent` | `woodpeckerci/woodpecker-agent` | - | Build executor (scalable) |
| `woodpecker-db` | `postgres:15-alpine` | - | CI state persistence |
| `registry` | `registry:2` | 5000 | Local container registry |
| `registry-ui` | `joxit/docker-registry-ui` | 5001 | Registry browser (optional) |

### 2.2 Network Topology

```
┌─────────────────────────────────────────────────────────┐
│                    ci-network                           │
│                                                         │
│  Git Server ──webhook──▶ Woodpecker Server              │
│                              │                          │
│                    ┌─────────┼─────────┐                │
│                    ▼         ▼         ▼                │
│                 Agent-1   Agent-2   Agent-N             │
│                    │         │         │                │
│                    └─────────┴─────────┘                │
│                              │                          │
│                              ▼                          │
│                      Local Registry                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 3. Pipeline Specification

### 3.1 Trigger Matrix

| Event | Branch Pattern | Stages |
|-------|----------------|--------|
| `push` | `feature/*`, `subtask/*` | lint, test |
| `push` | `dev` | lint, test, build |
| `push` | `release/*` | lint, test, build, scan |
| `push` | `hotfix/*` | lint, test, build, scan (priority) |
| `pull_request` | `dev` | lint, test, build |
| `pull_request` | `release/*`, `main` | lint, test, build, scan, integration |
| `tag` | `v*` | lint, test, build, scan, publish |

### 3.2 Stage Definitions

#### Lint
```yaml
purpose: Code quality checks
parallel: true
steps:
  - frontend: eslint, tsc --noEmit
  - backend: ruff, mypy
timeout: 5m
```

#### Test
```yaml
purpose: Automated testing
parallel: true
steps:
  - frontend: vitest (unit), playwright (e2e)
  - backend: pytest (unit, integration)
timeout: 15m
coverage_threshold: 70%
```

#### Build
```yaml
purpose: Container image creation
steps:
  - docker build
  - tag with commit SHA
  - tag with branch name
timeout: 10m
```

#### Scan
```yaml
purpose: Security analysis
steps:
  - trivy: container vulnerabilities
  - (optional) semgrep: SAST
fail_on: HIGH, CRITICAL
timeout: 10m
```

#### Integration
```yaml
purpose: Full system testing
steps:
  - docker-compose up (test env)
  - run integration suite
  - docker-compose down
timeout: 20m
```

#### Publish
```yaml
purpose: Push to registry
steps:
  - push to local registry (5000)
  - tag with version
timeout: 5m
```

### 3.3 Pipeline File Structure

```
.woodpecker.yml          # Main pipeline
.woodpecker/
├── lint.yml             # Lint stage
├── test.yml             # Test stage
├── build.yml            # Build stage
├── scan.yml             # Security scan
├── integration.yml      # Integration tests
└── includes/
    ├── docker-build.yml # Reusable fragments
    └── notify.yml       # Notification template
```

## 4. Agent Configuration

### 4.1 Agent Capabilities

| Setting | Value | Description |
|---------|-------|-------------|
| `MAX_WORKFLOWS` | 4 | Concurrent pipelines per agent |
| `BACKEND` | docker | Execution backend |
| `HEALTHCHECK` | true | Enable health monitoring |

### 4.2 Scaling

```bash
# Scale agents dynamically
docker-compose -f docker-compose.ci.yml up -d --scale woodpecker-agent=N
```

| Workload | Recommended Agents |
|----------|-------------------|
| Solo developer | 1 |
| Small team (2-5) | 2-3 |
| Sprint crunch | 5+ |

## 5. Integration Points

### 5.1 Git Forge Integration

**Supported forges:**
- Gitea (primary)
- GitHub (via GitHub App)
- GitLab
- Bitbucket

**Webhook events:**
- `push`
- `pull_request` (open, sync, close)
- `tag`

### 5.2 Main Application Integration

#### CI Status Webhook

```typescript
// Webhook payload from Woodpecker
interface CIWebhookPayload {
  event: 'pipeline_started' | 'pipeline_success' | 'pipeline_failure';
  repo: string;
  branch: string;
  commit: string;
  pipeline_id: number;
  stages: StageResult[];
  duration_ms: number;
}

// Endpoint: POST /api/webhooks/ci
```

#### CI Status Query

```typescript
// Query CI status for a commit
interface CIStatusRequest {
  repo: string;
  commit: string;
}

interface CIStatusResponse {
  status: 'pending' | 'running' | 'success' | 'failure' | 'unknown';
  pipeline_url: string;
  stages: {
    name: string;
    status: string;
    duration_ms?: number;
  }[];
}

// Endpoint: GET /api/ci/status/:repo/:commit
```

### 5.3 Sprint Workflow Integration

| Sprint Event | CI Action |
|--------------|-----------|
| Sprint activated | Create release branch, baseline build |
| Task merged to dev | Trigger integration tests |
| Sprint enters review | Full test suite + security scan |
| Sprint completed | Tag and publish to registry |
| Hotfix sprint created | Priority queue, expedited pipeline |

### 5.4 AI Agent Integration

The AI agent can:

| Action | Trigger |
|--------|---------|
| Check CI status | Before merge operations |
| Wait for CI | Block until pipeline completes |
| Auto-fix lint | On lint failure, attempt fix and re-push |
| Retry build | On transient failures |
| Report failures | Surface CI errors to user |

```typescript
// AI CI interface
interface AIBuildGate {
  waitForCI(branch: string, timeout_ms: number): Promise<CIStatus>;
  canMerge(branch: string): Promise<boolean>;
  autoFixLint(branch: string): Promise<boolean>;
  getPipelineLogs(pipeline_id: number): Promise<string>;
}
```

## 6. Configuration

### 6.1 Environment Variables

```bash
# Required
WOODPECKER_AGENT_SECRET=<32+ char secret>
WOODPECKER_HOST=http://localhost:8000

# Git Forge (Gitea example)
GITEA_URL=http://gitea:3000
GITEA_CLIENT_ID=<oauth-client-id>
GITEA_CLIENT_SECRET=<oauth-client-secret>

# Optional
WOODPECKER_ADMIN=admin
WEBHOOK_URL=http://backend:3001/api/webhooks/ci
REGISTRY_URL=localhost:5000
```

### 6.2 Secrets Management

Secrets stored in Woodpecker (not in repo):

| Secret | Scope | Purpose |
|--------|-------|---------|
| `registry_auth` | global | Push to registries |
| `npm_token` | repo | Private npm packages |
| `webhook_secret` | repo | Signed webhook payloads |

## 7. Caching Strategy

### 7.1 Dependency Caching

```yaml
# .woodpecker.yml cache configuration
steps:
  test:
    image: node:20-alpine
    commands:
      - npm ci
      - npm test
    volumes:
      - npm-cache:/root/.npm
```

### 7.2 Docker Layer Caching

```yaml
steps:
  build:
    image: docker:24-dind
    commands:
      - docker build --cache-from=localhost:5000/${CI_REPO}:cache -t ${CI_REPO}:${CI_COMMIT_SHA} .
      - docker push localhost:5000/${CI_REPO}:cache
```

## 8. Notifications

### 8.1 Notification Channels

| Channel | Events | Configuration |
|---------|--------|---------------|
| WebSocket | all | Broadcast to `ci.{repo}` |
| Webhook | success, failure | `WEBHOOK_URL` |
| (optional) Slack | failure only | `SLACK_WEBHOOK` |

### 8.2 Notification Payload

```json
{
  "event": "pipeline_complete",
  "status": "success|failure",
  "repo": "auto-claude-docker",
  "branch": "feature/new-thing",
  "commit": "abc123",
  "commit_message": "Add new feature",
  "author": "developer",
  "pipeline_url": "http://localhost:8000/repos/1/pipeline/42",
  "duration_seconds": 127,
  "stages": [
    {"name": "lint", "status": "success", "duration": 12},
    {"name": "test", "status": "success", "duration": 85},
    {"name": "build", "status": "success", "duration": 30}
  ]
}
```

## 9. Monitoring

### 9.1 Metrics (Prometheus)

Woodpecker exposes `/metrics`:

| Metric | Description |
|--------|-------------|
| `woodpecker_build_count` | Total builds |
| `woodpecker_build_time` | Build duration histogram |
| `woodpecker_pending_jobs` | Queue depth |
| `woodpecker_running_jobs` | Active builds |
| `woodpecker_agent_count` | Connected agents |

### 9.2 Health Checks

| Endpoint | Service | Expected |
|----------|---------|----------|
| `GET /healthz` | woodpecker-server | 200 |
| `GET /version` | woodpecker-server | version JSON |
| Docker healthcheck | woodpecker-agent | healthy |

## 10. Security

### 10.1 Isolation

- CI network isolated from production
- Agents run builds in ephemeral containers
- No production secrets in local CI

### 10.2 Access Control

- Woodpecker inherits permissions from Git forge
- Admin users configured via `WOODPECKER_ADMIN`
- Repo-level secrets scoped appropriately

### 10.3 Scanning

| Tool | Target | Fail Threshold |
|------|--------|----------------|
| Trivy | Container images | HIGH, CRITICAL |
| (optional) Semgrep | Source code | ERROR |
| (optional) npm audit | Dependencies | high |

## 11. File Artifacts

### 11.1 Compose File

`docker-compose.ci.yml` - Full CI stack deployment

### 11.2 Pipeline Templates

`.woodpecker.yml` - Main pipeline definition
`.woodpecker/*.yml` - Stage-specific pipelines

### 11.3 Scripts

`scripts/ci/` - Helper scripts for CI operations

## 12. Appendix: Quick Start

```bash
# 1. Generate agent secret
export WOODPECKER_AGENT_SECRET=$(openssl rand -hex 32)

# 2. Configure Git forge OAuth (in Gitea/GitHub)
# 3. Set environment variables in .env.ci

# 4. Start CI stack
docker-compose -f docker-compose.ci.yml up -d

# 5. Access Woodpecker UI
open http://localhost:8000

# 6. Activate repository in Woodpecker UI

# 7. Push code to trigger first build
git push origin feature/test-ci
```
