"""
SQLite database layer for Auto Claude.

Replaces flat JSON file storage with proper database storage.
Uses SQLAlchemy with async SQLite support.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from sqlalchemy import create_engine, Column, String, Text, DateTime, Boolean, Integer, JSON, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.pool import StaticPool

# Database file location
DB_PATH = Path("/root/.claude/auto-claude.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine with check_same_thread=False for SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False  # Set to True for SQL debugging
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# =============================================================================
# Models
# =============================================================================

class ProjectModel(Base):
    """Project configuration model."""
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    auto_build_path = Column(String, nullable=True)
    main_branch = Column(String, default="main")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Settings stored as JSON (includes claudeSettings)
    settings = Column(JSON, default=dict)

    # Project-level data (previously flat files in .auto-claude/)
    project_index = Column(JSON, nullable=True)  # was project_index.json
    insights_sessions = Column(JSON, nullable=True)  # was insights_sessions.json
    file_timelines = Column(JSON, nullable=True)  # was file-timelines/*.json

    # Relationships
    tasks = relationship("TaskModel", back_populates="project", cascade="all, delete-orphan")

    def to_dict(self, include_data: bool = False) -> dict:
        result = {
            "id": self.id,
            "name": self.name,
            "path": self.path,
            "autoBuildPath": self.auto_build_path,
            "mainBranch": self.main_branch,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "settings": self.settings or {},
        }
        if include_data:
            result["projectIndex"] = self.project_index
            result["insightsSessions"] = self.insights_sessions
            result["fileTimelines"] = self.file_timelines
        return result


class TaskModel(Base):
    """Task model."""
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)  # Same as spec_id
    spec_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Additional fields
    worktree_branch = Column(String, nullable=True)
    archived = Column(Boolean, default=False)
    archived_version = Column(String, nullable=True)

    # Extra data stored as JSON
    extra_data = Column(JSON, default=dict)

    # Relationships
    project = relationship("ProjectModel", back_populates="tasks")
    spec = relationship("SpecModel", back_populates="task", uselist=False, cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "specId": self.spec_id,
            "projectId": self.project_id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "worktreeBranch": self.worktree_branch,
            "archived": self.archived,
            "archivedVersion": self.archived_version,
            "metadata": self.extra_data or {},
        }


class SpecModel(Base):
    """Spec data model - stores all task specification and execution data."""
    __tablename__ = "specs"

    id = Column(String, primary_key=True)  # Same as task_id
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Spec content (was spec.md)
    spec_markdown = Column(Text, nullable=True)

    # Task content (was task.md)
    task_markdown = Column(Text, nullable=True)

    # Implementation plan (was implementation_plan.json)
    implementation_plan = Column(JSON, nullable=True)

    # Requirements (was requirements.json)
    requirements = Column(JSON, nullable=True)

    # Context (was context.json)
    context = Column(JSON, nullable=True)

    # Complexity assessment (was complexity_assessment.json)
    complexity_assessment = Column(JSON, nullable=True)

    # Review state (was review_state.json)
    review_state = Column(JSON, nullable=True)

    # QA report (was qa_report.md)
    qa_report = Column(Text, nullable=True)

    # Init script (was init.sh)
    init_script = Column(Text, nullable=True)

    # Build progress (was build-progress.txt)
    build_progress = Column(Text, nullable=True)

    # Task logs (was task_logs.json) - can be large
    task_logs = Column(JSON, nullable=True)

    # Project index (was project_index.json)
    project_index = Column(JSON, nullable=True)

    # Memory data (was memory/*.json and memory/*.md)
    memory = Column(JSON, nullable=True)

    # Relationship
    task = relationship("TaskModel", back_populates="spec")

    def to_dict(self, include_logs: bool = False) -> dict:
        result = {
            "id": self.id,
            "taskId": self.task_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "specMarkdown": self.spec_markdown,
            "taskMarkdown": self.task_markdown,
            "implementationPlan": self.implementation_plan,
            "requirements": self.requirements,
            "context": self.context,
            "complexityAssessment": self.complexity_assessment,
            "reviewState": self.review_state,
            "qaReport": self.qa_report,
            "initScript": self.init_script,
            "buildProgress": self.build_progress,
            "projectIndex": self.project_index,
            "memory": self.memory,
        }
        if include_logs:
            result["taskLogs"] = self.task_logs
        return result


class ProfileModel(Base):
    """Claude profile model for multi-account support."""
    __tablename__ = "profiles"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=False)
    is_authenticated = Column(Boolean, default=False)
    email = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage tracking
    daily_usage_percent = Column(Integer, default=0)
    weekly_usage_percent = Column(Integer, default=0)
    monthly_usage_percent = Column(Integer, default=0)
    last_usage_update = Column(DateTime, nullable=True)

    # Credentials stored as JSON (encrypted in production)
    credentials = Column(JSON, default=dict)

    def to_dict(self, include_credentials: bool = False) -> dict:
        result = {
            "id": self.id,
            "name": self.name,
            "isActive": self.is_active,
            "isAuthenticated": self.is_authenticated,
            "email": self.email,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "dailyUsagePercent": self.daily_usage_percent,
            "weeklyUsagePercent": self.weekly_usage_percent,
            "monthlyUsagePercent": self.monthly_usage_percent,
            "lastUsageUpdate": self.last_usage_update.isoformat() if self.last_usage_update else None,
        }
        if include_credentials:
            result["credentials"] = self.credentials
        return result


class SettingModel(Base):
    """Key-value settings model."""
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TabStateModel(Base):
    """UI tab state model."""
    __tablename__ = "tab_state"

    id = Column(Integer, primary_key=True, default=1)
    open_project_ids = Column(JSON, default=list)
    active_project_id = Column(String, nullable=True)
    tab_order = Column(JSON, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "openProjectIds": self.open_project_ids or [],
            "activeProjectId": self.active_project_id,
            "tabOrder": self.tab_order or [],
        }


# =============================================================================
# Database Initialization
# =============================================================================

def init_db():
    """Initialize the database and create tables."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)

    # Run schema migrations for existing databases
    _run_migrations()

    print(f"[Database] Initialized SQLite database at {DB_PATH}")


