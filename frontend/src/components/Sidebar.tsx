import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  LayoutGrid,
  Terminal,
  Map,
  BookOpen,
  Lightbulb,
  AlertCircle,
  Download,
  RefreshCw,
  Github,
  FileText,
  Sparkles,
  GitBranch,
  HelpCircle
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import {
  useProjectStore,
  removeProject,
  initializeProject,
  checkProjectVersion,
  updateProjectAutoBuild
} from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import { GitSetupModal } from './GitSetupModal';
import { RateLimitIndicator } from './RateLimitIndicator';
import { ProjectSelector } from './settings/ProjectSelector';
import type { Project, AutoBuildVersionInfo, GitStatus } from '../../shared/types';

export type SidebarView = 'kanban' | 'terminals' | 'roadmap' | 'context' | 'ideation' | 'github-issues' | 'changelog' | 'insights' | 'worktrees' | 'agent-tools';

interface SidebarProps {
  onNewTaskClick: () => void;
  activeView?: SidebarView;
  onViewChange?: (view: SidebarView) => void;
}

interface NavItem {
  id: SidebarView;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
}

const projectNavItems: NavItem[] = [
  { id: 'kanban', label: 'Kanban Board', icon: LayoutGrid, shortcut: 'K' },
  { id: 'terminals', label: 'Agent Terminals', icon: Terminal, shortcut: 'A' },
  { id: 'insights', label: 'Insights', icon: Sparkles, shortcut: 'N' },
  { id: 'roadmap', label: 'Roadmap', icon: Map, shortcut: 'D' },
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, shortcut: 'I' },
  { id: 'changelog', label: 'Changelog', icon: FileText, shortcut: 'L' },
  { id: 'context', label: 'Context', icon: BookOpen, shortcut: 'C' }
];

const toolsNavItems: NavItem[] = [
  { id: 'github-issues', label: 'GitHub Issues', icon: Github, shortcut: 'G' },
  { id: 'worktrees', label: 'Worktrees', icon: GitBranch, shortcut: 'W' }
];

