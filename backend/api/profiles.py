"""
Claude Profile Management API

Handles multi-account support for Claude profiles, allowing users to:
- Create and manage multiple Claude.ai subscription profiles
- Switch between profiles for rate limit management
- Track usage and auto-switch based on thresholds
- Store OAuth tokens for instant profile switching
"""

from datetime import datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import httpx
import asyncio
from pathlib import Path

from .database import ProfileService, SettingsService

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

# Legacy file location (for migration only)
PROFILES_FILE = Path("/root/.claude/profiles.json")

# ============================================================================
# Models
# ============================================================================

class ClaudeUsageData(BaseModel):
    sessionUsagePercent: float
    sessionResetTime: str
    weeklyUsagePercent: float
    weeklyResetTime: str
    opusUsagePercent: Optional[float] = None
    lastUpdated: datetime

class ClaudeProfile(BaseModel):
    id: str
    name: str
    oauthToken: Optional[str] = None
    email: Optional[str] = None
    tokenCreatedAt: Optional[datetime] = None
    configDir: Optional[str] = None
    isDefault: bool = False
    description: Optional[str] = None
    createdAt: datetime
    lastUsedAt: Optional[datetime] = None
    usage: Optional[ClaudeUsageData] = None

class AutoSwitchSettings(BaseModel):
    enabled: bool = False
    proactiveSwapEnabled: bool = False
    usageCheckInterval: int = 30000
    sessionThreshold: int = 95
    weeklyThreshold: int = 99
    autoSwitchOnRateLimit: bool = True

class ProfileCreateRequest(BaseModel):
    id: str
    name: str
    oauthToken: Optional[str] = None
    email: Optional[str] = None
    isDefault: Optional[bool] = None
    createdAt: Optional[datetime] = None
    configDir: Optional[str] = None

class ProfileRenameRequest(BaseModel):
    name: str

class ProfileTokenRequest(BaseModel):
    token: str
    email: Optional[str] = None

# ============================================================================
# Persistence Functions
# ============================================================================

def _save_profiles():
    """Save profiles to database"""
    try:
        for pid, profile in _profiles.items():
            profile_dict = profile.dict()
            existing = ProfileService.get_by_id(pid)
            if existing:
                ProfileService.update(pid, {
                    "name": profile.name,
                    "isAuthenticated": profile.oauthToken is not None,
                    "email": profile.email,
                    "credentials": {
                        "oauthToken": profile.oauthToken,
                        "tokenCreatedAt": str(profile.tokenCreatedAt) if profile.tokenCreatedAt else None,
                    },
                })
            else:
                ProfileService.create({
                    "id": pid,
                    "name": profile.name,
                    "isActive": pid == _active_profile_id,
                    "isAuthenticated": profile.oauthToken is not None,
                    "email": profile.email,
                    "credentials": {
                        "oauthToken": profile.oauthToken,
                        "tokenCreatedAt": str(profile.tokenCreatedAt) if profile.tokenCreatedAt else None,
                    },
                })

        # Set active profile
        if _active_profile_id:
            ProfileService.set_active(_active_profile_id)

        # Save auto-switch settings
        SettingsService.set("auto_switch_settings", _auto_switch_settings.dict())

        print(f"[Profiles] Saved {len(_profiles)} profiles to database")
    except Exception as e:
        print(f"[Profiles] Error saving profiles: {e}")

def _load_profiles():
    """Load profiles from database"""
    global _profiles, _active_profile_id, _auto_switch_settings

    try:
        db_profiles = ProfileService.get_all(include_credentials=True)

        if db_profiles:
            _profiles = {}
            for p in db_profiles:
                creds = p.get("credentials", {})
                _profiles[p["id"]] = ClaudeProfile(
                    id=p["id"],
                    name=p["name"],
                    oauthToken=creds.get("oauthToken"),
                    email=p.get("email"),
                    tokenCreatedAt=datetime.fromisoformat(creds["tokenCreatedAt"]) if creds.get("tokenCreatedAt") else None,
                    isDefault=p["id"] == "default",
                    createdAt=datetime.fromisoformat(p["createdAt"]) if p.get("createdAt") else datetime.now(),
                )
                if p.get("isActive"):
                    _active_profile_id = p["id"]

            # Load auto-switch settings
            auto_switch_data = SettingsService.get("auto_switch_settings")
            if auto_switch_data:
                _auto_switch_settings = AutoSwitchSettings(**auto_switch_data)

            print(f"[Profiles] Loaded {len(_profiles)} profiles from database")
            return True
    except Exception as e:
        print(f"[Profiles] Error loading profiles from database: {e}")

    return False

