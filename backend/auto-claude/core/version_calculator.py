"""
Version Calculator - Calculates SemVer versions based on task impacts.

Follows Semantic Versioning 2.0.0:
- MAJOR: Breaking changes (version_impact='major' or is_breaking=True)
- MINOR: New features (version_impact='minor')
- PATCH: Bug fixes (version_impact='patch')
"""

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple


@dataclass
class Version:
    """Semantic version representation."""
    major: int
    minor: int
    patch: int
    prerelease: Optional[str] = None
    build: Optional[str] = None

    @classmethod
    def parse(cls, version_str: str) -> "Version":
        """Parse a version string into a Version object."""
        # Remove leading 'v' if present
        if version_str.startswith("v"):
            version_str = version_str[1:]

        # Match SemVer pattern
        pattern = r"^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$"
        match = re.match(pattern, version_str)

        if not match:
            raise ValueError(f"Invalid version string: {version_str}")

        return cls(
            major=int(match.group(1)),
            minor=int(match.group(2)),
            patch=int(match.group(3)),
            prerelease=match.group(4),
            build=match.group(5)
        )

    def __str__(self) -> str:
        """Convert to string representation."""
        version = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            version += f"-{self.prerelease}"
        if self.build:
            version += f"+{self.build}"
        return version

    def bump_major(self) -> "Version":
        """Return a new version with major bumped."""
        return Version(self.major + 1, 0, 0)

    def bump_minor(self) -> "Version":
        """Return a new version with minor bumped."""
        return Version(self.major, self.minor + 1, 0)

    def bump_patch(self) -> "Version":
        """Return a new version with patch bumped."""
        return Version(self.major, self.minor, self.patch + 1)

    def with_prerelease(self, prerelease: str) -> "Version":
        """Return a new version with prerelease tag."""
        return Version(self.major, self.minor, self.patch, prerelease)


@dataclass
class ChangelogEntry:
    """A changelog entry for a task."""
    task_id: str
    title: str
    description: str
    category: str  # 'added', 'changed', 'deprecated', 'removed', 'fixed', 'security'
    is_breaking: bool = False


@dataclass
class VersionBump:
    """Result of version calculation."""
    current: Version
    next: Version
    bump_type: str  # 'major', 'minor', 'patch'
    breaking_changes: List[str] = field(default_factory=list)
    features: List[str] = field(default_factory=list)
    fixes: List[str] = field(default_factory=list)


