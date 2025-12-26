# Sprint Workflow Proposal

**Version:** 1.0.0
**Status:** Draft
**Related:** [BRANCHING_MODEL_PROPOSAL.md](./BRANCHING_MODEL_PROPOSAL.md)

---

## Executive Summary

Evolve the current Kanban-style task execution into a Sprint-based workflow where:
- Tasks are grouped into version-targeted Sprints
- AI agents execute Sprint tasks while humans plan the next Sprint
- Sprints integrate directly with the Git branching model
- Hotfix Sprints enable emergency patches with automatic rebase of future work

---

## Current vs Proposed

```
CURRENT (Kanban):
┌─────────────────────────────────────────────────────────┐
│  Backlog    │    In Progress    │    Done              │
│  ────────   │    ───────────    │    ────              │
│  Task A     │    Task C (AI)    │    Task E            │
│  Task B     │    Task D (AI)    │    Task F            │
│  Task G     │                   │                      │
│  Task H     │                   │                      │
└─────────────────────────────────────────────────────────┘
               ↑
               No version targeting
               No grouping
               Random execution order

PROPOSED (Sprint):
┌─────────────────────────────────────────────────────────┐
│  BACKLOG          │  SPRINT 1.2.0 (Active)             │
│  ────────         │  ──────────────────────            │
│  Task G           │  [████████░░] 80% complete         │
│  Task H           │                                    │
│  Task I           │  ✓ Task A    → feature/task-a      │
│  Task J           │  ✓ Task B    → feature/task-b      │
│                   │  ▶ Task C    → feature/task-c (AI) │
│  ┌─────────────┐  │  ○ Task D    → pending             │
│  │ SPRINT 1.3.0│  │                                    │
│  │ (Planning)  │  │  Branch: release/1.2.0             │
│  │ Task K      │  │  Started: 2025-01-15               │
│  │ Task L      │  │                                    │
│  └─────────────┘  │  [End Sprint] [Add Task]           │
└─────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Sprint
A time-boxed collection of tasks targeting a specific version release.

### Sprint Types

| Type | Purpose | Base Branch | Creates Branch |
|------|---------|-------------|----------------|
| `release` | Planned feature work | `dev` or `main` | `release/{version}` |
| `hotfix` | Emergency production fix | Tag `v{version}` | `hotfix/{version}` |

### Sprint States

```
  PLANNING ──────► ACTIVE ──────► REVIEW ──────► COMPLETE
      │               │              │               │
      │               │              │               │
  Assign tasks    AI executes    Human review    Merge & tag
  Set version     You plan       Final QA        Archive
  No branch yet   next sprint    Approval
                  Branch exists
```

---

## Data Model

### Sprint Entity

```typescript
interface Sprint {
  id: string;                    // UUID
  projectId: string;             // Parent project

  // Identity
  name: string;                  // "Sprint 1.2.0" or "Hotfix 1.1.1"
  version: string;               // SemVer: "1.2.0"
  type: 'release' | 'hotfix';

  // For hotfixes: which version to branch from
  baseVersion?: string;          // e.g., "1.1.0" for hotfix/1.1.1

  // State
  status: SprintStatus;

  // Relationships
  taskIds: string[];             // Ordered list of task IDs

  // Git integration
  branchName?: string;           // Created when sprint starts
  tagName?: string;              // Created when sprint completes

  // Timestamps
  createdAt: Date;
  startedAt?: Date;              // When status → active
  completedAt?: Date;            // When status → complete

  // Metrics (computed)
  taskCount: number;
  completedTaskCount: number;
  progress: number;              // 0-100
}

type SprintStatus = 'planning' | 'active' | 'review' | 'complete' | 'cancelled';
```

### Task Entity (Updated)

```typescript
interface Task {
  // ... existing fields ...

  // NEW: Sprint relationship
  sprintId?: string;             // null = backlog
  sprintOrder?: number;          // Position within sprint
}
```

### Database Schema

```sql
-- New table
CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('release', 'hotfix')),
  base_version TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  branch_name TEXT,
  tag_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(project_id, version)
);

