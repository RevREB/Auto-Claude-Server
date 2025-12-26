# Hierarchical Git Branching Model Proposal

## Overview

This document proposes a structured Git branching model for the Auto-Claude system that provides:

- Clear task and subtask organization in Git history
- Granular merge control at subtask, task, and release levels
- Semantic versioning (SemVer) enforcement
- Better traceability and rollback capabilities
- Support for parallel AI task execution
- **Pure Git workflow** - no worktrees, no file copying, just clone → work → push

---

## Design Philosophy

### Pure Git Model

This proposal eliminates the current `.worktrees/` approach in favor of **full clones**:

```
Current (Worktrees):                    Proposed (Pure Git):
────────────────────────────────────    ────────────────────────────────────
/project/                               /project/
  .git/                                   .git/
  .worktrees/          ← MESS              (no worktree folders)
    task-1/
    task-2/                             /tmp/auto-claude-clones/  ← ISOLATED
  src/                                    task-1-abc123/
                                          task-2-def456/
```

**Why this is better:**

1. **Main repo stays pristine** - No `.worktrees/` folder, no spec files copied around
2. **Standard Git workflow** - Clone, branch, commit, push - nothing exotic
3. **True isolation** - Each agent has its own `.git`, can't corrupt main
4. **Easy cleanup** - Delete the temp folder, done
5. **CI/CD friendly** - Standard clone-based workflows just work
6. **Simpler mental model** - It's just Git, no worktree concepts to learn

### Workflow Summary

```
1. Task starts     → Clone repo to temp location
2. AI executes     → Work on feature branch in clone
3. Commits made    → Standard git commits
4. Work complete   → Push branch to origin
5. Cleanup         → Delete temp clone folder
6. Merge           → Standard git merge/PR from branch to target
```

---

## Branch Hierarchy

```
main (production - tagged releases only)
  │
  └── release/{version} (release candidates)
        │
        └── dev (integration branch)
              │
              ├── feature/{task-id} (task feature branch)
              │     ├── feature/{task-id}/subtask-1
              │     ├── feature/{task-id}/subtask-2
              │     └── feature/{task-id}/subtask-3
              │
              └── feature/{task-id-2}
                    └── feature/{task-id-2}/subtask-1
```

### Branch Purposes

| Branch | Purpose | Merges To | Protected |
|--------|---------|-----------|-----------|
| `main` | Production releases only | N/A (top) | Yes |
| `release/{version}` | Release candidate stabilization | `main` | Yes |
| `dev` | Integration of completed features | `release/*` | Yes |
| `feature/{task-id}` | Task-level feature branch | `dev` | No |
| `feature/{task-id}/{subtask}` | Individual subtask work | `feature/{task-id}` | No |

---

## Semantic Versioning Integration