# ============================================================================
# In-memory storage (loaded from persistent file)
# ============================================================================

_profiles: Dict[str, ClaudeProfile] = {}
_active_profile_id: str = "default"
_auto_switch_settings: AutoSwitchSettings = AutoSwitchSettings()

# Load profiles from file, or create default if none exist
if not _load_profiles() or not _profiles:
    print("[Profiles] No saved profiles found, creating default profile")
    default_profile = ClaudeProfile(
        id="default",
        name="Default Profile",
        isDefault=True,
        createdAt=datetime.now(),
    )
    _profiles["default"] = default_profile
    _active_profile_id = "default"
    _save_profiles()

# ============================================================================
# Usage API Client
# ============================================================================

ANTHROPIC_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

async def fetch_usage_from_api(oauth_token: str) -> Optional[ClaudeUsageData]:
    """
    Fetch usage data from Anthropic's OAuth usage API.

    Args:
        oauth_token: The OAuth token (sk-ant-oat01-...) to authenticate with

    Returns:
        ClaudeUsageData if successful, None if failed
    """
    if not oauth_token:
        print("[Profiles] No OAuth token provided for usage fetch")
        return None

    headers = {
        "Authorization": f"Bearer {oauth_token}",
        "anthropic-beta": "oauth-2025-04-20",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "auto-claude/1.0",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ANTHROPIC_USAGE_URL, headers=headers)

            if response.status_code == 403:
                # Check for scope error
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "")
                    if "scope" in error_msg.lower():
                        print(f"[Profiles] Token missing required scope: {error_msg}")
                        print("[Profiles] Re-authenticate with 'claude login' to get proper scopes")
                except Exception:
                    pass
                return None

            if response.status_code != 200:
                print(f"[Profiles] Usage API returned status {response.status_code}: {response.text[:200]}")
                return None

            data = response.json()
            print(f"[Profiles] Usage API response: {data}")

            # Parse the response into ClaudeUsageData
            five_hour = data.get("five_hour", {})
            seven_day = data.get("seven_day", {})
            seven_day_opus = data.get("seven_day_opus", {})

            # Extract utilization percentages (API returns as float 0-100)
            session_usage = five_hour.get("utilization", 0.0)
            weekly_usage = seven_day.get("utilization", 0.0)
            opus_usage = seven_day_opus.get("utilization") if seven_day_opus else None

            # Parse reset times
            session_reset = five_hour.get("resets_at", "")
            weekly_reset = seven_day.get("resets_at", "")

            # Format reset times to human-readable
            session_reset_str = _format_reset_time(session_reset) if session_reset else ""
            weekly_reset_str = _format_reset_time(weekly_reset) if weekly_reset else ""

            return ClaudeUsageData(
                sessionUsagePercent=float(session_usage),
                sessionResetTime=session_reset_str,
                weeklyUsagePercent=float(weekly_usage),
                weeklyResetTime=weekly_reset_str,
                opusUsagePercent=float(opus_usage) if opus_usage is not None else None,
                lastUpdated=datetime.now()
            )

    except httpx.TimeoutException:
        print("[Profiles] Usage API request timed out")
        return None
    except httpx.RequestError as e:
        print(f"[Profiles] Usage API request error: {e}")
        return None
    except Exception as e:
        print(f"[Profiles] Error fetching usage: {e}")
        return None