-- Update tasks table
ALTER TABLE tasks ADD COLUMN sprint_id TEXT REFERENCES sprints(id);
ALTER TABLE tasks ADD COLUMN sprint_order INTEGER;
```

---

## Sprint Lifecycle

### 1. Create Sprint (Planning)

```
User Action: "New Sprint" button
─────────────────────────────────────────────────────────

┌─────────────────────────────────────────┐
│         Create New Sprint               │
├─────────────────────────────────────────┤
│                                         │
│  Type:    ○ Release  ○ Hotfix           │
│                                         │
│  Version: [1.2.0          ]             │
│           Auto-suggested from last      │
│                                         │
│  Name:    [Sprint 1.2.0   ]             │
│           Auto-generated, editable      │
│                                         │
│  ─────────────────────────────────────  │
│  (Hotfix only)                          │
│  Base Version: [1.1.0 ▼]                │
│  "Branch from this release"             │
│                                         │
│         [Cancel]  [Create Sprint]       │
└─────────────────────────────────────────┘

System:
  → Creates sprint record (status: planning)
  → No Git operations yet
```

### 2. Sprint Planning

```
User Action: Drag tasks from backlog into sprint
─────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  BACKLOG                │  SPRINT 1.2.0 (Planning)     │
│  ────────               │  ────────────────────────    │
│                         │                              │
│  ┌─────────────────┐    │  Drop tasks here to add:     │
│  │ Task: Add auth  │◄───┼──────────────────────────┐   │
│  │ Priority: High  │    │                          │   │
│  └─────────────────┘    │  ┌─────────────────────┐ │   │
│                    ─────┼─►│ 1. Task: Add auth   │ │   │
│  ┌─────────────────┐    │  │    ≡ drag to reorder│◄┘   │
│  │ Task: Fix bug   │    │  └─────────────────────┘     │
│  │ Priority: Med   │    │  ┌─────────────────────┐     │
│  └─────────────────┘    │  │ 2. Task: Update UI  │     │
│                         │  │    ≡                │     │
│  ┌─────────────────┐    │  └─────────────────────┘     │
│  │ Task: Refactor  │    │                              │
│  │ Priority: Low   │    │  Tasks: 2                    │
│  └─────────────────┘    │                              │
│                         │  [Start Sprint]              │
└─────────────────────────────────────────────────────────┘

System:
  → Updates task.sprintId and task.sprintOrder
  → Sprint still has no branch
```

### 3. Start Sprint (Planning → Active)

```
User Action: "Start Sprint" button
─────────────────────────────────────────────────────────

Confirmation Dialog:
┌─────────────────────────────────────────┐
│         Start Sprint 1.2.0?             │
├─────────────────────────────────────────┤
│                                         │
│  This will:                             │
│  • Create branch: release/1.2.0         │
│  • Begin AI execution of 5 tasks        │
│  • Lock sprint version number           │
│                                         │
│  You can continue planning the next     │
│  sprint while this one runs.            │
│                                         │
│         [Cancel]  [Start Sprint]        │
└─────────────────────────────────────────┘

System (Release Sprint):
  → git checkout dev
  → git pull origin dev
  → git checkout -b release/1.2.0
  → git push -u origin release/1.2.0
  → sprint.status = 'active'
  → sprint.branchName = 'release/1.2.0'
  → Begin task execution (AI agents)

System (Hotfix Sprint):
  → git checkout v1.1.0  (tag)
  → git checkout -b hotfix/1.1.1
  → git push -u origin hotfix/1.1.1
  → sprint.status = 'active'
  → sprint.branchName = 'hotfix/1.1.1'
  → Begin task execution (AI agents)