Following [SemVer 2.0.0](https://semver.org/) specification:

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

Examples:
  1.0.0          - Initial release
  1.1.0          - New feature added (backward compatible)
  1.1.1          - Bug fix
  2.0.0          - Breaking change
  2.0.0-alpha.1  - Pre-release
  2.0.0-rc.1     - Release candidate
```

### Version Bump Rules

| Change Type | Version Impact | Task Metadata |
|-------------|---------------|---------------|
| Breaking API change | MAJOR | `breaking: true` |
| New feature (backward compatible) | MINOR | `category: feature` |
| Bug fix | PATCH | `category: bug_fix` |
| Documentation only | PATCH | `category: documentation` |
| Refactoring (no behavior change) | PATCH | `category: refactoring` |
| Security fix | PATCH | `category: security` |
| Performance improvement | PATCH | `category: performance` |

### Automatic Version Detection

The system should analyze merged tasks to suggest the next version:

```python
def calculate_next_version(current: str, merged_tasks: list) -> str:
    major, minor, patch = parse_version(current)

    if any(task.breaking for task in merged_tasks):
        return f"{major + 1}.0.0"
    elif any(task.category == "feature" for task in merged_tasks):
        return f"{major}.{minor + 1}.0"
    else:
        return f"{major}.{minor}.{patch + 1}"
```

---

## Workflow

### 1. Task Creation

When a task is created in the backlog:

```
1. Task created with ID: task-abc123
2. System creates branch: feature/task-abc123 (off dev)
3. Task status: backlog
```

### 2. Planning Phase

When task enters planning (AI generates implementation plan):

```
1. AI analyzes task and generates subtasks
2. For each subtask, system creates branch:
   - feature/task-abc123/subtask-{n}
3. Subtask branches are based off feature/task-abc123
4. No disk resources allocated yet - clones happen at execution time
```

### 3. Subtask Execution

Each subtask executes in a **fresh clone** (not a worktree):

```
1. System clones repo to temp location:
   /tmp/auto-claude/{task-id}-{subtask-id}/

2. Clone checks out the subtask branch:
   git checkout feature/task-abc123/subtask-{n}

3. AI works entirely within the clone
   - Full isolation from main project
   - Full isolation from other running tasks
   - Standard git operations (commit, etc.)

4. On completion:
   - AI commits final changes
   - System pushes branch to origin
   - Clone folder deleted
   - Subtask ready for review
```

**Benefits of clone-based execution:**
- Main project directory is never touched
- Multiple AIs can run in parallel (each has own clone)
- Crash-safe: if AI crashes, just delete the temp folder
- Standard git model: clone → work → push

**Disk usage:**
- Clones exist only during task execution
- After push, temp folder is immediately deleted
- No permanent disk overhead (unlike worktrees which persist)
- Startup script can clean orphaned clones from `/tmp/auto-claude/`

### 4. Subtask → Feature Merge

After subtask review/approval:

```
1. User approves subtask in UI
2. System merges feature/task-abc123/subtask-{n} → feature/task-abc123
3. Subtask branch optionally deleted
4. Repeat for remaining subtasks
```

### 5. Feature → Dev Merge

When all subtasks are merged and task is approved:

```
1. User marks task as complete
2. UI shows merge option to dev
3. System creates PR or direct merge: feature/task-abc123 → dev
4. Task marked as merged
5. Feature branch optionally deleted
```

### 6. Dev → Release

When preparing a release:

```
1. User initiates release in UI
2. System suggests version based on merged tasks
3. User confirms/adjusts version
4. System creates: release/{version} from dev
5. Release candidate testing begins
```

### 7. Release → Main

After release validation:

```
1. User approves release
2. System merges: release/{version} → main
3. System creates Git tag: v{version}
4. Changelog auto-generated from task history
5. Release branch optionally deleted
```

---

## UI Requirements

### 1. Merge Control Panel

New component: **Merge Manager**

```
┌─────────────────────────────────────────────────────────────┐
│  Merge Manager                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Feature Branches Ready to Merge to Dev:                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ feature/task-abc123 - Add user authentication     │   │
│  │   ├── ✓ subtask-1: Database schema (merged)         │   │
│  │   ├── ✓ subtask-2: API endpoints (merged)           │   │
│  │   └── ✓ subtask-3: UI components (merged)           │   │
│  │   Impact: MINOR (new feature)                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ feature/task-def456 - Fix login timeout           │   │
│  │   └── ✓ subtask-1: Increase session TTL (merged)    │   │
│  │   Impact: PATCH (bug fix)                            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ feature/task-ghi789 - Redesign dashboard          │   │
│  │   ├── ✓ subtask-1: New layout (merged)              │   │
│  │   ├── ○ subtask-2: Charts update (in progress)      │   │
│  │   └── ○ subtask-3: Mobile responsive (pending)      │   │
│  │   Status: Incomplete - cannot merge                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Selected: 2 features                                       │
│  Projected Impact: MINOR version bump                       │
│                                                             │
│  [Preview Merge]  [Merge Selected to Dev]                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Release Management Panel

New component: **Release Manager**

```
┌─────────────────────────────────────────────────────────────┐
│  Release Manager                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Current Version: v1.2.3                                    │
│  Dev Branch: 5 features ahead of last release               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Changes in Dev (since v1.2.3):                       │   │
│  │                                                       │   │
│  │ Features:                                             │   │
│  │   • Add user authentication (MINOR)                  │   │
│  │   • Implement dark mode (MINOR)                      │   │
│  │                                                       │   │
│  │ Bug Fixes:                                            │   │
│  │   • Fix login timeout (PATCH)                        │   │
│  │   • Resolve memory leak (PATCH)                      │   │
│  │                                                       │   │
│  │ Breaking Changes:                                     │   │
│  │   • None                                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Suggested Next Version: v1.3.0                             │
│                                                             │
│  Version Override: [1].[3].[0]-[        ]                   │
│                                                             │
│  Release Notes:                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ## What's New                                        │   │
│  │ - User authentication system                         │   │
│  │ - Dark mode support                                  │   │
│  │                                                       │   │
│  │ ## Bug Fixes                                         │   │
│  │ - Fixed login timeout issue                          │   │
│  │ - Resolved memory leak in dashboard                  │   │
│  │                                                       │   │
│  │ [Auto-generate from commits]                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Create Release Branch]  [Cancel]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Release Candidate View

```
┌─────────────────────────────────────────────────────────────┐
│  Release Candidates                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ release/1.3.0                                        │   │
│  │ Created: 2 hours ago                                 │   │
│  │ Status: Testing                                      │   │
│  │                                                       │   │
│  │ Pre-release Tags:                                     │   │
│  │   v1.3.0-rc.1 (current)                              │   │
│  │                                                       │   │
│  │ Hotfixes Applied: 0                                   │   │
│  │                                                       │   │
│  │ [Run Tests]  [Add Hotfix]  [Promote to Main]         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Previous Releases:                                         │
│  • v1.2.3 - Released 2 weeks ago                           │
│  • v1.2.2 - Released 1 month ago                           │
│  • v1.2.1 - Released 1 month ago                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Task Detail Enhancements

Update task detail panel to show branch status:

```
┌─────────────────────────────────────────────────────────────┐
│  Task: Add User Authentication                              │
│  ID: task-abc123                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Branch: feature/task-abc123                                │
│  Based On: dev (3 commits behind)                           │
│  Status: In Progress                                        │
│                                                             │
│  Subtasks:                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Subtask 1: Database schema                        │   │
│  │   Branch: feature/task-abc123/subtask-1             │   │
│  │   Status: Merged to feature branch                   │   │
│  │   Commits: 3 | +245 -12 lines                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ● Subtask 2: API endpoints                          │   │
│  │   Branch: feature/task-abc123/subtask-2             │   │
│  │   Status: Ready for review                           │   │
│  │   Commits: 5 | +523 -45 lines                        │   │
│  │   [View Diff]  [Approve & Merge]  [Request Changes]  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ Subtask 3: UI components                          │   │
│  │   Branch: feature/task-abc123/subtask-3             │   │
│  │   Status: In progress (AI working)                   │   │
│  │   Commits: 2 | +156 -0 lines                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Version Impact: MINOR (adds new feature)                   │
│  Breaking Changes: None                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5. Sidebar Navigation Updates

Updated navigation (Worktrees removed, Merges/Releases added):

```
┌──────────────────────┐
│  Navigation          │
├──────────────────────┤
│  📋 Kanban      (K)  │
│  💡 Insights    (I)  │
│  🗺️ Roadmap     (R)  │
│  💭 Ideation    (D)  │
│  📝 Context     (C)  │
│  🐙 GitHub      (G)  │
│  ──────────────────  │
│  🔀 Merges      (M)  │  ← NEW (replaces Worktrees)
│  📦 Releases    (L)  │  ← NEW
│  ──────────────────  │
│  📺 Terminals   (A)  │
│  ⚙️ Settings         │
└──────────────────────┘
```

### 6. UI Elements to Remove

The following current UI elements should be **removed**:

| Remove | Reason |
|--------|--------|
| Worktrees nav item (W) | No longer user-facing concept |
| Worktrees panel/component | Replaced by branch-based views |
| "Merge worktree" buttons | Replaced by "Merge branch" in Merge Manager |
| "Discard worktree" buttons | Replaced by "Delete branch" |
| Worktree path displays | Show branch name instead |
| `.worktrees/` folder references | Clones are in temp, invisible to user |

**What users see instead:**

| Old Concept | New Concept |
|-------------|-------------|
| "Worktree for task-123" | "Branch: feature/task-123" |
| "Merge worktree" | "Merge to dev" |
| "Worktree has 3 commits" | "Branch is 3 commits ahead" |
| "Discard worktree" | "Delete branch" |

---

## Database Schema Updates

### Tasks Table

Add fields:

```sql
ALTER TABLE tasks ADD COLUMN feature_branch VARCHAR(255);
ALTER TABLE tasks ADD COLUMN version_impact VARCHAR(20); -- 'major', 'minor', 'patch'
ALTER TABLE tasks ADD COLUMN is_breaking BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN merged_to_dev_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN release_version VARCHAR(50);
```

### Subtasks Table (New)

```sql
CREATE TABLE subtasks (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    branch_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    merged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

### Releases Table (New)

```sql
CREATE TABLE releases (
    id VARCHAR(255) PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    branch_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'candidate', -- candidate, released, abandoned
    release_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP,
    created_by VARCHAR(255)
);
```

### Release Tasks Junction (New)

```sql
CREATE TABLE release_tasks (
    release_id VARCHAR(255),
    task_id VARCHAR(255),
    PRIMARY KEY (release_id, task_id),
    FOREIGN KEY (release_id) REFERENCES releases(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

---

## API Endpoints

### Merge Operations

```
POST   /api/subtasks/{id}/merge          # Merge subtask to feature branch
POST   /api/tasks/{id}/merge             # Merge feature to dev
GET    /api/tasks/{id}/merge-status      # Check merge conflicts
POST   /api/tasks/{id}/merge-preview     # Preview merge changes
```

### Release Operations

```
GET    /api/releases                     # List all releases
POST   /api/releases                     # Create release candidate
GET    /api/releases/{version}           # Get release details
POST   /api/releases/{version}/promote   # Promote to main
POST   /api/releases/{version}/hotfix    # Apply hotfix to release
DELETE /api/releases/{version}           # Abandon release candidate
```

### Version Operations

```
GET    /api/version/current              # Get current version
GET    /api/version/next                 # Calculate next version
GET    /api/version/changelog            # Generate changelog
```

---

## WebSocket Events

### New Events

```typescript
// Subtask merged to feature branch
"subtask.merged" -> { taskId, subtaskId, branch }

// Feature merged to dev
"feature.merged" -> { taskId, branch }

// Release created
"release.created" -> { version, branch }

// Release promoted to main
"release.promoted" -> { version, tag }

// Version tag created
"version.tagged" -> { version, commit }
```

---

## Container-Based Scaling (Future/Optional)

> **Note:** This section describes a future scaling option. The initial implementation will use local clones on a single machine. The pure Git clone model is designed to enable this scaling path without architectural changes.

The clone model maps naturally to container orchestration (Kubernetes, Docker Swarm, ECS, etc.). Each task/subtask runs as an isolated container:

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │  Controller Pod  │  Orchestrates tasks, manages state                │
│  │  (Auto-Claude)   │  Watches task queue, spawns workers               │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           │ Spawns Job/Pod per task                                     │
│           ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Worker Pods (ephemeral)                                         │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ Task Pod 1  │  │ Task Pod 2  │  │ Task Pod 3  │  ...         │   │
│  │  │             │  │             │  │             │              │   │
│  │  │ Clone repo  │  │ Clone repo  │  │ Clone repo  │              │   │
│  │  │ Run AI      │  │ Run AI      │  │ Run AI      │              │   │
│  │  │ Push branch │  │ Push branch │  │ Push branch │              │   │
│  │  │ Exit        │  │ Exit        │  │ Exit        │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                   │   │
│  │  Each pod: clones repo, works, pushes, terminates                │   │
│  │  No shared state, no volume mounts needed                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐                            │
│  │  Git Server      │  │  Task Queue      │                            │
│  │  (origin)        │  │  (Redis/Postgres)│                            │
│  └──────────────────┘  └──────────────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Worker Pod Lifecycle

```yaml
# Example Kubernetes Job for a task
apiVersion: batch/v1
kind: Job
metadata:
  name: task-abc123-subtask-1
spec:
  ttlSecondsAfterFinished: 300  # Cleanup after 5 min
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: claude-worker
        image: auto-claude-worker:latest
        env:
        - name: TASK_ID
          value: "task-abc123"
        - name: SUBTASK_ID
          value: "subtask-1"
        - name: GIT_REPO
          value: "git@github.com:org/repo.git"
        - name: BRANCH
          value: "feature/task-abc123/subtask-1"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: anthropic
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
```

### Benefits of Container Scaling

| Benefit | Description |
|---------|-------------|
| **True Isolation** | Each task runs in its own container - no filesystem conflicts |
| **Horizontal Scaling** | Run 1 or 100 tasks in parallel, just spawn more pods |
| **Resource Limits** | CPU/memory limits per task prevent runaway processes |
| **Clean Cleanup** | Pod terminates = everything gone, no orphaned files |
| **Reproducible** | Same container image = same environment every time |
| **Cost Efficient** | Spot instances for workers, scale to zero when idle |
| **Multi-Cluster** | Distribute tasks across regions for lower latency |

### Scaling Patterns

```
Single Machine (Current):
─────────────────────────
1 process → N clones in /tmp
Limited by: CPU, memory, disk I/O

Kubernetes (Proposed):
──────────────────────
1 controller → N pods across M nodes
Limited by: cluster size, API rate limits

Serverless (Future):
────────────────────
Event-driven → spawn container per task
Limited by: cold start time, execution limits
```

### Communication Flow

```
1. Task Created
   └── Controller adds to queue

2. Controller Watches Queue
   └── Spawns Kubernetes Job for task

3. Worker Pod Starts
   ├── Clones repo (uses deploy key from secret)
   ├── Checks out feature branch
   ├── Runs Claude AI agent
   ├── Commits changes
   ├── Pushes to origin
   └── Reports status to controller (webhook/queue)

4. Pod Terminates
   └── Kubernetes cleans up automatically

5. Controller Updates State
   └── Marks subtask complete, triggers next steps
```

### Git Credentials in Containers

```yaml
# SSH key for git operations
apiVersion: v1
kind: Secret
metadata:
  name: git-deploy-key
type: kubernetes.io/ssh-auth
data:
  ssh-privatekey: <base64-encoded-key>

# Mount in worker pod
volumes:
- name: git-key
  secret:
    secretName: git-deploy-key
    defaultMode: 0400
```

### Why This Works

The pure Git clone model is **stateless by design**:

1. **No shared filesystem needed** - Each worker clones fresh
2. **No coordination required** - Workers don't know about each other
3. **Idempotent operations** - Clone, work, push - can retry safely
4. **Git is the sync mechanism** - All state lives in the remote repo

This is why worktrees wouldn't scale - they require a shared `.git` directory, which means shared storage (slow, complex, expensive on k8s).

---

## Configuration

### Project Settings

Add to project settings dialog:

```yaml
branching:
  model: "hierarchical"  # or "flat" for current behavior

  branches:
    main: "main"
    development: "dev"
    release_prefix: "release/"
    feature_prefix: "feature/"

  versioning:
    enabled: true
    scheme: "semver"  # or "calver", "custom"
    initial: "0.1.0"

  automation:
    auto_create_feature_branch: true
    auto_create_subtask_branches: true
    auto_delete_merged_branches: true
    require_subtask_approval: false
    require_feature_approval: true
```

---

## Migration Path

### Phase 1: Database & Backend

1. Add new database tables and columns
2. Create `branch_manager.py` service (replaces worktree logic)
3. Create `clone_manager.py` for temp clone lifecycle
4. Add merge control API endpoints
5. Add release management API endpoints
6. Implement SemVer calculation logic

### Phase 2: Core Workflow

1. Update task creation to create feature branches
2. Update planning phase to create subtask branches
3. Update task execution to clone repo → work → push → cleanup
4. Implement subtask → feature merge flow
5. Implement feature → dev merge flow
6. Remove all worktree-related code

### Phase 3: UI - Merge Control

1. Create Merge Manager component
2. Add subtask approval UI in task detail
3. Add feature merge controls
4. Implement merge preview/diff view
5. Add conflict resolution UI
6. Remove Worktrees panel and nav item

### Phase 4: UI - Release Management

1. Create Release Manager component
2. Implement release candidate creation flow
3. Add release notes editor
4. Implement changelog generation
5. Add release promotion flow

### Phase 5: Polish & Testing

1. End-to-end testing
2. Migration script for existing projects (clean up any `.worktrees/` folders)
3. Documentation updates
4. Settings UI for branching configuration

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex merge conflicts | High | AI resolves conflicts during merge task; human review for ambiguous cases |
| Branch proliferation | Medium | Auto-cleanup of merged branches, branch age warnings |
| Learning curve | Medium | Good defaults, optional advanced features, documentation |
| Migration of existing projects | Medium | Gradual adoption, backward compatibility mode |
| Performance with many branches | Low | Lazy loading, pagination, branch archival |

### AI-Driven Conflict Resolution

When merge conflicts occur, the system spawns an AI task to resolve them:

```
1. Merge attempted (e.g., subtask → feature branch)
2. Git reports conflicts
3. System creates "Resolve merge conflict" task
   - Spec includes: conflicting files, both versions, context
4. AI agent:
   - Clones repo, checks out target branch
   - Attempts merge, analyzes conflicts
   - Resolves based on intent from both branches
   - Commits resolution, pushes
5. Human reviews resolution (optional, configurable)
6. Original merge completes
```

This keeps humans out of the loop for routine conflicts while preserving oversight for complex cases.

---

## Success Metrics

1. **Traceability**: 100% of changes traceable to task/subtask
2. **Merge Safety**: Zero accidental merges to protected branches
3. **Version Accuracy**: SemVer correctly reflects change impact
4. **Developer Experience**: <3 clicks to merge subtask/feature
5. **Release Confidence**: Full changelog generated automatically

---

## Open Questions

1. Should subtask approval be required by default, or optional?
2. How to handle long-running feature branches that fall behind dev?
3. Should we support squash merges or preserve full commit history?
4. Integration with external CI/CD systems for release validation?
5. Support for multiple release trains (e.g., v1.x and v2.x simultaneously)?

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [GitFlow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [Trunk Based Development](https://trunkbaseddevelopment.com/)
- [Git Branching](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell)

---

*Document Version: 1.2.0*
*Last Updated: December 2024*
*Status: Ready for Human Review*
*Authors: Auto-Claude Development Team*

---

## Changelog

### v1.2.0
- Added "Container-Based Scaling (Future/Optional)" section
- Documented worker pod lifecycle and Job manifests
- Added scaling patterns (single machine → k8s → serverless)
- Explained why stateless clone model enables horizontal scaling
- Marked as optional future enhancement, not required for initial implementation

### v1.1.0
- Replaced worktree model with pure Git clone model
- Added Design Philosophy section explaining clone-based approach
- Added "UI Elements to Remove" section
- Removed time estimates from migration phases
- Added disk usage documentation
- Updated references (removed worktree link)

### v1.0.0
- Initial proposal
