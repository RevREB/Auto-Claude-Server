"""
GitHub Integration WebSocket handlers.

Handles GitHub issues, repositories, and release operations.
"""

import asyncio
import json
import os
import subprocess
from typing import Any, Dict, List, Optional


def register_github_integration_handlers(ws_manager, api_main):
    """Register GitHub integration-related WebSocket handlers."""

    async def github_get_repositories(conn_id: str, payload: dict) -> List[dict]:
        """Get user's GitHub repositories."""
        try:
            result = subprocess.run(
                ["gh", "repo", "list", "--json", "name,nameWithOwner,description,isPrivate,url", "--limit", "100"],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                repos = json.loads(result.stdout)
                return [{
                    "name": r.get("name"),
                    "fullName": r.get("nameWithOwner"),
                    "description": r.get("description"),
                    "isPrivate": r.get("isPrivate"),
                    "url": r.get("url")
                } for r in repos]
        except Exception as e:
            print(f"[GitHub] Error listing repos: {e}")

        return []

    async def github_get_issues(conn_id: str, payload: dict) -> List[dict]:
        """Get issues for a repository."""
        project_id = payload.get("projectId")
        repo = payload.get("repo")
        state = payload.get("state", "open")
        labels = payload.get("labels", [])
        limit = payload.get("limit", 50)

        if not repo and project_id and project_id in api_main.projects:
            # Try to detect repo from project
            project = api_main.projects[project_id]
            repo = _detect_repo_from_project(project.path)

        if not repo:
            return []

        try:
            cmd = [
                "gh", "issue", "list",
                "--repo", repo,
                "--state", state,
                "--json", "number,title,body,state,labels,author,createdAt,updatedAt,url,comments",
                "--limit", str(limit)
            ]

            if labels:
                cmd.extend(["--label", ",".join(labels)])

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                issues = json.loads(result.stdout)
                return [{
                    "number": i.get("number"),
                    "title": i.get("title"),
                    "body": i.get("body"),
                    "state": i.get("state"),
                    "labels": [l.get("name") for l in i.get("labels", [])],
                    "author": i.get("author", {}).get("login"),
                    "createdAt": i.get("createdAt"),
                    "updatedAt": i.get("updatedAt"),
                    "url": i.get("url"),
                    "commentCount": len(i.get("comments", []))
                } for i in issues]
        except Exception as e:
            print(f"[GitHub] Error listing issues: {e}")

        return []

    async def github_get_issue(conn_id: str, payload: dict) -> Optional[dict]:
        """Get a single issue by number."""
        project_id = payload.get("projectId")
        repo = payload.get("repo")
        issue_number = payload.get("issueNumber")

        if not repo and project_id and project_id in api_main.projects:
            project = api_main.projects[project_id]
            repo = _detect_repo_from_project(project.path)

        if not repo or not issue_number:
            return None

        try:
            result = subprocess.run(
                [
                    "gh", "issue", "view", str(issue_number),
                    "--repo", repo,
                    "--json", "number,title,body,state,labels,author,createdAt,updatedAt,url,comments"
                ],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                i = json.loads(result.stdout)
                return {
                    "number": i.get("number"),
                    "title": i.get("title"),
                    "body": i.get("body"),
                    "state": i.get("state"),
                    "labels": [l.get("name") for l in i.get("labels", [])],
                    "author": i.get("author", {}).get("login"),
                    "createdAt": i.get("createdAt"),
                    "updatedAt": i.get("updatedAt"),
                    "url": i.get("url"),
                    "comments": [{
                        "author": c.get("author", {}).get("login"),
                        "body": c.get("body"),
                        "createdAt": c.get("createdAt")
                    } for c in i.get("comments", [])]
                }
        except Exception as e:
            print(f"[GitHub] Error getting issue: {e}")

        return None

    async def github_get_issue_comments(conn_id: str, payload: dict) -> List[dict]:
        """Get comments for an issue."""
        project_id = payload.get("projectId")
        repo = payload.get("repo")
        issue_number = payload.get("issueNumber")

        if not repo and project_id and project_id in api_main.projects:
            project = api_main.projects[project_id]
            repo = _detect_repo_from_project(project.path)

        if not repo or not issue_number:
            return []

        try:
            result = subprocess.run(
                [
                    "gh", "issue", "view", str(issue_number),
                    "--repo", repo,
                    "--json", "comments"
                ],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                data = json.loads(result.stdout)
                return [{
                    "author": c.get("author", {}).get("login"),
                    "body": c.get("body"),
                    "createdAt": c.get("createdAt")
                } for c in data.get("comments", [])]
        except Exception as e:
            print(f"[GitHub] Error getting comments: {e}")

        return []

    async def github_check_connection(conn_id: str, payload: dict) -> dict:
        """Check GitHub connection status."""
        try:
            result = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return {"connected": True}
            return {"connected": False, "error": "Not authenticated"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    async def github_investigate_issue(conn_id: str, payload: dict) -> dict:
        """Investigate a GitHub issue using AI."""
        project_id = payload.get("projectId")
        repo = payload.get("repo")
        issue_number = payload.get("issueNumber")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        if not repo:
            repo = _detect_repo_from_project(project.path)

        if not repo or not issue_number:
            return {"success": False, "error": "Repository or issue number not specified"}

        # Start async investigation
        asyncio.create_task(
            _run_issue_investigation(
                ws_manager, conn_id, project_id, project.path, repo, issue_number
            )
        )

        return {"success": True, "message": "Investigation started"}

    async def github_import_issues(conn_id: str, payload: dict) -> dict:
        """Import GitHub issues as tasks."""
        project_id = payload.get("projectId")
        issue_numbers = payload.get("issueNumbers", [])
        repo = payload.get("repo")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        if not repo:
            repo = _detect_repo_from_project(project.path)

        if not repo:
            return {"success": False, "error": "Repository not found"}

        imported = []
        failed = []

        for issue_num in issue_numbers:
            try:
                # Get issue details
                result = subprocess.run(
                    [
                        "gh", "issue", "view", str(issue_num),
                        "--repo", repo,
                        "--json", "title,body"
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30
                )

                if result.returncode == 0:
                    issue = json.loads(result.stdout)

                    # Create task
                    from .main import TaskCreateRequest

                    task_request = TaskCreateRequest(
                        projectId=project_id,
                        title=f"[#{issue_num}] {issue.get('title', '')}",
                        description=issue.get("body", "")
                    )

                    task_result = await api_main.create_task(task_request)

                    if "task" in task_result:
                        imported.append(issue_num)
                    else:
                        failed.append(issue_num)
                else:
                    failed.append(issue_num)
            except Exception as e:
                print(f"[GitHub] Error importing issue {issue_num}: {e}")
                failed.append(issue_num)

        return {
            "success": len(failed) == 0,
            "imported": imported,
            "failed": failed
        }

    async def github_detect_repo(conn_id: str, payload: dict) -> Optional[str]:
        """Detect the GitHub repository for a project."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return None

        project = api_main.projects[project_id]
        return _detect_repo_from_project(project.path)

    async def github_get_branches(conn_id: str, payload: dict) -> List[str]:
        """Get branches for a repository."""
        project_id = payload.get("projectId")
        repo = payload.get("repo")

        if not repo and project_id and project_id in api_main.projects:
            project = api_main.projects[project_id]
            repo = _detect_repo_from_project(project.path)

        if not repo:
            return []

        try:
            result = subprocess.run(
                ["gh", "api", f"repos/{repo}/branches", "--jq", ".[].name"],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]
        except Exception as e:
            print(f"[GitHub] Error getting branches: {e}")

        return []

    async def github_get_user(conn_id: str, payload: dict) -> Optional[dict]:
        """Get current GitHub user."""
        try:
            result = subprocess.run(
                ["gh", "api", "user", "--jq", "{login: .login, name: .name, email: .email, avatarUrl: .avatar_url}"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return json.loads(result.stdout)
        except Exception as e:
            print(f"[GitHub] Error getting user: {e}")

        return None

    async def github_list_user_repos(conn_id: str, payload: dict) -> dict:
        """List user's repositories."""
        repos = await github_get_repositories(conn_id, payload)
        return {
            "repos": [{
                "fullName": r.get("fullName"),
                "description": r.get("description"),
                "isPrivate": r.get("isPrivate")
            } for r in repos]
        }

    async def github_list_orgs(conn_id: str, payload: dict) -> dict:
        """List user's organizations."""
        try:
            result = subprocess.run(
                ["gh", "api", "user/orgs", "--jq", "[.[] | {login: .login, avatarUrl: .avatar_url}]"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                orgs = json.loads(result.stdout)
                return {"orgs": orgs}
        except Exception as e:
            print(f"[GitHub] Error getting orgs: {e}")

        return {"orgs": []}

    async def github_create_repo(conn_id: str, payload: dict) -> dict:
        """Create a new GitHub repository."""
        repo_name = payload.get("repoName")
        description = payload.get("description", "")
        is_private = payload.get("isPrivate", False)
        project_path = payload.get("projectPath")
        owner = payload.get("owner")  # Optional org name

        if not repo_name:
            return {"success": False, "error": "Repository name required"}

        try:
            cmd = ["gh", "repo", "create"]

            if owner:
                cmd.append(f"{owner}/{repo_name}")
            else:
                cmd.append(repo_name)

            if description:
                cmd.extend(["--description", description])

            if is_private:
                cmd.append("--private")
            else:
                cmd.append("--public")

            # If project path provided, add as source
            if project_path:
                cmd.extend(["--source", project_path, "--push"])

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

            if result.returncode == 0:
                # Parse repo URL from output
                repo_url = result.stdout.strip()
                return {"success": True, "data": {"url": repo_url}}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def github_add_remote(conn_id: str, payload: dict) -> dict:
        """Add a remote to a git repository."""
        project_path = payload.get("projectPath")
        repo_full_name = payload.get("repoFullName")

        if not project_path or not repo_full_name:
            return {"success": False, "error": "Project path and repo required"}

        try:
            # Check if origin already exists
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                # Update existing remote
                result = subprocess.run(
                    ["git", "remote", "set-url", "origin", f"git@github.com:{repo_full_name}.git"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
            else:
                # Add new remote
                result = subprocess.run(
                    ["git", "remote", "add", "origin", f"git@github.com:{repo_full_name}.git"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )

            if result.returncode == 0:
                return {"success": True}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def github_create_release(conn_id: str, payload: dict) -> dict:
        """Create a GitHub release."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        notes = payload.get("notes", "")
        draft = payload.get("draft", False)
        prerelease = payload.get("prerelease", False)

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        repo = _detect_repo_from_project(project.path)

        if not repo:
            return {"success": False, "error": "Repository not found"}

        try:
            cmd = [
                "gh", "release", "create", f"v{version}",
                "--repo", repo,
                "--title", f"v{version}",
                "--notes", notes or f"Release {version}"
            ]

            if draft:
                cmd.append("--draft")
            if prerelease:
                cmd.append("--prerelease")

            result = subprocess.run(
                cmd,
                cwd=project.path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                return {"success": True, "data": {"url": result.stdout.strip()}}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Register handlers
    handlers = {
        "github.getRepositories": github_get_repositories,
        "github.getIssues": github_get_issues,
        "github.getIssue": github_get_issue,
        "github.getIssueComments": github_get_issue_comments,
        "github.checkConnection": github_check_connection,
        "github.investigateIssue": github_investigate_issue,
        "github.importIssues": github_import_issues,
        "github.detectRepo": github_detect_repo,
        "github.getBranches": github_get_branches,
        "github.getUser": github_get_user,
        "github.listUserRepos": github_list_user_repos,
        "github.listOrgs": github_list_orgs,
        "github.createRepo": github_create_repo,
        "github.addRemote": github_add_remote,
        "github.createRelease": github_create_release,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[GitHub Integration] Registered {len(handlers)} handlers")


def _detect_repo_from_project(project_path: str) -> Optional[str]:
    """Detect GitHub repo from project's git remote."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode == 0:
            url = result.stdout.strip()
            # Parse repo from URL
            # git@github.com:owner/repo.git
            # https://github.com/owner/repo.git
            import re
            match = re.search(r'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$', url)
            if match:
                return match.group(1)
    except Exception:
        pass

    return None


async def _run_issue_investigation(
    ws_manager, conn_id: str, project_id: str, project_path: str, repo: str, issue_number: int
):
    """Run AI-powered issue investigation."""
    try:
        await ws_manager.send_event(conn_id, f"github.{project_id}.investigationProgress", {
            "stage": "fetching",
            "message": f"Fetching issue #{issue_number}..."
        })

        # Get issue details
        result = subprocess.run(
            [
                "gh", "issue", "view", str(issue_number),
                "--repo", repo,
                "--json", "title,body,comments"
            ],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            await ws_manager.send_event(conn_id, f"github.{project_id}.investigationError", {
                "error": f"Failed to fetch issue: {result.stderr}"
            })
            return

        issue = json.loads(result.stdout)

        await ws_manager.send_event(conn_id, f"github.{project_id}.investigationProgress", {
            "stage": "analyzing",
            "message": "Analyzing issue context..."
        })

        # For now, just return the issue as-is
        # A full implementation would use Claude to analyze
        await ws_manager.send_event(conn_id, f"github.{project_id}.investigationComplete", {
            "issue": {
                "number": issue_number,
                "title": issue.get("title"),
                "body": issue.get("body"),
                "comments": issue.get("comments", [])
            },
            "analysis": {
                "summary": f"Issue #{issue_number}: {issue.get('title')}",
                "suggestedFix": "Review the issue details and codebase to determine the appropriate fix.",
                "relatedFiles": [],
                "priority": "medium"
            }
        })

    except Exception as e:
        print(f"[GitHub] Investigation error: {e}")
        await ws_manager.send_event(conn_id, f"github.{project_id}.investigationError", {
            "error": str(e)
        })