```

### 4. Sprint Active (AI Execution)

```
Sprint Board View:
─────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  SPRINT 1.2.0                          [End Sprint ▼]  │
│  ═══════════════════════════════════════════════════   │
│  Branch: release/1.2.0    Progress: ████████░░ 80%     │
│  Started: 2 hours ago     4/5 tasks complete           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   PENDING        IN PROGRESS         DONE              │
│   ───────        ───────────         ────              │
│                                                         │
│   ┌──────────┐   ┌──────────────┐   ┌──────────┐       │
│   │ Task 5   │   │ Task 4       │   │ Task 1 ✓ │       │
│   │ Waiting  │   │ ▶ Running... │   └──────────┘       │
│   │          │   │ Agent: opus  │   ┌──────────┐       │
│   │          │   │ 45% done     │   │ Task 2 ✓ │       │
│   └──────────┘   │              │   └──────────┘       │
│                  │ [View Logs]  │   ┌──────────┐       │
│                  └──────────────┘   │ Task 3 ✓ │       │
│                                     └──────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Recent Activity:                                       │
│  • Task 4 started (2 min ago)                          │
│  • Task 3 completed - merged to release/1.2.0          │
│  • Task 2 completed - merged to release/1.2.0          │
└─────────────────────────────────────────────────────────┘

Parallel Planning:
┌─────────────────────────────────────────┐
│  While Sprint 1.2.0 runs, you can:      │
│                                         │
│  • Create Sprint 1.3.0 (planning)       │
│  • Add tasks to backlog                 │
│  • Use Insights to generate ideas       │
│  • Plan roadmap items                   │
└─────────────────────────────────────────┘
```

### 5. Task Execution Within Sprint

```
For each task in sprint:
─────────────────────────────────────────────────────────

1. Clone repo to temp location:
   /tmp/auto-claude/{sprint-id}-{task-id}/

2. Checkout sprint branch:
   git checkout release/1.2.0

3. Create feature branch:
   git checkout -b feature/{task-id}

4. AI executes task (with subtasks if needed)

5. On completion:
   git checkout release/1.2.0
   git merge feature/{task-id}
   git push origin release/1.2.0

6. Delete temp clone

7. Next task begins
```

### 6. End Sprint (Active → Review)

```
User Action: "End Sprint" button
─────────────────────────────────────────────────────────

Pre-check:
┌─────────────────────────────────────────┐
│         End Sprint 1.2.0?               │
├─────────────────────────────────────────┤
│                                         │
│  Status:                                │
│  ✓ 4 tasks completed                    │
│  ⚠ 1 task still pending                 │
│                                         │
│  Options for pending task:              │
│  ○ Move to backlog                      │
│  ○ Move to next sprint (1.3.0)          │
│  ○ Cancel task                          │
│                                         │
│         [Cancel]  [End Sprint]          │
└─────────────────────────────────────────┘

System:
  → Handle incomplete tasks per selection
  → sprint.status = 'review'
  → Stop any running AI agents for this sprint
```

### 7. Sprint Review

```
Review View:
─────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  SPRINT 1.2.0 - Review                                 │
│  ═══════════════════════════════════════════════════   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Summary:                                              │
│  • 4 tasks completed                                   │
│  • 1 task moved to backlog                             │
│  • 12 commits on release/1.2.0                         │
│  • 0 merge conflicts                                   │
│                                                         │
│  Changes:                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ src/auth/login.ts        +142  -23              │   │
│  │ src/components/Button.tsx +34   -12             │   │
│  │ src/api/users.ts         +89   -5               │   │
│  │ ... 8 more files                                │   │
│  │                                                 │   │
│  │ [View Full Diff]  [View Commits]                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Run final checks before release:                │   │
│  │ ☐ Review code changes                           │   │
│  │ ☐ Run test suite                                │   │
│  │ ☐ QA sign-off                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│         [Back to Active]  [Complete Sprint]            │
└─────────────────────────────────────────────────────────┘
```

### 8. Complete Sprint (Review → Complete)

```
User Action: "Complete Sprint" button
─────────────────────────────────────────────────────────

Confirmation:
┌─────────────────────────────────────────┐
│      Complete Sprint 1.2.0?             │
├─────────────────────────────────────────┤
│                                         │
│  This will:                             │
│  • Merge release/1.2.0 → main           │
│  • Create tag: v1.2.0                   │
│  • Archive sprint                       │
│                                         │
│  Release Notes (optional):              │
│  ┌─────────────────────────────────┐    │
│  │ Added user authentication      │    │
│  │ Improved button component      │    │
│  │ New user API endpoints         │    │
│  └─────────────────────────────────┘    │
│                                         │
│         [Cancel]  [Complete & Release]  │
└─────────────────────────────────────────┘