def _format_reset_time(iso_timestamp: str) -> str:
    """
    Format an ISO timestamp into a human-readable reset time.

    Args:
        iso_timestamp: ISO 8601 timestamp string

    Returns:
        Human-readable string like "Today 5:00 PM" or "Sunday 12:00 AM"
    """
    if not iso_timestamp:
        return ""

    try:
        # Parse ISO timestamp
        from datetime import timezone
        reset_dt = datetime.fromisoformat(iso_timestamp.replace("+00:00", "+0000").replace("Z", "+0000"))
        now = datetime.now(timezone.utc)

        # Format based on how far away it is
        if reset_dt.date() == now.date():
            return reset_dt.strftime("Today %I:%M %p")
        elif (reset_dt.date() - now.date()).days == 1:
            return reset_dt.strftime("Tomorrow %I:%M %p")
        else:
            return reset_dt.strftime("%A %I:%M %p")
    except Exception as e:
        print(f"[Profiles] Error formatting reset time: {e}")
        return iso_timestamp


async def get_oauth_token_for_profile(profile_id: str) -> Optional[str]:
    """
    Get the OAuth token for a profile.

    Checks multiple sources in order:
    1. Profile's stored OAuth token
    2. Environment variable CLAUDE_CODE_OAUTH_TOKEN (for active profile)
    3. Claude CLI credentials file (~/.claude/.credentials.json)

    Args:
        profile_id: Profile ID to get token for

    Returns:
        OAuth token string if found, None otherwise
    """
    import os

    # 1. Check profile's stored token
    if profile_id in _profiles:
        profile = _profiles[profile_id]
        if profile.oauthToken:
            return profile.oauthToken

    # 2. Fall back to environment variable for active profile
    if profile_id == _active_profile_id:
        env_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
        if env_token:
            return env_token

    # 3. Fall back to credentials file (created by 'claude login')
    if profile_id == _active_profile_id:
        creds_paths = [
            Path("/root/.claude/.credentials.json"),
            Path.home() / ".claude" / ".credentials.json",
        ]

        for creds_path in creds_paths:
            try:
                if creds_path.exists():
                    with open(creds_path) as f:
                        creds_data = json.load(f)

                    token = creds_data.get("claudeAiOauth", {}).get("accessToken")
                    if token and token.startswith("sk-ant-oat01-"):
                        print(f"[Profiles] Found OAuth token in {creds_path}")
                        return token
            except Exception as e:
                print(f"[Profiles] Error reading credentials from {creds_path}: {e}")
                continue

    return None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("")
async def get_profiles():
    """
    Get all Claude profiles and the active profile ID.

    Returns:
        List of profiles and active profile ID
    """
    return {
        "success": True,
        "profiles": list(_profiles.values()),
        "activeProfileId": _active_profile_id
    }

@router.post("")
async def create_profile(profile_data: ProfileCreateRequest):
    """
    Create or update a Claude profile.

    Args:
        profile_data: Profile information including ID, name, and optional OAuth token

    Returns:
        Created/updated profile
    """
    # If profile exists, update it
    if profile_data.id in _profiles:
        existing = _profiles[profile_data.id]
        existing.name = profile_data.name
        if profile_data.oauthToken:
            existing.oauthToken = profile_data.oauthToken
            existing.tokenCreatedAt = datetime.now()
        if profile_data.email:
            existing.email = profile_data.email
        if profile_data.isDefault is not None:
            existing.isDefault = profile_data.isDefault
        profile = existing
    else:
        # Create new profile
        profile = ClaudeProfile(
            id=profile_data.id,
            name=profile_data.name,
            oauthToken=profile_data.oauthToken,
            email=profile_data.email,
            isDefault=profile_data.isDefault or False,
            createdAt=profile_data.createdAt or datetime.now(),
            configDir=profile_data.configDir,
        )
        _profiles[profile_data.id] = profile

    _save_profiles()

    return {
        "success": True,
        "data": profile
    }

@router.delete("/{profile_id}")
async def delete_profile(profile_id: str):
    """
    Delete a Claude profile.

    Args:
        profile_id: ID of profile to delete

    Returns:
        Success status
    """
    global _active_profile_id

    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Don't allow deleting the last profile
    if len(_profiles) == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last profile")

    # If deleting active profile, switch to another one
    if profile_id == _active_profile_id:
        remaining_profiles = [pid for pid in _profiles.keys() if pid != profile_id]
        _active_profile_id = remaining_profiles[0]

    del _profiles[profile_id]

    _save_profiles()

    return {"success": True}