def _run_migrations():
    """Run schema migrations for existing databases."""
    from sqlalchemy import text, inspect

    with get_db_session() as db:
        inspector = inspect(engine)

        # Check if projects table exists
        if 'projects' in inspector.get_table_names():
            existing_columns = {col['name'] for col in inspector.get_columns('projects')}

            # Add new project columns if they don't exist
            new_columns = [
                ('project_index', 'JSON'),
                ('insights_sessions', 'JSON'),
                ('file_timelines', 'JSON'),
            ]

            for col_name, col_type in new_columns:
                if col_name not in existing_columns:
                    try:
                        db.execute(text(f'ALTER TABLE projects ADD COLUMN {col_name} {col_type}'))
                        db.commit()
                        print(f"[Database] Added column: projects.{col_name}")
                    except Exception as e:
                        print(f"[Database] Migration warning for {col_name}: {e}")


def get_db():
    """Get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class get_db_session:
    """Context manager for database sessions."""
    def __init__(self):
        self.db = None

    def __enter__(self):
        self.db = SessionLocal()
        return self.db

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.db:
            self.db.close()
        return False


# =============================================================================
# Project Service
# =============================================================================

class ProjectService:
    """Service for project database operations."""

    @staticmethod
    def get_all() -> List[dict]:
        """Get all projects."""
        with get_db_session() as db:
            projects = db.query(ProjectModel).all()
            return [p.to_dict() for p in projects]

    @staticmethod
    def get_by_id(project_id: str) -> Optional[dict]:
        """Get project by ID."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            return project.to_dict() if project else None

    @staticmethod
    def create(project_data: dict) -> dict:
        """Create a new project."""
        with get_db_session() as db:
            project = ProjectModel(
                id=project_data["id"],
                name=project_data["name"],
                path=project_data["path"],
                auto_build_path=project_data.get("autoBuildPath"),
                main_branch=project_data.get("mainBranch", "main"),
                settings=project_data.get("settings", {}),
            )
            db.add(project)
            db.commit()
            db.refresh(project)
            return project.to_dict()

    @staticmethod
    def update(project_id: str, updates: dict) -> Optional[dict]:
        """Update a project."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            if not project:
                return None

            if "name" in updates:
                project.name = updates["name"]
            if "path" in updates:
                project.path = updates["path"]
            if "autoBuildPath" in updates:
                project.auto_build_path = updates["autoBuildPath"]
            if "mainBranch" in updates:
                project.main_branch = updates["mainBranch"]
            if "settings" in updates:
                project.settings = {**(project.settings or {}), **updates["settings"]}
            if "projectIndex" in updates:
                project.project_index = updates["projectIndex"]
            if "insightsSessions" in updates:
                project.insights_sessions = updates["insightsSessions"]
            if "fileTimelines" in updates:
                project.file_timelines = updates["fileTimelines"]

            db.commit()
            db.refresh(project)
            return project.to_dict()

    @staticmethod
    def get_project_index(project_id: str) -> Optional[dict]:
        """Get project index data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            return project.project_index if project else None

    @staticmethod
    def save_project_index(project_id: str, index: dict) -> bool:
        """Save project index data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            if not project:
                return False
            project.project_index = index
            db.commit()
            return True

    @staticmethod
    def get_insights_sessions(project_id: str) -> Optional[dict]:
        """Get insights sessions data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            return project.insights_sessions if project else None

    @staticmethod
    def save_insights_sessions(project_id: str, sessions: dict) -> bool:
        """Save insights sessions data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            if not project:
                return False
            project.insights_sessions = sessions
            db.commit()
            return True

    @staticmethod
    def get_file_timelines(project_id: str) -> Optional[dict]:
        """Get file timelines data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            return project.file_timelines if project else None

    @staticmethod
    def save_file_timelines(project_id: str, timelines: dict) -> bool:
        """Save file timelines data."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            if not project:
                return False
            project.file_timelines = timelines
            db.commit()
            return True

    @staticmethod
    def delete(project_id: str) -> bool:
        """Delete a project."""
        with get_db_session() as db:
            project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
            if not project:
                return False
            db.delete(project)
            db.commit()
            return True


# =============================================================================
# Task Service
# =============================================================================

class TaskService:
    """Service for task database operations."""

    @staticmethod
    def get_all(project_id: Optional[str] = None, include_archived: bool = False) -> List[dict]:
        """Get all tasks, optionally filtered by project."""
        with get_db_session() as db:
            query = db.query(TaskModel)
            if project_id:
                query = query.filter(TaskModel.project_id == project_id)
            if not include_archived:
                query = query.filter(TaskModel.archived == False)
            tasks = query.all()
            return [t.to_dict() for t in tasks]

    @staticmethod
    def get_by_id(task_id: str) -> Optional[dict]:
        """Get task by ID."""
        with get_db_session() as db:
            task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
            return task.to_dict() if task else None

    @staticmethod
    def create(task_data: dict) -> dict:
        """Create a new task."""
        with get_db_session() as db:
            task = TaskModel(
                id=task_data["id"],
                spec_id=task_data.get("specId", task_data["id"]),
                project_id=task_data["projectId"],
                title=task_data["title"],
                description=task_data.get("description"),
                status=task_data.get("status", "pending"),
                worktree_branch=task_data.get("worktreeBranch"),
                extra_data=task_data.get("metadata", {}),
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            return task.to_dict()

    @staticmethod
    def update(task_id: str, updates: dict) -> Optional[dict]:
        """Update a task."""
        with get_db_session() as db:
            task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
            if not task:
                return None

            if "title" in updates:
                task.title = updates["title"]
            if "description" in updates:
                task.description = updates["description"]
            if "status" in updates:
                task.status = updates["status"]
            if "worktreeBranch" in updates:
                task.worktree_branch = updates["worktreeBranch"]
            if "archived" in updates:
                task.archived = updates["archived"]
            if "archivedVersion" in updates:
                task.archived_version = updates["archivedVersion"]
            if "metadata" in updates:
                task.extra_data = {**(task.extra_data or {}), **updates["metadata"]}

            db.commit()
            db.refresh(task)
            return task.to_dict()

    @staticmethod
    def delete(task_id: str) -> bool:
        """Delete a task."""
        with get_db_session() as db:
            task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
            if not task:
                return False
            db.delete(task)
            db.commit()
            return True

    @staticmethod
    def archive(task_ids: List[str], version: Optional[str] = None) -> int:
        """Archive multiple tasks."""
        with get_db_session() as db:
            count = db.query(TaskModel).filter(TaskModel.id.in_(task_ids)).update(
                {"archived": True, "archived_version": version},
                synchronize_session=False
            )
            db.commit()
            return count

    @staticmethod
    def unarchive(task_ids: List[str]) -> int:
        """Unarchive multiple tasks."""
        with get_db_session() as db:
            count = db.query(TaskModel).filter(TaskModel.id.in_(task_ids)).update(
                {"archived": False, "archived_version": None},
                synchronize_session=False
            )
            db.commit()
            return count


# =============================================================================
# Spec Service
# =============================================================================

class SpecService:
    """Service for spec data database operations."""

    @staticmethod
    def get_by_id(spec_id: str, include_logs: bool = False) -> Optional[dict]:
        """Get spec by ID."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.id == spec_id).first()
            return spec.to_dict(include_logs) if spec else None

    @staticmethod
    def get_by_task_id(task_id: str, include_logs: bool = False) -> Optional[dict]:
        """Get spec by task ID."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.task_id == task_id).first()
            return spec.to_dict(include_logs) if spec else None

    @staticmethod
    def create(spec_data: dict) -> dict:
        """Create a new spec."""
        with get_db_session() as db:
            spec = SpecModel(
                id=spec_data["id"],
                task_id=spec_data.get("taskId", spec_data["id"]),
                spec_markdown=spec_data.get("specMarkdown"),
                task_markdown=spec_data.get("taskMarkdown"),
                implementation_plan=spec_data.get("implementationPlan"),
                requirements=spec_data.get("requirements"),
                context=spec_data.get("context"),
                complexity_assessment=spec_data.get("complexityAssessment"),
                review_state=spec_data.get("reviewState"),
                qa_report=spec_data.get("qaReport"),
                init_script=spec_data.get("initScript"),
                build_progress=spec_data.get("buildProgress"),
                task_logs=spec_data.get("taskLogs"),
                project_index=spec_data.get("projectIndex"),
                memory=spec_data.get("memory"),
            )
            db.add(spec)
            db.commit()
            db.refresh(spec)
            return spec.to_dict()

    @staticmethod
    def update(spec_id: str, updates: dict) -> Optional[dict]:
        """Update a spec."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.id == spec_id).first()
            if not spec:
                return None

            if "specMarkdown" in updates:
                spec.spec_markdown = updates["specMarkdown"]
            if "taskMarkdown" in updates:
                spec.task_markdown = updates["taskMarkdown"]
            if "implementationPlan" in updates:
                spec.implementation_plan = updates["implementationPlan"]
            if "requirements" in updates:
                spec.requirements = updates["requirements"]
            if "context" in updates:
                spec.context = updates["context"]
            if "complexityAssessment" in updates:
                spec.complexity_assessment = updates["complexityAssessment"]
            if "reviewState" in updates:
                spec.review_state = updates["reviewState"]
            if "qaReport" in updates:
                spec.qa_report = updates["qaReport"]
            if "initScript" in updates:
                spec.init_script = updates["initScript"]
            if "buildProgress" in updates:
                spec.build_progress = updates["buildProgress"]
            if "taskLogs" in updates:
                spec.task_logs = updates["taskLogs"]
            if "projectIndex" in updates:
                spec.project_index = updates["projectIndex"]
            if "memory" in updates:
                spec.memory = updates["memory"]

            db.commit()
            db.refresh(spec)
            return spec.to_dict()

    @staticmethod
    def upsert(spec_id: str, updates: dict) -> dict:
        """Create or update a spec."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.id == spec_id).first()
            if spec:
                # Update existing
                if "specMarkdown" in updates:
                    spec.spec_markdown = updates["specMarkdown"]
                if "taskMarkdown" in updates:
                    spec.task_markdown = updates["taskMarkdown"]
                if "implementationPlan" in updates:
                    spec.implementation_plan = updates["implementationPlan"]
                if "requirements" in updates:
                    spec.requirements = updates["requirements"]
                if "context" in updates:
                    spec.context = updates["context"]
                if "complexityAssessment" in updates:
                    spec.complexity_assessment = updates["complexityAssessment"]
                if "reviewState" in updates:
                    spec.review_state = updates["reviewState"]
                if "qaReport" in updates:
                    spec.qa_report = updates["qaReport"]
                if "initScript" in updates:
                    spec.init_script = updates["initScript"]
                if "buildProgress" in updates:
                    spec.build_progress = updates["buildProgress"]
                if "taskLogs" in updates:
                    spec.task_logs = updates["taskLogs"]
                if "projectIndex" in updates:
                    spec.project_index = updates["projectIndex"]
                if "memory" in updates:
                    spec.memory = updates["memory"]
            else:
                # Create new
                spec = SpecModel(
                    id=spec_id,
                    task_id=updates.get("taskId", spec_id),
                    spec_markdown=updates.get("specMarkdown"),
                    task_markdown=updates.get("taskMarkdown"),
                    implementation_plan=updates.get("implementationPlan"),
                    requirements=updates.get("requirements"),
                    context=updates.get("context"),
                    complexity_assessment=updates.get("complexityAssessment"),
                    review_state=updates.get("reviewState"),
                    qa_report=updates.get("qaReport"),
                    init_script=updates.get("initScript"),
                    build_progress=updates.get("buildProgress"),
                    task_logs=updates.get("taskLogs"),
                    project_index=updates.get("projectIndex"),
                    memory=updates.get("memory"),
                )
                db.add(spec)

            db.commit()
            db.refresh(spec)
            return spec.to_dict()

    @staticmethod
    def append_log(spec_id: str, log_entry: dict) -> bool:
        """Append a log entry to the task logs."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.id == spec_id).first()
            if not spec:
                return False

            logs = spec.task_logs or []
            logs.append(log_entry)
            spec.task_logs = logs
            db.commit()
            return True

    @staticmethod
    def delete(spec_id: str) -> bool:
        """Delete a spec."""
        with get_db_session() as db:
            spec = db.query(SpecModel).filter(SpecModel.id == spec_id).first()
            if not spec:
                return False
            db.delete(spec)
            db.commit()
            return True