System:
  → git checkout main
  → git merge release/1.2.0
  → git tag -a v1.2.0 -m "Release 1.2.0"
  → git push origin main --tags
  → sprint.status = 'complete'
  → sprint.tagName = 'v1.2.0'
  → Trigger rebase check for other active sprints
```

---

## Hotfix Sprint Workflow

### Scenario: Bug in Production (v1.2.0)

```
Timeline:
─────────────────────────────────────────────────────────

Day 1: Sprint 1.2.0 completed and released
Day 2: Sprint 1.3.0 started (in progress)
Day 3: Critical bug discovered in v1.2.0!

┌─────────────────────────────────────────────────────────┐
│                                                         │
│   main ────●────●────●─────────────────●────────►       │
│            │         │                 │                │
│         v1.1.0    v1.2.0            v1.2.1              │
│                      │    (hotfix)    ▲                 │
│                      │       ┌────────┘                 │
│                      │       │                          │
│                      └───●───●                          │
│                          │                              │
│                     hotfix/1.2.1                        │
│                                                         │
│   release/1.3.0 ─────●────●────●────► (rebased)         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Hotfix Creation

```
User Action: "New Hotfix Sprint"
─────────────────────────────────────────────────────────

┌─────────────────────────────────────────┐
│       Create Hotfix Sprint              │
├─────────────────────────────────────────┤
│                                         │
│  Base Version: [v1.2.0 ▼]               │
│  (Currently in production)              │
│                                         │
│  Hotfix Version: [1.2.1      ]          │
│  Auto-incremented patch                 │
│                                         │
│  Name: [Hotfix 1.2.1 - Auth Bug]        │
│                                         │
│         [Cancel]  [Create Hotfix]       │
└─────────────────────────────────────────┘

System:
  → sprint.type = 'hotfix'
  → sprint.baseVersion = '1.2.0'
  → sprint.version = '1.2.1'
```

### Hotfix Completion & Rebase

```
After hotfix completes:
─────────────────────────────────────────────────────────

System:
  → git checkout main
  → git merge hotfix/1.2.1
  → git tag v1.2.1
  → git push origin main --tags

Check for active sprints:
  → Found: Sprint 1.3.0 (active)
  → Sprint 1.3.0 is behind main

Notification:
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Hotfix v1.2.1 merged to main                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Sprint 1.3.0 needs to incorporate the hotfix.         │
│                                                         │
│  Options:                                               │
│  ○ Rebase now (recommended)                             │
│    AI will rebase release/1.3.0 onto main               │
│                                                         │
│  ○ Rebase later                                         │
│    Continue working, rebase before completion           │
│                                                         │
│  ○ Merge main into release/1.3.0                        │
│    Creates merge commit instead of rebasing             │
│                                                         │
│           [Rebase Now]  [Remind Me Later]               │
└─────────────────────────────────────────────────────────┘

On "Rebase Now":
  → Create AI task: "Rebase release/1.3.0 onto main"
  → AI handles conflicts if any
  → Sprint 1.3.0 continues with hotfix included
```

---

## UI Components

### Sprint Sidebar

```
┌─────────────────────────────────┐
│  SPRINTS                    [+] │
├─────────────────────────────────┤
│                                 │
│  ▼ Active                       │
│    ┌───────────────────────┐    │
│    │ ● Sprint 1.3.0       │◄── │
│    │   ████████░░ 60%     │    │
│    │   3/5 tasks          │    │
│    └───────────────────────┘    │
│                                 │
│  ▼ Planning                     │
│    ┌───────────────────────┐    │
│    │ ○ Sprint 1.4.0       │    │
│    │   8 tasks planned    │    │
│    └───────────────────────┘    │
│                                 │
│  ▶ Completed (12)               │
│                                 │
│  ─────────────────────────────  │
│  BACKLOG                        │
│    23 tasks                     │
│    [View Backlog]               │
│                                 │
└─────────────────────────────────┘
```

