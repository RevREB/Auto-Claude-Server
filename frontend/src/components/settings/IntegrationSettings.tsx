import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/url-utils';
import {
  Key,
  Eye,
  EyeOff,
  Info,
  Users,
  Plus,
  Trash2,
  Star,
  Check,
  Pencil,
  X,
  Loader2,
  LogIn,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Activity,
  AlertCircle,
  Terminal,
  Github,
  LogOut
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import { loadClaudeProfiles as loadGlobalClaudeProfiles } from '../../stores/claude-profile-store';
import type { AppSettings, ClaudeProfile, ClaudeAutoSwitchSettings } from '../../../shared/types';
import { AuthTerminal } from '../AuthTerminal';

interface IntegrationSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isOpen: boolean;
}

/**
 * Integration settings for Claude accounts and API keys
 */
export function IntegrationSettings({ settings, onSettingsChange, isOpen }: IntegrationSettingsProps) {
  // Password visibility toggle for global API keys
  const [showGlobalOpenAIKey, setShowGlobalOpenAIKey] = useState(false);

  // GitHub authentication state
  const [githubAuthenticated, setGithubAuthenticated] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [isAuthenticatingGithub, setIsAuthenticatingGithub] = useState(false);
  const [isCheckingGithubAuth, setIsCheckingGithubAuth] = useState(false);

  // Claude Accounts state
  const [claudeProfiles, setClaudeProfiles] = useState<ClaudeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [authenticatingProfileId, setAuthenticatingProfileId] = useState<string | null>(null);
  const [expandedTokenProfileId, setExpandedTokenProfileId] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [manualTokenEmail, setManualTokenEmail] = useState('');
  const [showManualToken, setShowManualToken] = useState(false);
  const [savingTokenProfileId, setSavingTokenProfileId] = useState<string | null>(null);

  // Auto-swap settings state
  const [autoSwitchSettings, setAutoSwitchSettings] = useState<ClaudeAutoSwitchSettings | null>(null);
  const [isLoadingAutoSwitch, setIsLoadingAutoSwitch] = useState(false);

  // Terminal state
  const [showAuthTerminal, setShowAuthTerminal] = useState(false);
  const [terminalProfileId, setTerminalProfileId] = useState<string | null>(null);

  // Load Claude profiles and auto-swap settings when section is shown
  useEffect(() => {
    if (isOpen) {
      loadClaudeProfiles();
      loadAutoSwitchSettings();
      checkGithubAuth();
    }
  }, [isOpen]);

  // Listen for OAuth authentication completion
  useEffect(() => {
    const unsubscribe = window.api.onTerminalOAuthToken(async (info) => {
      if (info.success && info.profileId) {
        // Reload profiles to show updated state
        await loadClaudeProfiles();
        // Show simple success notification
        alert(`✅ Profile authenticated successfully!\n\n${info.email ? `Account: ${info.email}` : 'Authentication complete.'}\n\nYou can now use this profile.`);
      }
    });

    return unsubscribe;
  }, []);

  const loadClaudeProfiles = async () => {
    setIsLoadingProfiles(true);
    try {
      const result = await window.api.getClaudeProfiles();
      if (result.success && result.data) {
        setClaudeProfiles(result.data.profiles);
        setActiveProfileId(result.data.activeProfileId);
        // Also update the global store
        await loadGlobalClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to load Claude profiles:', err);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const handleAddProfile = async () => {
    if (!newProfileName.trim()) return;

    setIsAddingProfile(true);
    try {
      const profileName = newProfileName.trim();
      const profileSlug = profileName.toLowerCase().replace(/\s+/g, '-');

      const result = await window.api.saveClaudeProfile({
        id: `profile-${Date.now()}`,
        name: profileName,
        configDir: `~/.claude-profiles/${profileSlug}`,
        isDefault: false,
        createdAt: new Date()
      });

      if (result.success && result.data) {
        // Profile created - user can now click "Setup Token" to authenticate
        await loadClaudeProfiles();
        setNewProfileName('');

        // Show success message
        alert(
          `✅ Account "${profileName}" Added!\n\n` +
          `Click the "Setup Token" button next to your account to authenticate with Claude.ai`
        );
      }
    } catch (err) {
      console.error('Failed to add profile:', err);
      alert('Failed to add profile. Please try again.');
    } finally {
      setIsAddingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setDeletingProfileId(profileId);
    try {
      const result = await window.api.deleteClaudeProfile(profileId);
      if (result.success) {
        await loadClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to delete profile:', err);
    } finally {
      setDeletingProfileId(null);
    }
  };

  const startEditingProfile = (profile: ClaudeProfile) => {
    setEditingProfileId(profile.id);
    setEditingProfileName(profile.name);
  };

  const cancelEditingProfile = () => {
    setEditingProfileId(null);
    setEditingProfileName('');
  };

  const handleRenameProfile = async () => {
    if (!editingProfileId || !editingProfileName.trim()) return;

    try {
      const result = await window.api.renameClaudeProfile(editingProfileId, editingProfileName.trim());
      if (result.success) {
        await loadClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to rename profile:', err);
    } finally {
      setEditingProfileId(null);
      setEditingProfileName('');
    }
  };

  const handleSetActiveProfile = async (profileId: string) => {
    try {
      const result = await window.api.setActiveClaudeProfile(profileId);
      if (result.success) {
        setActiveProfileId(profileId);
        await loadGlobalClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to set active profile:', err);
    }
  };

  const handleAuthenticateProfile = async (profileId: string) => {
    setAuthenticatingProfileId(profileId);
    try {
      const initResult = await window.api.initializeClaudeProfile(profileId);
      if (initResult.success) {
        const authUrl = initResult.data?.authUrl;
        const pollUrl = initResult.data?.pollUrl;
        const message = initResult.data?.message;

        if (authUrl && pollUrl) {
          // Real OAuth flow
          alert(
            `🔐 Claude.ai Authentication\n\n` +
            `${message || 'Authenticate with your Claude.ai subscription'}\n\n` +
            `Steps:\n` +
            `1. Click OK to open authentication page\n` +
            `2. Log in with your Claude.ai account\n` +
            `3. This page will update automatically when complete\n\n` +
            `Works on any device including iPad!`
          );

          // Open OAuth URL in new tab
          window.open(authUrl, '_blank');

          // Start polling for completion
          const pollInterval = setInterval(async () => {
            try {
              const response = await fetch(`${API_URL}${pollUrl}`);
              const status = await response.json();

              if (status.status === 'completed' && status.token) {
                clearInterval(pollInterval);
                setAuthenticatingProfileId(null);

                // Save token to profile
                await window.api.setClaudeProfileToken(profileId, status.token, status.email);

                // Reload profiles
                await loadClaudeProfiles();

                // Success handled by UI state update
              } else if (status.status === 'error') {
                clearInterval(pollInterval);
                setAuthenticatingProfileId(null);
                alert(`❌ Authentication failed: ${status.error}`);
              }
            } catch (err) {
              console.error('Polling error:', err);
            }
          }, 2000); // Poll every 2 seconds

          // Stop polling after 5 minutes
          setTimeout(() => {
            clearInterval(pollInterval);
            if (authenticatingProfileId === profileId) {
              setAuthenticatingProfileId(null);
              alert('Authentication timed out. Please try again.');
            }
          }, 300000);

        } else {
          // Fallback to manual token entry
          alert(
            `📋 Manual Token Setup\n\n` +
            `${message || 'Please set up your token manually'}\n\n` +
            `Click the arrow next to this account to expand token entry.`
          );
          setExpandedTokenProfileId(profileId);
          setAuthenticatingProfileId(null);
        }
      } else {
        alert(`Failed to start authentication: ${initResult.error || 'Please try again.'}`);
        setAuthenticatingProfileId(null);
      }
    } catch (err) {
      console.error('Failed to authenticate profile:', err);
      alert('Failed to start authentication. Please try again.');
      setAuthenticatingProfileId(null);
    }
  };

  const toggleTokenEntry = (profileId: string) => {
    if (expandedTokenProfileId === profileId) {
      setExpandedTokenProfileId(null);
      setManualToken('');
      setManualTokenEmail('');
      setShowManualToken(false);
    } else {
      setExpandedTokenProfileId(profileId);
      setManualToken('');
      setManualTokenEmail('');
      setShowManualToken(false);
    }
  };

  const handleSaveManualToken = async (profileId: string) => {
    if (!manualToken.trim()) return;

    setSavingTokenProfileId(profileId);
    try {
      const result = await window.api.setClaudeProfileToken(
        profileId,
        manualToken.trim(),
        manualTokenEmail.trim() || undefined
      );
      if (result.success) {
        await loadClaudeProfiles();
        setExpandedTokenProfileId(null);
        setManualToken('');
        setManualTokenEmail('');
        setShowManualToken(false);
      } else {
        alert(`Failed to save token: ${result.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to save token:', err);
      alert('Failed to save token. Please try again.');
    } finally {
      setSavingTokenProfileId(null);
    }
  };

  const handleOpenTerminal = (profileId: string) => {
    setTerminalProfileId(profileId);
    setShowAuthTerminal(true);
  };

  const handleTokenReceived = async (token: string, email?: string) => {
    if (!terminalProfileId) return;

    // Save token to profile
    const result = await window.api.setClaudeProfileToken(terminalProfileId, token, email);

    if (result.success) {
      await loadClaudeProfiles();
      setShowAuthTerminal(false);
      setTerminalProfileId(null);
      // Success - UI will show authenticated state
    } else {
      alert(`Failed to save token: ${result.error || 'Please try again.'}`);
    }
  };

  // Load auto-swap settings
  const loadAutoSwitchSettings = async () => {
    setIsLoadingAutoSwitch(true);
    try {
      const result = await window.api.getAutoSwitchSettings();
      if (result.success && result.data) {
        setAutoSwitchSettings(result.data);
      }
    } catch (err) {
      console.error('Failed to load auto-switch settings:', err);
    } finally {
      setIsLoadingAutoSwitch(false);
    }
  };

  // Update auto-swap settings
  const handleUpdateAutoSwitch = async (updates: Partial<ClaudeAutoSwitchSettings>) => {
    setIsLoadingAutoSwitch(true);
    try {
      const result = await window.api.updateAutoSwitchSettings(updates);
      if (result.success) {
        await loadAutoSwitchSettings();
      } else {
        alert(`Failed to update settings: ${result.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to update auto-switch settings:', err);
      alert('Failed to update settings. Please try again.');
    } finally {
      setIsLoadingAutoSwitch(false);
    }
  };

  // GitHub Authentication Functions
  const checkGithubAuth = async () => {
    setIsCheckingGithubAuth(true);
    try {
      const response = await fetch(`${API_URL}/api/github/auth/status`);
      const result = await response.json();

      if (result.success && result.data) {
        setGithubAuthenticated(result.data.authenticated);
        setGithubUsername(result.data.username);
      }
    } catch (err) {
      console.error('Failed to check GitHub auth status:', err);
    } finally {
      setIsCheckingGithubAuth(false);
    }
  };

  const handleGithubLogin = async () => {
    if (!githubToken.trim()) {
      alert('Please enter a GitHub Personal Access Token');
      return;
    }

    setIsAuthenticatingGithub(true);
    try {
      const response = await fetch(`${API_URL}/api/github/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: githubToken.trim() }),
      });

      const result = await response.json();

      if (result.success) {
        setGithubAuthenticated(true);
        setGithubUsername(result.data?.username || null);
        setGithubToken('');
        setShowGithubToken(false);
        alert(`✅ GitHub authenticated successfully!\n\n${result.data?.username ? `Logged in as: ${result.data.username}` : 'Authentication complete.'}`);
      } else {
        alert(`❌ Failed to authenticate:\n${result.error || 'Please check your token and try again.'}`);
      }
    } catch (err) {
      console.error('Failed to authenticate with GitHub:', err);
      alert('Failed to authenticate with GitHub. Please try again.');
    } finally {
      setIsAuthenticatingGithub(false);
    }
  };

  const handleGithubLogout = async () => {
    try {
      const response = await fetch(`${API_URL}/api/github/auth/logout`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        setGithubAuthenticated(false);
        setGithubUsername(null);
        alert('✅ Logged out from GitHub successfully');
      } else {
        alert(`❌ Failed to logout:\n${result.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to logout from GitHub:', err);
      alert('Failed to logout from GitHub. Please try again.');
    }
  };

  return (
    <SettingsSection
      title="Integrations"
      description="Manage Claude accounts and API keys"
    >
      <div className="space-y-6">
        {/* Claude Accounts Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">Claude Accounts</h4>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Add multiple Claude subscriptions to automatically switch between them when you hit rate limits.
            </p>

            {/* Accounts list */}
            {isLoadingProfiles ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : claudeProfiles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center mb-4">
                <p className="text-sm text-muted-foreground">No accounts configured yet</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {claudeProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      profile.id === activeProfileId
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-between p-3",
                      expandedTokenProfileId !== profile.id && "hover:bg-muted/50"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                          profile.id === activeProfileId
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {(editingProfileId === profile.id ? editingProfileName : profile.name).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {editingProfileId === profile.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingProfileName}
                                onChange={(e) => setEditingProfileName(e.target.value)}
                                className="h-7 text-sm w-40"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameProfile();
                                  if (e.key === 'Escape') cancelEditingProfile();
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRenameProfile}
                                className="h-7 w-7 text-success hover:text-success hover:bg-success/10"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={cancelEditingProfile}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{profile.name}</span>
                                {profile.isDefault && (
                                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Default</span>
                                )}
                                {profile.id === activeProfileId && (
                                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Star className="h-3 w-3" />
                                    Active
                                  </span>
                                )}
                                {(profile.oauthToken || (profile.isDefault && profile.configDir)) ? (
                                  <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Authenticated
                                  </span>
                                ) : (
                                  <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                                    Needs Auth
                                  </span>
                                )}
                              </div>
                              {profile.email && (
                                <span className="text-xs text-muted-foreground">{profile.email}</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {editingProfileId !== profile.id && (
                        <div className="flex items-center gap-1">
                          {/* Authenticate button - show only if NOT authenticated */}
                          {/* A profile is authenticated if: has OAuth token OR (is default AND has configDir) */}
                          {!(profile.oauthToken || (profile.isDefault && profile.configDir)) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenTerminal(profile.id)}
                              className="gap-1 h-7 text-xs"
                              title="Open terminal to run claude setup-token"
                            >
                              <Terminal className="h-3 w-3" />
                              Setup Token
                            </Button>
                          ) : (
                            /* Re-authenticate button for already authenticated profiles */
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenTerminal(profile.id)}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Re-authenticate profile"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          {profile.id !== activeProfileId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetActiveProfile(profile.id)}
                              className="gap-1 h-7 text-xs"
                            >
                              <Check className="h-3 w-3" />
                              Set Active
                            </Button>
                          )}
                          {/* Toggle token entry button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleTokenEntry(profile.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title={expandedTokenProfileId === profile.id ? "Hide token entry" : "Enter token manually"}
                          >
                            {expandedTokenProfileId === profile.id ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditingProfile(profile)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Rename profile"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!profile.isDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteProfile(profile.id)}
                              disabled={deletingProfileId === profile.id}
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete profile"
                            >
                              {deletingProfileId === profile.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded token entry section */}
                    {expandedTokenProfileId === profile.id && (
                      <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0">
                        <div className="bg-muted/30 rounded-lg p-3 mt-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Manual Token Entry
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              Run <code className="px-1 py-0.5 bg-muted rounded font-mono text-xs">claude setup-token</code> to get your token
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="relative">
                              <Input
                                type={showManualToken ? 'text' : 'password'}
                                placeholder="sk-ant-oat01-..."
                                value={manualToken}
                                onChange={(e) => setManualToken(e.target.value)}
                                className="pr-10 font-mono text-xs h-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowManualToken(!showManualToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showManualToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>

                            <Input
                              type="email"
                              placeholder="Email (optional, for display)"
                              value={manualTokenEmail}
                              onChange={(e) => setManualTokenEmail(e.target.value)}
                              className="text-xs h-8"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTokenEntry(profile.id)}
                              className="h-7 text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveManualToken(profile.id)}
                              disabled={!manualToken.trim() || savingTokenProfileId === profile.id}
                              className="h-7 text-xs gap-1"
                            >
                              {savingTokenProfileId === profile.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Save Token
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new account */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Account name (e.g., Work, Personal)"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="flex-1 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newProfileName.trim()) {
                    handleAddProfile();
                  }
                }}
              />
              <Button
                onClick={handleAddProfile}
                disabled={!newProfileName.trim() || isAddingProfile}
                size="sm"
                className="gap-1 shrink-0"
              >
                {isAddingProfile ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Auto-Switch Settings Section */}
        {claudeProfiles.length > 1 && (
          <div className="space-y-4 pt-6 border-t border-border">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">Automatic Account Switching</h4>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Automatically switch between Claude accounts to avoid interruptions.
                Configure proactive monitoring to switch before hitting limits.
              </p>

              {/* Master toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Enable automatic switching</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Master switch for all auto-swap features
                  </p>
                </div>
                <Switch
                  checked={autoSwitchSettings?.enabled ?? false}
                  onCheckedChange={(enabled) => handleUpdateAutoSwitch({ enabled })}
                  disabled={isLoadingAutoSwitch}
                />
              </div>

              {autoSwitchSettings?.enabled && (
                <>
                  {/* Proactive Monitoring Section */}
                  <div className="pl-6 space-y-4 pt-2 border-l-2 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Activity className="h-3.5 w-3.5" />
                          Proactive Monitoring
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Check usage regularly and swap before hitting limits
                        </p>
                      </div>
                      <Switch
                        checked={autoSwitchSettings?.proactiveSwapEnabled ?? true}
                        onCheckedChange={(value) => handleUpdateAutoSwitch({ proactiveSwapEnabled: value })}
                        disabled={isLoadingAutoSwitch}
                      />
                    </div>

                    {autoSwitchSettings?.proactiveSwapEnabled && (
                      <>
                        {/* Check interval */}
                        <div className="space-y-2">
                          <Label className="text-sm">Check usage every</Label>
                          <select
                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                            value={autoSwitchSettings?.usageCheckInterval ?? 30000}
                            onChange={(e) => handleUpdateAutoSwitch({ usageCheckInterval: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                          >
                            <option value={15000}>15 seconds</option>
                            <option value={30000}>30 seconds (recommended)</option>
                            <option value={60000}>1 minute</option>
                            <option value={0}>Disabled</option>
                          </select>
                        </div>

                        {/* Session threshold */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Session usage threshold</Label>
                            <span className="text-sm font-mono">{autoSwitchSettings?.sessionThreshold ?? 95}%</span>
                          </div>
                          <input
                            type="range"
                            min="70"
                            max="99"
                            step="1"
                            value={autoSwitchSettings?.sessionThreshold ?? 95}
                            onChange={(e) => handleUpdateAutoSwitch({ sessionThreshold: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Switch when session usage reaches this level (recommended: 95%)
                          </p>
                        </div>

                        {/* Weekly threshold */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Weekly usage threshold</Label>
                            <span className="text-sm font-mono">{autoSwitchSettings?.weeklyThreshold ?? 99}%</span>
                          </div>
                          <input
                            type="range"
                            min="70"
                            max="99"
                            step="1"
                            value={autoSwitchSettings?.weeklyThreshold ?? 99}
                            onChange={(e) => handleUpdateAutoSwitch({ weeklyThreshold: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Switch when weekly usage reaches this level (recommended: 99%)
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Reactive Recovery Section */}
                  <div className="pl-6 space-y-4 pt-2 border-l-2 border-orange-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Reactive Recovery
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Auto-swap when unexpected rate limit is hit
                        </p>
                      </div>
                      <Switch
                        checked={autoSwitchSettings?.autoSwitchOnRateLimit ?? false}
                        onCheckedChange={(value) => handleUpdateAutoSwitch({ autoSwitchOnRateLimit: value })}
                        disabled={isLoadingAutoSwitch}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* API Keys Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">API Keys</h4>
          </div>

          <div className="rounded-lg bg-info/10 border border-info/30 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Keys set here are used as defaults. Individual projects can override these in their settings.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="globalOpenAIKey" className="text-sm font-medium text-foreground">
                OpenAI API Key
              </Label>
              <p className="text-xs text-muted-foreground">
                Required for Graphiti memory backend (embeddings)
              </p>
              <div className="relative max-w-lg">
                <Input
                  id="globalOpenAIKey"
                  type={showGlobalOpenAIKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.globalOpenAIApiKey || ''}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, globalOpenAIApiKey: e.target.value || undefined })
                  }
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowGlobalOpenAIKey(!showGlobalOpenAIKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showGlobalOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* GitHub Authentication Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">GitHub Authentication</h4>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-4">
            {isCheckingGithubAuth ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : githubAuthenticated ? (
              /* Authenticated State */
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Authenticated as {githubUsername || 'GitHub User'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        GitHub CLI is connected
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGithubLogout}
                    className="gap-2"
                  >
                    <LogOut className="h-3 w-3" />
                    Logout
                  </Button>
                </div>

                <div className="rounded-lg bg-info/10 border border-info/30 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      GitHub integration is now available for all projects. You can manage repositories,
                      create pull requests, and sync issues from project settings.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Not Authenticated State */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Authenticate with GitHub to enable repository management, PR creation, and issue syncing features.
                </p>

                <div className="rounded-lg bg-info/10 border border-info/30 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        <strong>To create a Personal Access Token:</strong>
                      </p>
                      <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 ml-2">
                        <li>Visit <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">github.com/settings/tokens</a></li>
                        <li>Click "Generate new token" → "Generate new token (classic)"</li>
                        <li>Give it a name and select scopes: <code className="px-1 py-0.5 bg-muted rounded text-xs">repo</code>, <code className="px-1 py-0.5 bg-muted rounded text-xs">read:org</code>, <code className="px-1 py-0.5 bg-muted rounded text-xs">read:user</code></li>
                        <li>Copy the token and paste it below</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Personal Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showGithubToken ? 'text' : 'password'}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="pr-10 font-mono text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && githubToken.trim()) {
                          handleGithubLogin();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowGithubToken(!showGithubToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showGithubToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <Button
                    onClick={handleGithubLogin}
                    disabled={!githubToken.trim() || isAuthenticatingGithub}
                    className="w-full gap-2"
                  >
                    {isAuthenticatingGithub ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Authenticate with GitHub
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auth Terminal Modal */}
      {showAuthTerminal && terminalProfileId && (
        <AuthTerminal
          profileId={terminalProfileId}
          onClose={() => {
            setShowAuthTerminal(false);
            setTerminalProfileId(null);
          }}
          onTokenReceived={handleTokenReceived}
        />
      )}
    </SettingsSection>
  );
}