# =============================================================================
# Profile Service
# =============================================================================

class ProfileService:
    """Service for Claude profile database operations."""

    @staticmethod
    def get_all(include_credentials: bool = False) -> List[dict]:
        """Get all profiles."""
        with get_db_session() as db:
            profiles = db.query(ProfileModel).all()
            return [p.to_dict(include_credentials) for p in profiles]

    @staticmethod
    def get_by_id(profile_id: str, include_credentials: bool = False) -> Optional[dict]:
        """Get profile by ID."""
        with get_db_session() as db:
            profile = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
            return profile.to_dict(include_credentials) if profile else None

    @staticmethod
    def get_active() -> Optional[dict]:
        """Get the currently active profile."""
        with get_db_session() as db:
            profile = db.query(ProfileModel).filter(ProfileModel.is_active == True).first()
            return profile.to_dict() if profile else None

    @staticmethod
    def create(profile_data: dict) -> dict:
        """Create a new profile."""
        with get_db_session() as db:
            profile = ProfileModel(
                id=profile_data["id"],
                name=profile_data["name"],
                is_active=profile_data.get("isActive", False),
                is_authenticated=profile_data.get("isAuthenticated", False),
                email=profile_data.get("email"),
                credentials=profile_data.get("credentials", {}),
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
            return profile.to_dict()

    @staticmethod
    def update(profile_id: str, updates: dict) -> Optional[dict]:
        """Update a profile."""
        with get_db_session() as db:
            profile = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
            if not profile:
                return None

            if "name" in updates:
                profile.name = updates["name"]
            if "isActive" in updates:
                profile.is_active = updates["isActive"]
            if "isAuthenticated" in updates:
                profile.is_authenticated = updates["isAuthenticated"]
            if "email" in updates:
                profile.email = updates["email"]
            if "credentials" in updates:
                profile.credentials = updates["credentials"]
            if "dailyUsagePercent" in updates:
                profile.daily_usage_percent = updates["dailyUsagePercent"]
            if "weeklyUsagePercent" in updates:
                profile.weekly_usage_percent = updates["weeklyUsagePercent"]
            if "monthlyUsagePercent" in updates:
                profile.monthly_usage_percent = updates["monthlyUsagePercent"]
            if "lastUsageUpdate" in updates:
                profile.last_usage_update = updates["lastUsageUpdate"]

            db.commit()
            db.refresh(profile)
            return profile.to_dict()

    @staticmethod
    def set_active(profile_id: str) -> bool:
        """Set a profile as active (deactivates others)."""
        with get_db_session() as db:
            # Deactivate all profiles
            db.query(ProfileModel).update({"is_active": False}, synchronize_session=False)
            # Activate the specified profile
            result = db.query(ProfileModel).filter(ProfileModel.id == profile_id).update(
                {"is_active": True}, synchronize_session=False
            )
            db.commit()
            return result > 0

    @staticmethod
    def delete(profile_id: str) -> bool:
        """Delete a profile."""
        with get_db_session() as db:
            profile = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
            if not profile:
                return False
            db.delete(profile)
            db.commit()
            return True


# =============================================================================
# Settings Service
# =============================================================================

class SettingsService:
    """Service for app settings database operations."""

    @staticmethod
    def get(key: str, default: Any = None) -> Any:
        """Get a setting by key."""
        with get_db_session() as db:
            setting = db.query(SettingModel).filter(SettingModel.key == key).first()
            return setting.value if setting else default

    @staticmethod
    def get_all() -> dict:
        """Get all settings as a dictionary."""
        with get_db_session() as db:
            settings = db.query(SettingModel).all()
            return {s.key: s.value for s in settings}

    @staticmethod
    def set(key: str, value: Any) -> None:
        """Set a setting."""
        with get_db_session() as db:
            setting = db.query(SettingModel).filter(SettingModel.key == key).first()
            if setting:
                setting.value = value
            else:
                setting = SettingModel(key=key, value=value)
                db.add(setting)
            db.commit()

    @staticmethod
    def set_many(settings: dict) -> None:
        """Set multiple settings at once."""
        with get_db_session() as db:
            for key, value in settings.items():
                setting = db.query(SettingModel).filter(SettingModel.key == key).first()
                if setting:
                    setting.value = value
                else:
                    setting = SettingModel(key=key, value=value)
                    db.add(setting)
            db.commit()

    @staticmethod
    def delete(key: str) -> bool:
        """Delete a setting."""
        with get_db_session() as db:
            setting = db.query(SettingModel).filter(SettingModel.key == key).first()
            if not setting:
                return False
            db.delete(setting)
            db.commit()
            return True


# =============================================================================
# Tab State Service
# =============================================================================

class TabStateService:
    """Service for UI tab state database operations."""

    @staticmethod
    def get() -> dict:
        """Get the current tab state."""
        with get_db_session() as db:
            state = db.query(TabStateModel).filter(TabStateModel.id == 1).first()
            if state:
                return state.to_dict()
            return {"openProjectIds": [], "activeProjectId": None, "tabOrder": []}

    @staticmethod
    def save(state_data: dict) -> dict:
        """Save the tab state."""
        with get_db_session() as db:
            state = db.query(TabStateModel).filter(TabStateModel.id == 1).first()
            if state:
                state.open_project_ids = state_data.get("openProjectIds", [])
                state.active_project_id = state_data.get("activeProjectId")
                state.tab_order = state_data.get("tabOrder", [])
            else:
                state = TabStateModel(
                    id=1,
                    open_project_ids=state_data.get("openProjectIds", []),
                    active_project_id=state_data.get("activeProjectId"),
                    tab_order=state_data.get("tabOrder", []),
                )
                db.add(state)
            db.commit()
            db.refresh(state)
            return state.to_dict()


# =============================================================================
# Migration from JSON files
# =============================================================================

def migrate_from_json():
    """Migrate existing JSON data to SQLite."""
    import json
    from pathlib import Path

    print("[Database] Starting migration from JSON files...")

    # Migrate projects
    projects_file = Path("/root/.claude/projects.json")
    if projects_file.exists():
        try:
            with open(projects_file) as f:
                projects_data = json.load(f)

            with get_db_session() as db:
                for project_id, project in projects_data.items():
                    existing = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
                    if not existing:
                        db.add(ProjectModel(
                            id=project_id,
                            name=project.get("name", project_id),
                            path=project.get("path", ""),
                            auto_build_path=project.get("autoBuildPath"),
                            main_branch=project.get("mainBranch", "main"),
                            settings=project.get("settings", {}),
                        ))
                db.commit()
            print(f"[Database] Migrated {len(projects_data)} projects")
        except Exception as e:
            print(f"[Database] Error migrating projects: {e}")

    # Migrate tasks
    tasks_file = Path("/root/.claude/tasks.json")
    if tasks_file.exists():
        try:
            with open(tasks_file) as f:
                tasks_data = json.load(f)

            with get_db_session() as db:
                for task_id, task in tasks_data.items():
                    existing = db.query(TaskModel).filter(TaskModel.id == task_id).first()
                    if not existing:
                        # Check if project exists
                        project_id = task.get("project_id") or task.get("projectId")
                        project_exists = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
                        if project_exists:
                            db.add(TaskModel(
                                id=task_id,
                                spec_id=task.get("spec_id") or task.get("specId", task_id),
                                project_id=project_id,
                                title=task.get("title", ""),
                                description=task.get("description"),
                                status=task.get("status", "pending"),
                                worktree_branch=task.get("worktree_branch") or task.get("worktreeBranch"),
                                archived=task.get("archived", False),
                                archived_version=task.get("archived_version") or task.get("archivedVersion"),
                                metadata=task.get("metadata", {}),
                            ))
                db.commit()
            print(f"[Database] Migrated {len(tasks_data)} tasks")
        except Exception as e:
            print(f"[Database] Error migrating tasks: {e}")

    # Migrate settings
    settings_file = Path("/root/.claude/app-settings.json")
    if settings_file.exists():
        try:
            with open(settings_file) as f:
                settings_data = json.load(f)

            SettingsService.set_many(settings_data)
            print(f"[Database] Migrated {len(settings_data)} settings")
        except Exception as e:
            print(f"[Database] Error migrating settings: {e}")

    # Migrate profiles
    profiles_file = Path("/root/.claude/profiles.json")
    if profiles_file.exists():
        try:
            with open(profiles_file) as f:
                profiles_data = json.load(f)

            with get_db_session() as db:
                for profile in profiles_data.get("profiles", []):
                    profile_id = profile.get("id")
                    existing = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
                    if not existing:
                        db.add(ProfileModel(
                            id=profile_id,
                            name=profile.get("name", ""),
                            is_active=profile.get("isActive", False),
                            is_authenticated=profile.get("isAuthenticated", False),
                            email=profile.get("email"),
                            daily_usage_percent=profile.get("dailyUsagePercent", 0),
                            weekly_usage_percent=profile.get("weeklyUsagePercent", 0),
                            monthly_usage_percent=profile.get("monthlyUsagePercent", 0),
                            credentials=profile.get("credentials", {}),
                        ))
                db.commit()
            print(f"[Database] Migrated {len(profiles_data.get('profiles', []))} profiles")
        except Exception as e:
            print(f"[Database] Error migrating profiles: {e}")

    # Migrate tab state
    tab_state_file = Path("/root/.claude/tab-state.json")
    if tab_state_file.exists():
        try:
            with open(tab_state_file) as f:
                tab_state_data = json.load(f)

            TabStateService.save(tab_state_data)
            print("[Database] Migrated tab state")
        except Exception as e:
            print(f"[Database] Error migrating tab state: {e}")

    print("[Database] Migration complete")


def migrate_spec_files(project_path: str, task_id: str) -> bool:
    """
    Migrate spec files from flat files to database.

    Args:
        project_path: Path to the project directory
        task_id: The task/spec ID to migrate

    Returns:
        True if migration successful
    """
    spec_dir = Path(project_path) / ".auto-claude" / "specs" / task_id
    if not spec_dir.exists():
        print(f"[Database] No spec directory found: {spec_dir}")
        return False

    spec_data = {"id": task_id, "taskId": task_id}

    # Read each file type
    file_mappings = {
        "spec.md": ("specMarkdown", "text"),
        "task.md": ("taskMarkdown", "text"),
        "implementation_plan.json": ("implementationPlan", "json"),
        "requirements.json": ("requirements", "json"),
        "context.json": ("context", "json"),
        "complexity_assessment.json": ("complexityAssessment", "json"),
        "review_state.json": ("reviewState", "json"),
        "qa_report.md": ("qaReport", "text"),
        "init.sh": ("initScript", "text"),
        "build-progress.txt": ("buildProgress", "text"),
        "task_logs.json": ("taskLogs", "json"),
        "project_index.json": ("projectIndex", "json"),
    }

    for filename, (field_name, file_type) in file_mappings.items():
        filepath = spec_dir / filename
        if filepath.exists():
            try:
                content = filepath.read_text()
                if file_type == "json":
                    spec_data[field_name] = json.loads(content)
                else:
                    spec_data[field_name] = content
            except Exception as e:
                print(f"[Database] Error reading {filepath}: {e}")

    # Handle memory directory
    memory_dir = spec_dir / "memory"
    if memory_dir.exists():
        memory_data = {}

        # Read memory files
        memory_files = {
            "codebase_map.json": "codebaseMap",
            "gotchas.md": "gotchas",
            "attempt_history.json": "attemptHistory",
            "build_commits.json": "buildCommits",
        }

        for filename, key in memory_files.items():
            filepath = memory_dir / filename
            if filepath.exists():
                try:
                    content = filepath.read_text()
                    if filename.endswith(".json"):
                        memory_data[key] = json.loads(content)
                    else:
                        memory_data[key] = content
                except Exception as e:
                    print(f"[Database] Error reading {filepath}: {e}")

        # Read session insights
        session_dir = memory_dir / "session_insights"
        if session_dir.exists():
            sessions = {}
            for session_file in session_dir.glob("session_*.json"):
                try:
                    sessions[session_file.stem] = json.loads(session_file.read_text())
                except Exception as e:
                    print(f"[Database] Error reading {session_file}: {e}")
            if sessions:
                memory_data["sessionInsights"] = sessions

        if memory_data:
            spec_data["memory"] = memory_data

    # Upsert to database
    try:
        SpecService.upsert(task_id, spec_data)
        print(f"[Database] Migrated spec files for task {task_id}")
        return True
    except Exception as e:
        print(f"[Database] Error migrating spec {task_id}: {e}")
        return False


def migrate_all_project_specs(project_path: str) -> int:
    """
    Migrate all spec files from a project to the database.

    Args:
        project_path: Path to the project directory

    Returns:
        Number of specs migrated
    """
    specs_dir = Path(project_path) / ".auto-claude" / "specs"
    if not specs_dir.exists():
        return 0

    count = 0
    for spec_dir in specs_dir.iterdir():
        if spec_dir.is_dir() and spec_dir.name != ".gitkeep":
            if migrate_spec_files(project_path, spec_dir.name):
                count += 1

    return count


# Initialize database on module import
init_db()