### Sprint Quick Actions

```
Right-click or ⋮ menu on sprint:
┌─────────────────────────┐
│ Start Sprint            │  (planning only)
│ End Sprint              │  (active only)
│ ─────────────────────── │
│ Add Task                │
│ View Board              │
│ View Branch             │  → opens git UI
│ ─────────────────────── │
│ Rename                  │
│ Change Version          │  (planning only)
│ ─────────────────────── │
│ Cancel Sprint           │
└─────────────────────────┘
```

### Sprint Progress Widget (Dashboard)

```
┌─────────────────────────────────────────────────────────┐
│  Current Sprint: 1.3.0                                 │
│  ══════════════════════════════════════════════════    │
│                                                         │
│  ████████████████████░░░░░░░░░░  65%                   │
│                                                         │
│  Tasks:  ✓ 13 done  │  ▶ 2 running  │  ○ 5 pending     │
│                                                         │
│  Estimated completion: ~4 hours                         │
│                                                         │
│  [View Sprint Board]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Sprint Management

```
POST   /api/projects/{projectId}/sprints
       Create new sprint
       Body: { name, version, type, baseVersion? }

GET    /api/projects/{projectId}/sprints
       List all sprints
       Query: ?status=active,planning&type=release

GET    /api/projects/{projectId}/sprints/{sprintId}
       Get sprint details

PATCH  /api/projects/{projectId}/sprints/{sprintId}
       Update sprint (name, version if planning)
       Body: { name?, version? }

DELETE /api/projects/{projectId}/sprints/{sprintId}
       Cancel/delete sprint
```

### Sprint Lifecycle

```
POST   /api/projects/{projectId}/sprints/{sprintId}/start
       Start sprint (planning → active)
       Creates branch, begins execution

POST   /api/projects/{projectId}/sprints/{sprintId}/end
       End sprint (active → review)
       Body: { pendingTaskAction: 'backlog' | 'next' | 'cancel' }

POST   /api/projects/{projectId}/sprints/{sprintId}/complete
       Complete sprint (review → complete)
       Merges to main, creates tag
       Body: { releaseNotes? }

POST   /api/projects/{projectId}/sprints/{sprintId}/rebase
       Rebase sprint branch onto main
       Used after hotfix
```

### Sprint Tasks

```
POST   /api/projects/{projectId}/sprints/{sprintId}/tasks
       Add task to sprint
       Body: { taskId, order? }

DELETE /api/projects/{projectId}/sprints/{sprintId}/tasks/{taskId}
       Remove task from sprint (back to backlog)

PATCH  /api/projects/{projectId}/sprints/{sprintId}/tasks/reorder
       Reorder tasks in sprint
       Body: { taskIds: string[] }
```

### WebSocket Events

```typescript
// Sprint status updates
'sprint.{projectId}.started'      // Sprint began
'sprint.{projectId}.progress'     // Task completed in sprint
'sprint.{projectId}.ended'        // Sprint ended
'sprint.{projectId}.completed'    // Sprint merged and tagged

// Rebase notifications
'sprint.{projectId}.rebase_needed'   // Hotfix merged, rebase required
'sprint.{projectId}.rebase_complete' // Rebase finished
```

---

## Integration with Branching Model

### Branch Naming Convention

```
Sprint Type     Branch Pattern          Example
───────────     ──────────────          ───────
release         release/{version}       release/1.3.0
hotfix          hotfix/{version}        hotfix/1.2.1

Task branches (within sprint):
                feature/{task-id}       feature/task-abc123

Subtask branches (within task):
                feature/{task-id}/{n}   feature/task-abc123/1
```

### Git Flow Integration

```
                    main
                      │
         ┌────────────┼────────────┐
         │            │            │
      v1.2.0       v1.2.1       v1.3.0
         │            │            │
         │       hotfix/1.2.1      │
         │                         │
    release/1.2.0            release/1.3.0
         │                         │
    ┌────┴────┐              ┌─────┴─────┐
    │         │              │           │
 feature/  feature/       feature/   feature/
 task-1    task-2         task-5     task-6
    │         │              │           │
 Sprint    Sprint         Sprint     Sprint
 1.2.0     1.2.0          1.3.0      1.3.0
