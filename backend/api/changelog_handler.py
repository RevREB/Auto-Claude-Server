"""
Changelog WebSocket handlers.

Handles changelog generation, release management, and version suggestions.
"""

import asyncio
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


def register_changelog_handlers(ws_manager, api_main):
    """Register changelog-related WebSocket handlers."""

    async def changelog_get_done_tasks(conn_id: str, payload: dict) -> List[dict]:
        """Get completed tasks for changelog generation."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]

        # Get tasks from the task list
        tasks = [t for t in api_main.tasks.values()
                 if t.project_id == project_id and t.status == "done"]

        return [{
            "id": t.id,
            "specId": t.spec_id,
            "title": t.title,
            "description": t.description,
            "completedAt": t.updated_at.isoformat() if t.updated_at else None,
            "hasSpecs": True
        } for t in tasks]

    async def changelog_load_specs(conn_id: str, payload: dict) -> List[dict]:
        """Load task specs for changelog generation."""
        project_id = payload.get("projectId")
        spec_ids = payload.get("specIds", [])

        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]
        specs = []

        for spec_id in spec_ids:
            spec_path = Path(project.path) / ".auto-claude" / "specs" / spec_id
            if spec_path.exists():
                # Load spec.md if it exists
                spec_file = spec_path / "spec.md"
                if spec_file.exists():
                    specs.append({
                        "specId": spec_id,
                        "content": spec_file.read_text()
                    })

        return specs

    async def changelog_generate(conn_id: str, payload: dict) -> dict:
        """Generate changelog from completed tasks."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        task_spec_ids = payload.get("taskSpecIds", [])
        options = payload.get("options", {})

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Start async changelog generation
        asyncio.create_task(
            _run_changelog_generation(
                ws_manager, conn_id, project_id, project.path,
                version, task_spec_ids, options
            )
        )

        return {"success": True, "message": "Changelog generation started"}

    async def changelog_save(conn_id: str, payload: dict) -> dict:
        """Save generated changelog to file."""
        project_id = payload.get("projectId")
        content = payload.get("content", "")
        file_path = payload.get("filePath", "CHANGELOG.md")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        changelog_path = Path(project.path) / file_path

        try:
            changelog_path.write_text(content)
            return {
                "success": True,
                "data": {
                    "filePath": file_path,
                    "bytesWritten": len(content.encode('utf-8'))
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def changelog_read_existing(conn_id: str, payload: dict) -> dict:
        """Read existing changelog file."""
        project_id = payload.get("projectId")
        file_path = payload.get("filePath", "CHANGELOG.md")

        if not project_id or project_id not in api_main.projects:
            return {"exists": False}

        project = api_main.projects[project_id]
        changelog_path = Path(project.path) / file_path

        if changelog_path.exists():
            return {
                "exists": True,
                "content": changelog_path.read_text()
            }
        return {"exists": False}

    async def changelog_suggest_version(conn_id: str, payload: dict) -> dict:
        """Suggest next version based on changes."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {"version": "1.0.0", "reason": "Initial release"}

        project = api_main.projects[project_id]

        # Try to get latest tag
        try:
            result = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                latest_tag = result.stdout.strip()
                # Parse and increment
                if latest_tag.startswith("v"):
                    latest_tag = latest_tag[1:]
                parts = latest_tag.split(".")
                if len(parts) >= 3:
                    # Increment patch version
                    parts[-1] = str(int(parts[-1]) + 1)
                    return {
                        "version": ".".join(parts),
                        "reason": f"Patch increment from {latest_tag}"
                    }
        except Exception:
            pass

        return {"version": "1.0.0", "reason": "Initial release"}

    async def changelog_get_branches(conn_id: str, payload: dict) -> List[str]:
        """Get git branches for changelog scope."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]

        try:
            result = subprocess.run(
                ["git", "branch", "-a", "--format=%(refname:short)"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]
        except Exception:
            pass

        return []

    async def changelog_get_tags(conn_id: str, payload: dict) -> List[str]:
        """Get git tags for changelog scope."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]

        try:
            result = subprocess.run(
                ["git", "tag", "--sort=-version:refname"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]
        except Exception:
            pass

        return []

    async def changelog_get_commits_preview(conn_id: str, payload: dict) -> List[dict]:
        """Get commits preview for changelog scope."""
        project_id = payload.get("projectId")
        from_ref = payload.get("fromRef")
        to_ref = payload.get("toRef", "HEAD")

        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]

        try:
            ref_range = f"{from_ref}..{to_ref}" if from_ref else to_ref
            result = subprocess.run(
                ["git", "log", ref_range, "--format=%H|%s|%an|%ai", "-50"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                commits = []
                for line in result.stdout.strip().split("\n"):
                    if line:
                        parts = line.split("|", 3)
                        if len(parts) >= 4:
                            commits.append({
                                "sha": parts[0],
                                "message": parts[1],
                                "author": parts[2],
                                "date": parts[3]
                            })
                return commits
        except Exception:
            pass

        return []

    async def changelog_get_releaseable_versions(conn_id: str, payload: dict) -> List[dict]:
        """Get versions that can be released."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]
        changelog_path = Path(project.path) / "CHANGELOG.md"

        if not changelog_path.exists():
            return []

        # Parse changelog to find versions
        versions = []
        content = changelog_path.read_text()

        import re
        # Match version headers like "## [1.0.0] - 2025-01-01" or "## 1.0.0"
        version_pattern = r'## \[?(\d+\.\d+\.\d+)\]?\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?'

        for match in re.finditer(version_pattern, content):
            version = match.group(1)
            date = match.group(2) or datetime.now().strftime("%Y-%m-%d")

            # Check if this version has a git tag
            try:
                result = subprocess.run(
                    ["git", "tag", "-l", f"v{version}"],
                    cwd=project.path,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                is_released = bool(result.stdout.strip())
            except Exception:
                is_released = False

            versions.append({
                "version": version,
                "tagName": f"v{version}",
                "date": date,
                "isReleased": is_released
            })

        return versions

    async def changelog_preflight_check(conn_id: str, payload: dict) -> dict:
        """Run preflight checks before creating a release."""
        project_id = payload.get("projectId")
        version = payload.get("version")

        if not project_id or project_id not in api_main.projects:
            return {"canRelease": False, "blockers": ["Project not found"]}

        project = api_main.projects[project_id]
        checks = {}
        blockers = []

        # Check git clean
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=10
            )
            git_clean = result.returncode == 0 and not result.stdout.strip()
            checks["gitClean"] = {
                "passed": git_clean,
                "message": "Working directory is clean" if git_clean else "Working directory has uncommitted changes"
            }
            if not git_clean:
                blockers.append("Uncommitted changes")
        except Exception as e:
            checks["gitClean"] = {"passed": False, "message": str(e)}
            blockers.append("Could not check git status")

        # Check tag availability
        try:
            result = subprocess.run(
                ["git", "tag", "-l", f"v{version}"],
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=5
            )
            tag_available = result.returncode == 0 and not result.stdout.strip()
            checks["tagAvailable"] = {
                "passed": tag_available,
                "message": f"Tag v{version} is available" if tag_available else f"Tag v{version} already exists"
            }
            if not tag_available:
                blockers.append(f"Tag v{version} already exists")
        except Exception as e:
            checks["tagAvailable"] = {"passed": False, "message": str(e)}

        # Check gh CLI
        try:
            result = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=10
            )
            gh_connected = result.returncode == 0
            checks["githubConnected"] = {
                "passed": gh_connected,
                "message": "GitHub CLI authenticated" if gh_connected else "GitHub CLI not authenticated"
            }
            if not gh_connected:
                blockers.append("GitHub CLI not authenticated")
        except Exception:
            checks["githubConnected"] = {"passed": False, "message": "GitHub CLI not installed"}
            blockers.append("GitHub CLI not installed")

        return {
            "canRelease": len(blockers) == 0,
            "checks": checks,
            "blockers": blockers
        }

    async def changelog_create_release(conn_id: str, payload: dict) -> dict:
        """Create a GitHub release."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        notes = payload.get("notes", "")
        draft = payload.get("draft", False)
        prerelease = payload.get("prerelease", False)

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Start async release creation
        asyncio.create_task(
            _run_release_creation(
                ws_manager, conn_id, project_id, project.path,
                version, notes, draft, prerelease
            )
        )

        return {"success": True, "message": "Release creation started"}

    # Register handlers
    handlers = {
        "changelog.getDoneTasks": changelog_get_done_tasks,
        "changelog.loadSpecs": changelog_load_specs,
        "changelog.generate": changelog_generate,
        "changelog.save": changelog_save,
        "changelog.readExisting": changelog_read_existing,
        "changelog.suggestVersion": changelog_suggest_version,
        "changelog.getBranches": changelog_get_branches,
        "changelog.getTags": changelog_get_tags,
        "changelog.getCommitsPreview": changelog_get_commits_preview,
        "changelog.getReleaseableVersions": changelog_get_releaseable_versions,
        "changelog.preflightCheck": changelog_preflight_check,
        "changelog.createRelease": changelog_create_release,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[Changelog] Registered {len(handlers)} handlers")


async def _run_changelog_generation(
    ws_manager, conn_id: str, project_id: str, project_path: str,
    version: str, task_spec_ids: List[str], options: dict
):
    """Run changelog generation and stream progress."""
    try:
        await ws_manager.send_event(conn_id, f"changelog.{project_id}.progress", {
            "stage": "starting",
            "message": "Starting changelog generation..."
        })

        # Build changelog content from completed tasks
        changelog_lines = [
            f"## [{version}] - {datetime.now().strftime('%Y-%m-%d')}",
            ""
        ]

        # Group changes by type
        added = []
        changed = []
        fixed = []

        # Load specs and categorize
        specs_dir = Path(project_path) / ".auto-claude" / "specs"
        for spec_id in task_spec_ids:
            spec_path = specs_dir / spec_id
            spec_file = spec_path / "spec.md"
            if spec_file.exists():
                content = spec_file.read_text()
                # Simple categorization based on spec title/content
                title_line = content.split("\n")[0] if content else spec_id
                title = title_line.replace("#", "").strip()

                if any(kw in title.lower() for kw in ["fix", "bug", "issue"]):
                    fixed.append(title)
                elif any(kw in title.lower() for kw in ["add", "new", "implement"]):
                    added.append(title)
                else:
                    changed.append(title)

        if added:
            changelog_lines.append("### Added")
            for item in added:
                changelog_lines.append(f"- {item}")
            changelog_lines.append("")

        if changed:
            changelog_lines.append("### Changed")
            for item in changed:
                changelog_lines.append(f"- {item}")
            changelog_lines.append("")

        if fixed:
            changelog_lines.append("### Fixed")
            for item in fixed:
                changelog_lines.append(f"- {item}")
            changelog_lines.append("")

        changelog_content = "\n".join(changelog_lines)

        await ws_manager.send_event(conn_id, f"changelog.{project_id}.complete", {
            "content": changelog_content,
            "version": version
        })

    except Exception as e:
        await ws_manager.send_event(conn_id, f"changelog.{project_id}.error", {
            "error": str(e)
        })


async def _run_release_creation(
    ws_manager, conn_id: str, project_id: str, project_path: str,
    version: str, notes: str, draft: bool, prerelease: bool
):
    """Run GitHub release creation."""
    try:
        await ws_manager.send_event(conn_id, f"release.{project_id}.progress", {
            "stage": "creating_tag",
            "message": f"Creating tag v{version}..."
        })

        # Create tag
        tag_result = subprocess.run(
            ["git", "tag", "-a", f"v{version}", "-m", f"Release {version}"],
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=30
        )

        if tag_result.returncode != 0:
            raise Exception(f"Failed to create tag: {tag_result.stderr}")

        await ws_manager.send_event(conn_id, f"release.{project_id}.progress", {
            "stage": "pushing_tag",
            "message": "Pushing tag to remote..."
        })

        # Push tag
        push_result = subprocess.run(
            ["git", "push", "origin", f"v{version}"],
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=60
        )

        if push_result.returncode != 0:
            raise Exception(f"Failed to push tag: {push_result.stderr}")

        await ws_manager.send_event(conn_id, f"release.{project_id}.progress", {
            "stage": "creating_release",
            "message": "Creating GitHub release..."
        })

        # Create release via gh CLI
        gh_cmd = [
            "gh", "release", "create", f"v{version}",
            "--title", f"v{version}",
            "--notes", notes or f"Release {version}"
        ]
        if draft:
            gh_cmd.append("--draft")
        if prerelease:
            gh_cmd.append("--prerelease")

        release_result = subprocess.run(
            gh_cmd,
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=60
        )

        if release_result.returncode != 0:
            raise Exception(f"Failed to create release: {release_result.stderr}")

        # Parse release URL from output
        release_url = release_result.stdout.strip()

        await ws_manager.send_event(conn_id, f"release.{project_id}.complete", {
            "success": True,
            "version": version,
            "url": release_url
        })

    except Exception as e:
        await ws_manager.send_event(conn_id, f"release.{project_id}.error", {
            "error": str(e)
        })