@router.patch("/{profile_id}/rename")
async def rename_profile(profile_id: str, request: ProfileRenameRequest):
    """
    Rename a Claude profile.

    Args:
        profile_id: ID of profile to rename
        request: New name

    Returns:
        Success status
    """
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    _profiles[profile_id].name = request.name

    _save_profiles()

    return {"success": True}

@router.post("/{profile_id}/activate")
async def activate_profile(profile_id: str):
    """
    Set a profile as the active profile.

    Args:
        profile_id: ID of profile to activate

    Returns:
        Success status
    """
    global _active_profile_id

    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    _active_profile_id = profile_id
    _profiles[profile_id].lastUsedAt = datetime.now()

    _save_profiles()

    return {"success": True}

@router.post("/{profile_id}/switch")
async def switch_profile(profile_id: str):
    """
    Switch to a different profile (same as activate).

    Args:
        profile_id: ID of profile to switch to

    Returns:
        Success status
    """
    return await activate_profile(profile_id)

@router.post("/{profile_id}/token")
async def set_profile_token(profile_id: str, request: ProfileTokenRequest):
    """
    Set OAuth token for a profile.

    Args:
        profile_id: ID of profile
        request: Token and optional email

    Returns:
        Success status
    """
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = _profiles[profile_id]
    profile.oauthToken = request.token
    profile.tokenCreatedAt = datetime.now()
    if request.email:
        profile.email = request.email

    _save_profiles()

    return {"success": True}

@router.get("/auto-switch/settings")
async def get_auto_switch_settings():
    """
    Get auto-switch settings.

    Returns:
        Auto-switch configuration
    """
    return {
        "success": True,
        "data": _auto_switch_settings
    }

@router.patch("/auto-switch/settings")
async def update_auto_switch_settings(settings: AutoSwitchSettings):
    """
    Update auto-switch settings.

    Args:
        settings: New auto-switch configuration

    Returns:
        Success status
    """
    global _auto_switch_settings
    _auto_switch_settings = settings

    _save_profiles()

    return {"success": True}

@router.get("/{profile_id}/usage")
async def get_profile_usage(profile_id: str):
    """
    Get usage data for a profile.

    Fetches real usage data from Anthropic's OAuth usage API.
    Falls back to cached usage data if API call fails.

    Args:
        profile_id: ID of profile

    Returns:
        Usage data
    """
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = _profiles[profile_id]

    # Try to get OAuth token for this profile
    oauth_token = await get_oauth_token_for_profile(profile_id)

    if oauth_token:
        # Fetch real usage from API
        usage_data = await fetch_usage_from_api(oauth_token)
        if usage_data:
            profile.usage = usage_data
            _save_profiles()
            return {
                "success": True,
                "data": usage_data
            }

    # Fall back to cached usage if available
    if profile.usage:
        return {
            "success": True,
            "data": profile.usage
        }

    # No token and no cached data - return zeros
    return {
        "success": True,
        "data": ClaudeUsageData(
            sessionUsagePercent=0.0,
            sessionResetTime="",
            weeklyUsagePercent=0.0,
            weeklyResetTime="",
            opusUsagePercent=None,
            lastUpdated=datetime.now()
        ),
        "warning": "No OAuth token available. Add a token to see real usage data."
    }

@router.get("/best-available")
async def get_best_available_profile():
    """
    Get the best available profile based on usage.

    Returns the profile with the lowest usage percentage.
    For now, returns mock data.

    Returns:
        Best available profile ID and reason
    """
    if not _profiles:
        raise HTTPException(status_code=404, detail="No profiles available")

    # For now, return the first non-active profile or the active one
    for profile_id, profile in _profiles.items():
        if profile_id != _active_profile_id:
            return {
                "success": True,
                "data": {
                    "profileId": profile_id,
                    "profileName": profile.name,
                    "reason": "Lower usage detected",
                    "currentUsage": 45.0
                }
            }

    # If no other profile, return active one
    active_profile = _profiles[_active_profile_id]
    return {
        "success": True,
        "data": {
            "profileId": _active_profile_id,
            "profileName": active_profile.name,
            "reason": "Only profile available",
            "currentUsage": 65.0
        }
    }

