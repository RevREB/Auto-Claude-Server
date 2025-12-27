# State Management Proposal

## Overview

This document describes the state management architecture for Auto Claude Server, covering:

- SQLite database as the single source of truth
- Hidden git ref (`refs/auto-claude/state`) for state sync and backup
- Migration from flat JSON files to structured storage
- Multi-machine sync via git push/pull
- Fork and clone behavior

---

## Design Philosophy

### Why SQLite Over Flat Files?

The original implementation stored task state in JSON files within each project's `.auto-claude/` directory:

```
project/
  .auto-claude/
    tasks.json
    specs/
      task-abc123/
        spec.md
        task.md
        implementation_plan.json
        requirements.json
        context.json
        complexity_assessment.json
        review_state.json
        qa_report.md
        init.sh
        build-progress.txt
        task_logs.json
        memory/
          ...
```

**Problems with flat files:**

| Issue | Impact |
|-------|--------|
| No transactions | Partial writes on crash = corrupted state |
| No query capability | Load everything to find one task |
| No relationships | Manual sync between tasks.json and spec files |
| Merge conflicts | Git can't merge JSON intelligently |
| Size limits | Large task logs bloat the repo |
| Performance | File I/O for every operation |

**SQLite advantages:**

| Benefit | Description |
|---------|-------------|
| ACID transactions | Atomic writes, crash recovery |
| SQL queries | Find tasks by status, date, project |
| Foreign keys | Enforce referential integrity |
| Single file | One `.db` file, easy backup |
| Concurrent access | Multiple readers, serialized writes |
| Battle-tested | Billions of deployments |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Auto Claude Server                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  SQLite Database (/root/.claude/auto-claude.db)                   │   │
│  │  ═══════════════════════════════════════════════════════════════  │   │
│  │  SINGLE SOURCE OF TRUTH                                           │   │
│  │                                                                    │   │
│  │  Tables:                                                          │   │
│  │  • projects - Project configuration and settings                  │   │
│  │  • tasks - Task metadata and status                               │   │
│  │  • specs - Full spec content (markdown, plans, logs)              │   │
│  │  • profiles - Claude account profiles                             │   │
│  │  • settings - Global key-value settings                           │   │
│  │  • tab_state - UI state persistence                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                          │                                               │
│                          │ Export on change                              │
│                          ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Git State Manager                                                │   │
│  │  ────────────────────────────────────────────────────────────────  │   │
│  │  Exports database state to hidden git ref for:                    │   │
│  │  • Backup (survives container restarts)                           │   │
│  │  • Sync across machines (push/pull)                               │   │
│  │  • Recovery when cloning projects                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                          │                                               │
│                          ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Hidden Git Ref: refs/auto-claude/state                          │   │
│  │  ────────────────────────────────────────────────────────────────  │   │
│  │  NOT a branch - doesn't appear in `git branch` or GitHub UI      │   │
│  │                                                                    │   │
│  │  Contents (committed as tree):                                    │   │
│  │  .auto-claude-state/                                              │   │
│  │    tasks.json          - Task list and metadata                   │   │
│  │    specs/                                                          │   │
│  │      {task-id}/                                                   │   │
│  │        spec.md         - Task specification                       │   │
│  │        task.md         - Task implementation notes                │   │
│  │        plan.json       - Implementation plan                      │   │
│  │        ...                                                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Projects Table

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    auto_build_path TEXT,
    main_branch TEXT DEFAULT 'main',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- JSON columns for flexible data
    settings JSON,           -- Project settings including claudeSettings
    project_index JSON,      -- File analysis index
    insights_sessions JSON,  -- AI insights history
    file_timelines JSON      -- File change tracking
);
```

### Tasks Table

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,              -- Same as spec_id
    spec_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',    -- pending, in_progress, completed, failed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    worktree_branch TEXT,             -- Feature branch name
    archived INTEGER DEFAULT 0,
    archived_version TEXT,
    extra_data JSON,                  -- Extensible metadata

    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### Specs Table

```sql
CREATE TABLE specs (
    id TEXT PRIMARY KEY,              -- Same as task_id
    task_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Content fields (previously separate files)
    spec_markdown TEXT,               -- was spec.md
    task_markdown TEXT,               -- was task.md
    implementation_plan JSON,         -- was implementation_plan.json
    requirements JSON,                -- was requirements.json
    context JSON,                     -- was context.json
    complexity_assessment JSON,       -- was complexity_assessment.json
    review_state JSON,                -- was review_state.json
    qa_report TEXT,                   -- was qa_report.md
    init_script TEXT,                 -- was init.sh
    build_progress TEXT,              -- was build-progress.txt
    task_logs JSON,                   -- was task_logs.json (can be large)
    project_index JSON,               -- was project_index.json
    memory JSON,                      -- was memory/*.json

    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

### Profiles Table

```sql
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    is_authenticated INTEGER DEFAULT 0,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Usage tracking
    daily_usage_percent INTEGER DEFAULT 0,
    weekly_usage_percent INTEGER DEFAULT 0,
    monthly_usage_percent INTEGER DEFAULT 0,
    last_usage_update DATETIME,

    -- Credentials (should be encrypted in production)
    credentials JSON
);
```

### Settings Table

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSON,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Hidden Git Ref Mechanism

### What is `refs/auto-claude/state`?

A **hidden ref** is a git reference that:
- Does NOT appear in `git branch` output
- Does NOT show in GitHub's branch dropdown
- Cannot be accidentally merged or checked out
- Persists across clones (when explicitly fetched)

```bash
# Regular branches live here:
refs/heads/main
refs/heads/feature/task-123

# Tags live here:
refs/tags/v1.0.0

# Our hidden ref lives here:
refs/auto-claude/state    # ← NOT under refs/heads/
```

### Why a Hidden Ref?

| Alternative | Problem |
|-------------|---------|
| Regular branch (`auto-claude-state`) | Shows in branch list, can be merged, causes confusion |
| Untracked files | Lost on clone, no sync capability |
| Separate repo | Extra complexity, auth issues |
| External service | Network dependency, cost |

The hidden ref gives us git's distribution model without polluting the branch namespace.

### Creating the State Ref

```python
def init_state_ref(self) -> bool:
    """Initialize the hidden state ref."""

    # Create initial state in temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        state_dir = Path(tmpdir) / ".auto-claude-state"
        state_dir.mkdir()

        # Write initial state files
        initial_state = {
            "version": "1.0.0",
            "created_at": datetime.now().isoformat(),
            "tasks": []
        }
        (state_dir / "tasks.json").write_text(json.dumps(initial_state))

        # Create git tree from temp directory
        # Using git plumbing commands (not porcelain)
        tree_hash = create_tree_from_dir(tmpdir)
        commit_hash = create_commit(tree_hash, "Initial state")

        # Point ref at commit
        git("update-ref", STATE_REF, commit_hash)
```

### Exporting State to Git

When task state changes, export database to git:

```python
def export_state(self) -> bool:
    """Export current database state to git ref."""

    with tempfile.TemporaryDirectory() as tmpdir:
        state_dir = Path(tmpdir) / ".auto-claude-state"
        state_dir.mkdir()

        # Export tasks
        tasks = TaskService.get_all_for_project(self.project_id)
        tasks_data = [t.to_dict() for t in tasks]
        (state_dir / "tasks.json").write_text(json.dumps({
            "version": "1.0.0",
            "exported_at": datetime.now().isoformat(),
            "tasks": tasks_data
        }))

        # Export specs
        specs_dir = state_dir / "specs"
        specs_dir.mkdir()
        for task in tasks:
            spec = SpecService.get_by_id(task.spec_id)
            if spec:
                task_dir = specs_dir / task.id
                task_dir.mkdir()

                if spec.spec_markdown:
                    (task_dir / "spec.md").write_text(spec.spec_markdown)
                if spec.implementation_plan:
                    (task_dir / "plan.json").write_text(
                        json.dumps(spec.implementation_plan)
                    )
                # ... export other fields

        # Create new commit on state ref
        tree_hash = create_tree_from_dir(tmpdir)
        parent = get_current_ref(STATE_REF)
        commit_hash = create_commit(tree_hash, "State export", parent)
        git("update-ref", STATE_REF, commit_hash)
```

### Importing State from Git

When cloning or recovering a project:

```python
def import_state(self) -> bool:
    """Import state from git ref into database."""

    if not self._state_ref_exists():
        return False

    with tempfile.TemporaryDirectory() as tmpdir:
        # Extract state tree to temp directory
        tree_hash = git("rev-parse", f"{STATE_REF}^{{tree}}")
        git("read-tree", "--prefix=", tree_hash)
        git("checkout-index", "-a", f"--prefix={tmpdir}/")

        state_dir = Path(tmpdir) / ".auto-claude-state"

        # Import tasks
        tasks_file = state_dir / "tasks.json"
        if tasks_file.exists():
            data = json.loads(tasks_file.read_text())
            for task_data in data.get("tasks", []):
                TaskService.create_or_update(task_data)

        # Import specs
        specs_dir = state_dir / "specs"
        if specs_dir.exists():
            for task_dir in specs_dir.iterdir():
                spec_data = {}
                if (task_dir / "spec.md").exists():
                    spec_data["spec_markdown"] = (task_dir / "spec.md").read_text()
                if (task_dir / "plan.json").exists():
                    spec_data["implementation_plan"] = json.loads(
                        (task_dir / "plan.json").read_text()
                    )
                # ... import other fields
                SpecService.create_or_update(task_dir.name, spec_data)

    return True
```

---

## Multi-Machine Sync

### Push State to Remote

```python
def push_state(self, remote: str = "origin") -> bool:
    """Push state ref to remote."""
    git("push", remote, f"{STATE_REF}:{STATE_REF}", "--force")
```

### Pull State from Remote

```python
def pull_state(self, remote: str = "origin") -> bool:
    """Pull state ref from remote and import."""
    git("fetch", remote, f"{STATE_REF}:{STATE_REF}")
    return self.import_state()
```

### Sync Flow

```
Machine A                          Remote                          Machine B
─────────                          ──────                          ─────────

1. Edit task                           │
2. Save to DB                          │
3. Export to git                       │
4. Push state ref ──────────────────►  │
                                       │
                                       │  ◄─────────────────── 5. Pull state ref
                                       │                       6. Import to DB
                                       │                       7. UI updates
```

---

## Fork and Clone Behavior

### What Happens on Fork?

When someone forks the repository on GitHub:

| Ref Type | Included in Fork? |
|----------|-------------------|
| `refs/heads/*` (branches) | Yes |
| `refs/tags/*` (tags) | Yes |
| `refs/auto-claude/state` | **No** |

**The hidden state ref is NOT copied to forks.** This is intentional:
- Forkers get a clean slate
- Your task history stays private
- No merge conflicts on state
- Forkers can start their own tasks

### What Happens on Clone?

```bash
# Standard clone - does NOT fetch hidden refs
git clone https://github.com/user/repo.git
# refs/auto-claude/state is NOT present

# Explicit fetch - gets the hidden ref
git fetch origin refs/auto-claude/state:refs/auto-claude/state
# Now refs/auto-claude/state is available locally
```

Auto Claude Server handles this automatically:
1. Clone project
2. Check for state ref on remote
3. If exists, fetch and import
4. If not, start fresh

### Can PRs Include State?

**No.** PRs are based on branch comparisons (`refs/heads/*`). The state ref is outside this namespace and cannot be included in PRs.

This is a feature, not a bug:
- PRs are for code changes
- State is per-user/per-machine
- No state conflicts in PRs

---

## Migration from Flat Files

### Legacy Detection

```python
def has_legacy_state(project_path: str) -> bool:
    """Check if project has old flat-file state."""
    legacy_dir = Path(project_path) / ".auto-claude"
    return (legacy_dir / "tasks.json").exists()
```

### Migration Process

```python
def migrate_legacy_state(project_path: str) -> bool:
    """Migrate from flat files to database."""

    legacy_dir = Path(project_path) / ".auto-claude"

    # 1. Read legacy tasks.json
    tasks_file = legacy_dir / "tasks.json"
    if tasks_file.exists():
        legacy_tasks = json.loads(tasks_file.read_text())
        for task_data in legacy_tasks:
            TaskService.create(task_data)

    # 2. Read legacy spec directories
    specs_dir = legacy_dir / "specs"
    if specs_dir.exists():
        for spec_dir in specs_dir.iterdir():
            if spec_dir.is_dir():
                spec_data = {}

                # Read each legacy file
                for filename, field in LEGACY_FILE_MAP.items():
                    file_path = spec_dir / filename
                    if file_path.exists():
                        content = file_path.read_text()
                        if filename.endswith('.json'):
                            spec_data[field] = json.loads(content)
                        else:
                            spec_data[field] = content

                SpecService.create(spec_dir.name, spec_data)

    # 3. Initialize git state ref
    state_manager = GitStateManager(project_path)
    state_manager.init_state_ref()
    state_manager.export_state()

    # 4. Archive legacy directory (don't delete yet)
    archive_path = legacy_dir.with_suffix('.legacy-backup')
    shutil.move(legacy_dir, archive_path)

    return True
```

### Legacy File Mapping

| Legacy File | Database Field |
|-------------|----------------|
| `spec.md` | `specs.spec_markdown` |
| `task.md` | `specs.task_markdown` |
| `implementation_plan.json` | `specs.implementation_plan` |
| `requirements.json` | `specs.requirements` |
| `context.json` | `specs.context` |
| `complexity_assessment.json` | `specs.complexity_assessment` |
| `review_state.json` | `specs.review_state` |
| `qa_report.md` | `specs.qa_report` |
| `init.sh` | `specs.init_script` |
| `build-progress.txt` | `specs.build_progress` |
| `task_logs.json` | `specs.task_logs` |
| `project_index.json` | `specs.project_index` |

---

## Documentation File

When state is initialized, a documentation file is created in the project:

**`AUTO-CLAUDE-STATE.md`**

```markdown
# Auto-Claude State Management

This project uses Auto-Claude for task management.

## How State Works

- Task state is stored in the Auto-Claude Server database
- Changes are automatically exported to a hidden git ref for backup/sync
- When you clone a project, state is restored automatically
- State syncs across machines when you push/pull

## What is `refs/auto-claude/state`?

This is a **hidden ref** - not a regular branch. It:

- Does NOT appear in `git branch` output
- Does NOT show up in GitHub's branch list
- Cannot be accidentally merged

## DO NOT

- Manually edit or delete this ref
- Try to merge or checkout this ref
- Run git commands against it

**This ref is managed entirely by Auto-Claude. Leave it alone.**
```

---

## API Endpoints

### State Management

```
POST   /api/projects/{id}/state/export    # Export DB to git state
POST   /api/projects/{id}/state/import    # Import git state to DB
POST   /api/projects/{id}/state/push      # Push state to remote
POST   /api/projects/{id}/state/pull      # Pull state from remote
GET    /api/projects/{id}/state/status    # Check state ref status
```

### Example Responses

```json
// GET /api/projects/{id}/state/status
{
  "hasLocalState": true,
  "hasRemoteState": true,
  "localCommit": "abc123...",
  "remoteCommit": "abc123...",
  "inSync": true,
  "lastExport": "2024-12-26T10:30:00Z"
}
```

---

## Security Considerations

### What's Stored in State?

| Data | Stored? | Notes |
|------|---------|-------|
| Task titles/descriptions | Yes | User content |
| Spec markdown | Yes | Implementation details |
| Implementation plans | Yes | Technical plans |
| Task logs | Yes | Can contain sensitive output |
| API keys | **No** | Never exported |
| Credentials | **No** | Never exported |
| User emails | **No** | Never exported |

### Recommendations

1. **Private repos for sensitive projects** - State contains task details
2. **Don't push state to public repos** - Task logs may contain secrets
3. **Use per-project credentials** - Don't share Claude auth across projects
4. **Audit before making repo public** - Check state ref contents

---

## Future Enhancements

### Conflict Resolution

When pulling state with local changes:

```python
def pull_with_merge(self) -> MergeResult:
    """Pull remote state and merge with local changes."""

    local_state = self.read_local_state()
    remote_state = self.fetch_remote_state()

    # Compare and merge
    merged = merge_states(local_state, remote_state)

    if merged.conflicts:
        return MergeResult(
            success=False,
            conflicts=merged.conflicts,
            message="Manual resolution required"
        )

    self.write_state(merged.result)
    return MergeResult(success=True)
```

### State Encryption

For sensitive projects:

```python
def export_encrypted(self, key: bytes) -> bool:
    """Export state with encryption."""

    state_data = self.collect_state()
    encrypted = encrypt(json.dumps(state_data), key)

    # Store encrypted blob instead of plain files
    self.write_encrypted_state(encrypted)
```

### Selective Sync

Choose what to sync:

```yaml
# .auto-claude/sync-config.yaml
sync:
  tasks: true
  specs: true
  logs: false        # Don't sync large logs
  memory: false      # Keep memory local
```

---

## Success Metrics

1. **Zero data loss** - Database transactions prevent corruption
2. **Seamless sync** - State available on any machine after pull
3. **Clean forks** - Forkers start fresh without inherited state
4. **No merge conflicts** - Hidden ref stays out of normal git workflow
5. **Fast queries** - SQL queries vs file system scans

---

## References

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Git Internals - Plumbing Commands](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Git References](https://git-scm.com/book/en/v2/Git-Internals-Git-References)

---

*Document Version: 1.0.0*
*Last Updated: December 2024*
*Status: Implemented*
*Authors: Auto-Claude Development Team*