class VersionCalculator:
    """
    Calculates the next version based on task impacts.

    Uses task metadata to determine version bump:
    - is_breaking=True or version_impact='major' → major bump
    - version_impact='minor' → minor bump
    - version_impact='patch' (default) → patch bump
    """

    def __init__(self, project_dir: str | Path):
        """
        Initialize VersionCalculator.

        Args:
            project_dir: Path to the project directory
        """
        self.project_dir = Path(project_dir)

    def _run_git(self, *args, check: bool = True) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + list(args)
        return subprocess.run(
            cmd,
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            check=check
        )

    def get_current_version(self) -> Optional[Version]:
        """
        Get the current version from git tags.

        Returns:
            Current version or None if no version tags exist
        """
        try:
            # Get the latest version tag
            result = self._run_git(
                "describe", "--tags", "--abbrev=0", "--match", "v*",
                check=False
            )

            if result.returncode != 0:
                # No version tags - start at 0.0.0
                return Version(0, 0, 0)

            version_str = result.stdout.strip()
            return Version.parse(version_str)

        except Exception as e:
            print(f"[VersionCalculator] Error getting current version: {e}")
            return Version(0, 0, 0)

    def get_latest_tag(self) -> Optional[str]:
        """Get the latest git tag."""
        try:
            result = self._run_git(
                "describe", "--tags", "--abbrev=0",
                check=False
            )
            if result.returncode == 0:
                return result.stdout.strip()
            return None
        except Exception:
            return None

    def calculate_next(
        self,
        tasks: List[Dict[str, Any]],
        current_version: Optional[Version] = None
    ) -> VersionBump:
        """
        Calculate the next version based on task impacts.

        Args:
            tasks: List of task dicts with version_impact and is_breaking fields
            current_version: Override for current version (default: read from git)

        Returns:
            VersionBump with current, next version and change details
        """
        if current_version is None:
            current_version = self.get_current_version() or Version(0, 0, 0)

        # Categorize tasks
        breaking_changes = []
        features = []
        fixes = []

        has_major = False
        has_minor = False

        for task in tasks:
            task_id = task.get("id", task.get("spec_id", "unknown"))
            title = task.get("title", "Untitled")
            impact = task.get("version_impact", "patch")
            is_breaking = task.get("is_breaking", False)

            if is_breaking or impact == "major":
                has_major = True
                breaking_changes.append(f"[{task_id[:8]}] {title}")
            elif impact == "minor":
                has_minor = True
                features.append(f"[{task_id[:8]}] {title}")
            else:
                fixes.append(f"[{task_id[:8]}] {title}")

        # Determine bump type
        if has_major:
            bump_type = "major"
            next_version = current_version.bump_major()
        elif has_minor:
            bump_type = "minor"
            next_version = current_version.bump_minor()
        else:
            bump_type = "patch"
            next_version = current_version.bump_patch()

        return VersionBump(
            current=current_version,
            next=next_version,
            bump_type=bump_type,
            breaking_changes=breaking_changes,
            features=features,
            fixes=fixes
        )

    def get_changelog_entries(
        self,
        tasks: List[Dict[str, Any]]
    ) -> Dict[str, List[ChangelogEntry]]:
        """
        Generate changelog entries grouped by category.

        Args:
            tasks: List of task dicts

        Returns:
            Dict mapping category to list of ChangelogEntry
        """
        entries: Dict[str, List[ChangelogEntry]] = {
            "added": [],
            "changed": [],
            "deprecated": [],
            "removed": [],
            "fixed": [],
            "security": [],
        }

        for task in tasks:
            task_id = task.get("id", task.get("spec_id", ""))
            title = task.get("title", "")
            description = task.get("description", "")
            impact = task.get("version_impact", "patch")
            is_breaking = task.get("is_breaking", False)

            # Determine category from title/description keywords or impact
            category = self._categorize_task(title, description, impact)

            entries[category].append(ChangelogEntry(
                task_id=task_id,
                title=title,
                description=description,
                category=category,
                is_breaking=is_breaking
            ))

        return entries

    def _categorize_task(
        self,
        title: str,
        description: str,
        impact: str
    ) -> str:
        """Categorize a task based on its content."""
        text = f"{title} {description}".lower()

        # Check for security-related keywords
        security_keywords = ["security", "vulnerability", "cve", "xss", "csrf", "injection"]
        if any(kw in text for kw in security_keywords):
            return "security"

        # Check for removal keywords
        removal_keywords = ["remove", "delete", "drop", "deprecate"]
        if any(kw in text for kw in removal_keywords):
            if "deprecate" in text:
                return "deprecated"
            return "removed"

        # Check for fix keywords
        fix_keywords = ["fix", "bug", "issue", "error", "crash", "resolve"]
        if any(kw in text for kw in fix_keywords):
            return "fixed"

        # Check for feature keywords
        feature_keywords = ["add", "new", "feature", "implement", "create"]
        if any(kw in text for kw in feature_keywords):
            return "added"

        # Default based on impact
        if impact == "patch":
            return "fixed"
        elif impact == "minor":
            return "added"
        else:
            return "changed"

    def generate_changelog_markdown(
        self,
        version: Version,
        tasks: List[Dict[str, Any]],
        date: Optional[str] = None
    ) -> str:
        """
        Generate markdown changelog for a version.

        Args:
            version: Version being released
            tasks: Tasks included in the release
            date: Release date (default: today)

        Returns:
            Markdown formatted changelog section
        """
        from datetime import datetime

        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        entries = self.get_changelog_entries(tasks)
        lines = [f"## [{version}] - {date}", ""]

        category_titles = {
            "added": "### Added",
            "changed": "### Changed",
            "deprecated": "### Deprecated",
            "removed": "### Removed",
            "fixed": "### Fixed",
            "security": "### Security",
        }

        for category, title in category_titles.items():
            category_entries = entries.get(category, [])
            if category_entries:
                lines.append(title)
                for entry in category_entries:
                    prefix = "**BREAKING:** " if entry.is_breaking else ""
                    lines.append(f"- {prefix}{entry.title}")
                lines.append("")

        return "\n".join(lines)


def get_version_calculator(project_dir: str | Path) -> VersionCalculator:
    """
    Factory function to get a VersionCalculator instance.

    Args:
        project_dir: Path to the project directory

    Returns:
        VersionCalculator instance
    """
    return VersionCalculator(project_dir)