@router.post("/{profile_id}/retry")
async def retry_with_profile(profile_id: str):
    """
    Retry the current operation with a different profile.

    This is called when a rate limit is hit and the user wants to retry
    with a different profile.

    Args:
        profile_id: ID of profile to retry with

    Returns:
        Success status
    """
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Switch to the profile
    await activate_profile(profile_id)

    return {
        "success": True,
        "data": {
            "message": f"Switched to profile: {_profiles[profile_id].name}"
        }
    }

@router.post("/{profile_id}/usage/refresh")
async def refresh_usage(profile_id: str):
    """
    Manually refresh usage data for a profile.

    Forces a fresh fetch from Anthropic's OAuth usage API.

    Args:
        profile_id: ID of profile

    Returns:
        Updated usage data
    """
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = _profiles[profile_id]

    # Try to get OAuth token for this profile
    oauth_token = await get_oauth_token_for_profile(profile_id)

    if not oauth_token:
        return {
            "success": False,
            "error": "No OAuth token available for this profile. Add a token to fetch usage data."
        }

    # Fetch fresh usage from API
    usage_data = await fetch_usage_from_api(oauth_token)

    if not usage_data:
        return {
            "success": False,
            "error": "Failed to fetch usage data from API. Check token validity."
        }

    # Update profile with new usage data
    profile.usage = usage_data
    _save_profiles()

    return {
        "success": True,
        "data": usage_data
    }


# ============================================================================
# Background Usage Collection
# ============================================================================

_usage_collection_task = None
_usage_collection_running = False


async def _collect_usage_and_broadcast():
    """
    Background task that collects usage data every 60 seconds
    and broadcasts updates to all connected WebSocket clients.
    """
    global _usage_collection_running
    _usage_collection_running = True

    # Import here to avoid circular imports
    from .websocket_handler import ws_manager

    print("[Profiles] Starting background usage collection (60s interval)")

    while _usage_collection_running:
        try:
            # Get active profile
            if _active_profile_id and _active_profile_id in _profiles:
                profile = _profiles[_active_profile_id]

                # Get OAuth token
                oauth_token = await get_oauth_token_for_profile(_active_profile_id)

                if oauth_token:
                    # Fetch fresh usage from API
                    usage_data = await fetch_usage_from_api(oauth_token)

                    if usage_data:
                        # Update profile with new usage data
                        profile.usage = usage_data
                        _save_profiles()

                        # Create snapshot for broadcast
                        snapshot = {
                            "sessionPercent": usage_data.sessionUsagePercent,
                            "weeklyPercent": usage_data.weeklyUsagePercent,
                            "sessionResetTime": usage_data.sessionResetTime,
                            "weeklyResetTime": usage_data.weeklyResetTime,
                            "profileId": _active_profile_id,
                            "profileName": profile.name,
                            "fetchedAt": datetime.now().isoformat(),
                        }

                        # Broadcast to all connected clients
                        await ws_manager.broadcast_to_all("usage.updated", snapshot)
                        print(f"[Profiles] Usage collected and broadcast: session={usage_data.sessionUsagePercent}%, weekly={usage_data.weeklyUsagePercent}%")
                    else:
                        print("[Profiles] Failed to fetch usage data")
                else:
                    print("[Profiles] No OAuth token available for usage collection")
            else:
                print("[Profiles] No active profile for usage collection")

        except Exception as e:
            print(f"[Profiles] Error in usage collection: {e}")

        # Wait 60 seconds before next collection
        await asyncio.sleep(60)

    print("[Profiles] Background usage collection stopped")


async def start_usage_collection():
    """Start the background usage collection task."""
    global _usage_collection_task

    if _usage_collection_task is None or _usage_collection_task.done():
        _usage_collection_task = asyncio.create_task(_collect_usage_and_broadcast())
        print("[Profiles] Background usage collection task started")


async def stop_usage_collection():
    """Stop the background usage collection task."""
    global _usage_collection_running, _usage_collection_task

    _usage_collection_running = False

    if _usage_collection_task and not _usage_collection_task.done():
        _usage_collection_task.cancel()
        try:
            await _usage_collection_task
        except asyncio.CancelledError:
            pass

    print("[Profiles] Background usage collection task stopped")