export function Sidebar({
  onNewTaskClick,
  activeView = 'kanban',
  onViewChange
}: SidebarProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const openProjectTab = useProjectStore((state) => state.openProjectTab);

  // Use activeProjectId as fallback if selectedProjectId is not set
  const currentProjectId = selectedProjectId || activeProjectId;
  const settings = useSettingsStore((state) => state.settings);

  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showGitSetupModal, setShowGitSetupModal] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [_versionInfo, setVersionInfo] = useState<AutoBuildVersionInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Only handle shortcuts when a project is selected
      if (!selectedProjectId) return;

      // Check for modifier keys - we want plain key presses only
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();

      // Find matching nav item
      const allNavItems = [...projectNavItems, ...toolsNavItems];
      const matchedItem = allNavItems.find((item) => item.shortcut === key);

      if (matchedItem) {
        e.preventDefault();
        onViewChange?.(matchedItem.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProjectId, onViewChange]);

  // Check for updates when project changes
  useEffect(() => {
    const checkUpdates = async () => {
      if (selectedProjectId && settings.autoUpdateAutoBuild) {
        const info = await checkProjectVersion(selectedProjectId);
        if (info?.updateAvailable) {
          setVersionInfo(info);
          setShowUpdateDialog(true);
        }
      }
    };
    checkUpdates();
  }, [selectedProjectId, settings.autoUpdateAutoBuild]);

  // Check git status when project changes
  useEffect(() => {
    const checkGit = async () => {
      if (selectedProject) {
        try {
          const result = await window.api.checkGitStatus(selectedProject.id);
          if (result.success && result.data) {
            setGitStatus(result.data);
            // Show git setup modal only if backend says it's needed
            // Backend considers: git status AND whether user has skipped
            if (result.data.needsGitSetup) {
              setShowGitSetupModal(true);
            }
          }
        } catch (error) {
          console.error('Failed to check git status:', error);
        }
      } else {
        setGitStatus(null);
      }
    };
    checkGit();
  }, [selectedProject]);

  const handleProjectAdded = (project: Project, needsInit: boolean) => {
    if (needsInit) {
      setPendingProject(project);
      setInitError(null); // Clear any previous error
      setShowInitDialog(true);
    }
  };

  const [initError, setInitError] = useState<string | null>(null);

  const handleInitialize = async () => {
    if (!pendingProject) return;

    const projectId = pendingProject.id;
    setIsInitializing(true);
    setInitError(null);

    // Create a timeout promise
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Initialization timed out after 15 seconds' });
      }, 15000);
    });

    try {
      // Race between init and timeout
      const result = await Promise.race([
        initializeProject(projectId),
        timeoutPromise
      ]);

      console.log('[Sidebar] Initialize result:', result);

      if (result?.success) {
        // Success - close dialog
        setPendingProject(null);
        setShowInitDialog(false);
        setInitError(null);
      } else {
        // Failed - show error
        const errorMsg = result?.error || 'Initialization failed for unknown reason';
        console.error('[Sidebar] Initialize error:', errorMsg);
        setInitError(errorMsg);
      }
    } catch (error) {
      console.error('[Sidebar] Initialize exception:', error);
      setInitError(error instanceof Error ? error.message : 'Unexpected error during initialization');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSkipInit = () => {
    setShowInitDialog(false);
    setPendingProject(null);
  };

  const _handleUpdate = async () => {
    if (!selectedProjectId) return;

    setIsInitializing(true);
    try {
      const result = await updateProjectAutoBuild(selectedProjectId);
      if (result?.success) {
        setShowUpdateDialog(false);
        setVersionInfo(null);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const _handleSkipUpdate = () => {
    setShowUpdateDialog(false);
    setVersionInfo(null);
  };

  const handleGitInitialized = async () => {
    // Refresh git status after initialization
    if (selectedProject) {
      try {
        const result = await window.api.checkGitStatus(selectedProject.id);
        if (result.success && result.data) {
          setGitStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to refresh git status:', error);
      }
    }
  };

  const _handleRemoveProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await removeProject(projectId);
  };


  const handleNavClick = (view: SidebarView) => {
    onViewChange?.(view);
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = activeView === item.id;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        disabled={!selectedProjectId}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
          'hover:bg-accent hover:text-accent-foreground',
          'disabled:pointer-events-none disabled:opacity-50',
          isActive && 'bg-accent text-accent-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {item.shortcut && (
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded-md border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            {item.shortcut}
          </kbd>
        )}
      </button>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex h-full w-64 flex-col bg-sidebar border-r border-border">
        {/* Header with drag area - extra top padding for macOS traffic lights */}
        <div className="electron-drag flex h-14 items-center px-4 pt-6">
          <span className="electron-no-drag text-lg font-bold text-primary">Auto Claude Server</span>
        </div>

        <Separator className="mt-2" />

        {/* Project Selector */}
        <div className="px-3 py-3">
          <ProjectSelector
            selectedProjectId={currentProjectId}
            onProjectChange={(projectId) => {
              if (projectId) {
                selectProject(projectId);
                openProjectTab(projectId); // Also open/switch to the project tab
              }
            }}
          />
        </div>

        <Separator />

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-4">
            {/* Project Section */}
            <div className="mb-6">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </h3>
              <nav className="space-y-1">
                {projectNavItems.map(renderNavItem)}
              </nav>
            </div>

            {/* Tools Section */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </h3>
              <nav className="space-y-1">
                {toolsNavItems.map(renderNavItem)}
              </nav>
            </div>
          </div>
        </ScrollArea>

        <Separator />

        {/* Rate Limit Indicator - shows when Claude is rate limited */}
        <RateLimitIndicator />

        {/* Bottom section with Help and New Task */}
        <div className="p-4 space-y-3">
          {/* New Task button */}
          <Button
            className="w-full"
            onClick={onNewTaskClick}
            disabled={!selectedProjectId || !selectedProject?.autoBuildPath}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
          {selectedProject && !selectedProject.autoBuildPath && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Initialize Auto Claude to create tasks
            </p>
          )}
        </div>
      </div>

      {/* Initialize Auto Claude Dialog */}
      <Dialog open={showInitDialog} onOpenChange={(open) => {
        // Only allow closing if user manually closes (not during initialization)
        if (!open && !isInitializing) {
          handleSkipInit();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Initialize Auto Claude
            </DialogTitle>
            <DialogDescription>
              This project doesn't have Auto Claude initialized. Would you like to set it up now?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium mb-2">This will:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Create a <code className="text-xs bg-background px-1 py-0.5 rounded">.auto-claude</code> folder in your project</li>
                <li>Copy the Auto Claude framework files</li>
                <li>Set up the specs directory for your tasks</li>
              </ul>
            </div>
            {!settings.autoBuildPath && (
              <div className="mt-4 rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-warning">Source path not configured</p>
                    <p className="text-muted-foreground mt-1">
                      Please set the Auto Claude source path in App Settings before initializing.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {initError && (
              <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-destructive">Initialization Failed</p>
                    <p className="text-muted-foreground mt-1">{initError}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleSkipInit} disabled={isInitializing}>
              Skip
            </Button>
            <Button
              onClick={handleInitialize}
              disabled={isInitializing || !settings.autoBuildPath}
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Initialize
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Auto Claude Dialog - Deprecated, updateAvailable is always false now */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Auto Claude
            </DialogTitle>
            <DialogDescription>
              Project is initialized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Git Setup Modal */}
      <GitSetupModal
        open={showGitSetupModal}
        onOpenChange={setShowGitSetupModal}
        project={selectedProject || null}
        gitStatus={gitStatus}
        onGitInitialized={handleGitInitialized}
      />
    </TooltipProvider>
  );
}