```

### Merge Strategy

```
1. Task completes:
   feature/{task-id} → release/{version}
   (Fast-forward or merge commit)

2. Sprint completes:
   release/{version} → main
   (Merge commit with release notes)

3. Hotfix completes:
   hotfix/{version} → main
   (Merge commit)

4. Post-hotfix:
   Active release branches rebase onto main
   (Or merge main into release)
```

---

## Migration Path

### Phase 1: Database & Backend

1. Create `sprints` table
2. Add `sprint_id` column to tasks
3. Create Sprint service (`sprint-service.ts`)
4. Add Sprint API endpoints
5. Add WebSocket events for sprint status

### Phase 2: UI - Basic Sprint Management

1. Add Sprint sidebar component
2. Create Sprint creation modal
3. Build Sprint planning view (drag/drop)
4. Add Sprint quick actions menu

### Phase 3: Sprint Execution Integration

1. Modify task executor to use sprint branch
2. Add sprint progress tracking
3. Build Sprint board view
4. Implement start/end/complete workflows

### Phase 4: Hotfix Support

1. Add hotfix sprint type
2. Implement base version selection
3. Build rebase notification system
4. Add AI-driven rebase task creation

### Phase 5: Polish

1. Sprint dashboard widget
2. Sprint history/archive view
3. Release notes generation
4. Sprint analytics/metrics

---

## Configuration Options

```typescript
interface SprintConfig {
  // Auto-versioning
  autoIncrementVersion: boolean;     // Suggest next version automatically
  versioningScheme: 'semver' | 'date' | 'custom';

  // Execution
  parallelTaskExecution: boolean;    // Run multiple tasks at once
  maxParallelTasks: number;          // Limit concurrent tasks

  // Completion
  requireAllTasksComplete: boolean;  // Block end if tasks pending
  autoMoveIncomplete: 'backlog' | 'next' | 'ask';

  // Hotfix
  autoRebaseAfterHotfix: boolean;    // Auto-trigger rebase
  rebaseStrategy: 'rebase' | 'merge';

  // Notifications
  notifyOnSprintComplete: boolean;
  notifyOnRebaseNeeded: boolean;
}
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Merge conflicts during sprint | AI conflict resolution task (see Branching Proposal) |
| Hotfix delays active sprint | Parallel execution - hotfix doesn't block planning |
| Version collision | Unique constraint on (project_id, version) |
| Orphaned tasks after cancel | Move to backlog, never delete |
| Rebase breaks feature branches | Rebase entire sprint branch, not individual features |

---

## Open Questions

1. **Sprint duration limits?** Should we enforce max sprint duration or leave flexible?
2. **Approval workflows?** Should sprint completion require explicit approval?
3. **Sprint templates?** Pre-defined task sets for common sprint types?
4. **Cross-project sprints?** Tasks from multiple projects in one sprint?

---

## Appendix: State Machine

```
                    ┌──────────────┐
                    │              │
          ┌─────────│   PLANNING   │◄────────┐
          │         │              │         │
          │         └──────┬───────┘         │
          │                │                 │
          │         [Start Sprint]           │
          │                │                 │
          │                ▼                 │
          │         ┌──────────────┐         │
          │         │              │         │
   [Cancel Sprint]  │    ACTIVE    │  [Back to Active]
          │         │              │         │
          │         └──────┬───────┘         │
          │                │                 │
          │         [End Sprint]             │
          │                │                 │
          │                ▼                 │
          │         ┌──────────────┐         │
          │         │              │─────────┘
          │         │    REVIEW    │
          │         │              │
          │         └──────┬───────┘
          │                │
          │      [Complete Sprint]
          │                │
          │                ▼
          │         ┌──────────────┐
          └────────►│              │
                    │  COMPLETE /  │
                    │  CANCELLED   │
                    │              │
                    └──────────────┘
```

---

**Document Version:** 1.0.0
**Created:** 2025-01-25
**Status:** Draft - Ready for Review
