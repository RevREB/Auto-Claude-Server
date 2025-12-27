import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { TooltipProvider } from './components/ui/tooltip';
import { Button } from './components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './components/ui/tooltip';
import { Sidebar, type SidebarView } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetailModal } from './components/task-detail/TaskDetailModal';
import { TaskCreationWizard } from './components/TaskCreationWizard';
import { AppSettingsDialog, type AppSection } from './components/settings/AppSettings';
import type { ProjectSettingsSection } from './components/settings/ProjectSettingsContent';
import { TerminalGrid } from './components/TerminalGrid';
import { Roadmap } from './components/Roadmap';
import { Context } from './components/Context';
import { Ideation } from './components/Ideation';
import { Insights } from './components/Insights';
import { GitHubIssues } from './components/GitHubIssues';
import { Changelog } from './components/Changelog';
import { MergeManager } from './components/MergeManager';
import { ReleaseManager } from './components/ReleaseManager';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RateLimitModal } from './components/RateLimitModal';
import { SDKRateLimitModal } from './components/SDKRateLimitModal';
import { OnboardingWizard } from './components/onboarding';
import { AppUpdateNotification } from './components/AppUpdateNotification';
import { UsageIndicator } from './components/UsageIndicator';
import { ProactiveSwapListener } from './components/ProactiveSwapListener';
import { VersionCheck } from './components/VersionCheck';
import { AddProjectModal } from './components/AddProjectModal';
import { useProjectStore, loadProjects, addProject } from './stores/project-store';
import { useTaskStore, loadTasks, reconcileTasks, setActiveProjectForTasks } from './stores/task-store';
import { wsService } from './lib/websocket-service';
import { useSettingsStore, loadSettings } from './stores/settings-store';
import { useTerminalStore, restoreTerminalSessions } from './stores/terminal-store';
import { useIpcListeners } from './hooks/useIpc';
import { COLOR_THEMES } from '../shared/constants';
import type { Task, Project, ColorTheme } from '../shared/types';

export function App() {
  // Load IPC listeners for real-time updates
  useIpcListeners();

  // Stores
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const openProjectTab = useProjectStore((state) => state.openProjectTab);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const tasks = useTaskStore((state) => state.tasks);
  const settings = useSettingsStore((state) => state.settings);
  const settingsLoading = useSettingsStore((state) => state.isLoading);

  // UI State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<AppSection | undefined>(undefined);
  const [settingsInitialProjectSection, setSettingsInitialProjectSection] = useState<ProjectSettingsSection | undefined>(undefined);
  const [activeView, setActiveView] = useState<SidebarView>('kanban');
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);


  // Get selected project
  const selectedProject = projects.find((p) => p.id === (activeProjectId || selectedProjectId));

  // Initial load
  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  // State reconciliation on WebSocket reconnect, visibility change, and periodic sync
  useEffect(() => {
    const currentProjectId = activeProjectId || selectedProjectId;
    if (!currentProjectId) return;

    // Reconcile on WebSocket reconnect
    const unsubscribeReconnect = wsService.onReconnect(() => {
      console.log('[App] WebSocket reconnected, reconciling tasks');
      reconcileTasks(currentProjectId);
    });

    // Reconcile when tab becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] Tab became visible, reconciling tasks');
        reconcileTasks(currentProjectId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic reconciliation as safety net (every 5 seconds)
    const periodicReconcile = setInterval(() => {
      reconcileTasks(currentProjectId);
    }, 5000);

    return () => {
      unsubscribeReconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(periodicReconcile);
    };
  }, [activeProjectId, selectedProjectId]);

  // Ensure there's an active project selected when projects load
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId && !selectedProjectId) {
      // No project selected, select the first one
      console.log('[App] No project selected, selecting first project:', projects[0].id);
      setActiveProject(projects[0].id);
    }
  }, [projects, activeProjectId, selectedProjectId, setActiveProject]);

  // Track if settings have been loaded at least once
  const [settingsHaveLoaded, setSettingsHaveLoaded] = useState(false);

  // Mark settings as loaded when loading completes
  useEffect(() => {
    if (!settingsLoading && !settingsHaveLoaded) {
      setSettingsHaveLoaded(true);
    }
  }, [settingsLoading, settingsHaveLoaded]);

  // First-run detection - show onboarding wizard if not completed
  // Only check AFTER settings have been loaded from disk to avoid race condition
  useEffect(() => {
    if (settingsHaveLoaded && settings.onboardingCompleted === false) {
      setIsOnboardingWizardOpen(true);
    }
  }, [settingsHaveLoaded, settings.onboardingCompleted]);

  // Listen for open-app-settings events (e.g., from project settings)
  useEffect(() => {
    const handleOpenAppSettings = (event: Event) => {
      const customEvent = event as CustomEvent<AppSection>;
      const section = customEvent.detail;
      if (section) {
        setSettingsInitialSection(section);
      }
      setIsSettingsDialogOpen(true);
    };

    window.addEventListener('open-app-settings', handleOpenAppSettings);
    return () => {
      window.removeEventListener('open-app-settings', handleOpenAppSettings);
    };
  }, []);

  // Listen for app updates - auto-open settings to 'updates' section when update is ready
  useEffect(() => {
    // When an update is downloaded and ready to install, open settings to updates section
    const cleanupDownloaded = window.api.onAppUpdateDownloaded(() => {
      console.warn('[App] Update downloaded, opening settings to updates section');
      setSettingsInitialSection('updates');
      setIsSettingsDialogOpen(true);
    });

    return () => {
      cleanupDownloaded();
    };
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+T to add project (when not on terminals view)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl+T: Add new project (only when not on terminals view)
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && activeView !== 'terminals') {
        e.preventDefault();
        try {
          const path = await window.api.selectDirectory();
          if (path) {
            const project = await addProject(path);
            if (project) {
              openProjectTab(project.id);
            }
          }
        } catch (error) {
          console.error('Failed to add project:', error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, openProjectTab]);

  // Load tasks when project changes
  useEffect(() => {
    const currentProjectId = activeProjectId || selectedProjectId;
    // Always clear tasks first when project changes to avoid stale data
    useTaskStore.getState().clearTasks();
    setSelectedTask(null); // Clear selection on project change

    // Set active project for filtering WebSocket events
    setActiveProjectForTasks(currentProjectId);

    if (currentProjectId) {
      loadTasks(currentProjectId);
    }

    // Handle terminals on project change
    const currentTerminals = useTerminalStore.getState().terminals;

    // Close existing terminals (they belong to the previous project)
    currentTerminals.forEach((t) => {
      window.api.destroyTerminal(t.id);
    });
    useTerminalStore.getState().clearAllTerminals();

    // Try to restore saved sessions for the new project
    if (selectedProject?.path) {
      restoreTerminalSessions(selectedProject.path).catch((err) => {
        console.error('[App] Failed to restore sessions:', err);
      });
    }
  }, [activeProjectId, selectedProjectId, selectedProject?.path, selectedProject?.name]);

  // Apply theme on load
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      // Apply light/dark mode
      if (settings.theme === 'dark') {
        root.classList.add('dark');
      } else if (settings.theme === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    // Apply color theme via data-theme attribute
    // Validate colorTheme against known themes, fallback to 'default' if invalid
    const validThemeIds = COLOR_THEMES.map((t) => t.id);
    const rawColorTheme = settings.colorTheme ?? 'default';
    const colorTheme: ColorTheme = validThemeIds.includes(rawColorTheme as ColorTheme)
      ? (rawColorTheme as ColorTheme)
      : 'default';

    if (colorTheme === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', colorTheme);
    }

    applyTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.theme === 'system') {
        applyTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [settings.theme, settings.colorTheme]);

  // Update selected task when tasks change (for real-time updates)
  useEffect(() => {
    if (selectedTask) {
      const updatedTask = tasks.find(
        (t) => t.id === selectedTask.id || t.specId === selectedTask.specId
      );
      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
    }
  }, [tasks, selectedTask?.id, selectedTask?.specId, selectedTask]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleCloseTaskDetail = () => {
    setSelectedTask(null);
  };

  const handleAddProject = async () => {
    try {
      const path = await window.api.selectDirectory();
      if (path) {
        const project = await addProject(path);
        if (project) {
          // Open a tab for the new project
          openProjectTab(project.id);

          if (!project.autoBuildPath) {
            // Project doesn't have Auto Claude initialized, show init dialog
            setPendingProject(project);
            setInitError(null); // Clear any previous errors
            setInitSuccess(false); // Reset success flag
            setShowInitDialog(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to add project:', error);
    }
  };

  const handleProjectAdded = (project: Project) => {
    // Open a tab for the new project
    openProjectTab(project.id);
  };

  const handleGoToTask = (taskId: string) => {
    // Switch to kanban view
    setActiveView('kanban');
    // Find and select the task (match by id or specId)
    const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      setSelectedTask(task);
    }
  };

  return (
    <TooltipProvider>
      <ProactiveSwapListener />
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar
          onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="electron-drag flex h-14 items-center justify-between border-b border-border bg-card/50 backdrop-blur-sm px-6">
            <div className="electron-no-drag">
              {selectedProject ? (
                <h1 className="font-semibold text-foreground">{selectedProject.name}</h1>
              ) : (
                <div className="text-muted-foreground">
                  Select a project to get started
                </div>
              )}
            </div>
            <div className="electron-no-drag flex items-center gap-3">
              {selectedProject && <UsageIndicator />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSettingsDialogOpen(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* Main content area */}
          <main className="flex flex-1 overflow-hidden">
            {selectedProject ? (
              <>
                {activeView === 'kanban' && (
                  <KanbanBoard
                    tasks={tasks}
                    onTaskClick={handleTaskClick}
                    onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
                  />
                )}
                {/* TerminalGrid is always mounted but hidden when not active to preserve terminal state */}
                <div className={activeView === 'terminals' ? 'h-full' : 'hidden'}>
                  <TerminalGrid
                    projectPath={selectedProject?.path}
                    onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
                    isActive={activeView === 'terminals'}
                  />
                </div>
                {activeView === 'roadmap' && (activeProjectId || selectedProjectId) && (
                  <Roadmap projectId={activeProjectId || selectedProjectId!} onGoToTask={handleGoToTask} />
                )}
                {activeView === 'context' && (activeProjectId || selectedProjectId) && (
                  <Context projectId={activeProjectId || selectedProjectId!} />
                )}
                {activeView === 'ideation' && (activeProjectId || selectedProjectId) && (
                  <Ideation projectId={activeProjectId || selectedProjectId!} onGoToTask={handleGoToTask} />
                )}
                {activeView === 'insights' && (activeProjectId || selectedProjectId) && (
                  <Insights projectId={activeProjectId || selectedProjectId!} />
                )}
                {activeView === 'github-issues' && (activeProjectId || selectedProjectId) && (
                  <GitHubIssues
                    onOpenSettings={() => {
                      setSettingsInitialProjectSection('github');
                      setIsSettingsDialogOpen(true);
                    }}
                    onNavigateToTask={handleGoToTask}
                  />
                )}
                {activeView === 'changelog' && (activeProjectId || selectedProjectId) && (
                  <Changelog />
                )}
                {activeView === 'merges' && (activeProjectId || selectedProjectId) && (
                  <MergeManager />
                )}
                {activeView === 'releases' && (activeProjectId || selectedProjectId) && (
                  <ReleaseManager />
                )}
                {activeView === 'agent-tools' && (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-lg font-semibold text-foreground">Agent Tools</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Configure and manage agent tools - Coming soon
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <WelcomeScreen
                projects={projects}
                onNewProject={() => setIsAddProjectModalOpen(true)}
                onOpenProject={handleAddProject}
                onSelectProject={(projectId) => {
                  openProjectTab(projectId);
                }}
              />
            )}
          </main>
        </div>

        {/* Task detail modal */}
        <TaskDetailModal
          open={!!selectedTask}
          task={selectedTask}
          onOpenChange={(open) => !open && handleCloseTaskDetail()}
        />

        {/* Dialogs */}
        {(activeProjectId || selectedProjectId) && (
          <TaskCreationWizard
            projectId={activeProjectId || selectedProjectId!}
            open={isNewTaskDialogOpen}
            onOpenChange={setIsNewTaskDialogOpen}
          />
        )}

        <AppSettingsDialog
          open={isSettingsDialogOpen}
          onOpenChange={(open) => {
            setIsSettingsDialogOpen(open);
            if (!open) {
              // Reset initial sections when dialog closes
              setSettingsInitialSection(undefined);
              setSettingsInitialProjectSection(undefined);
            }
          }}
          initialSection={settingsInitialSection}
          initialProjectSection={settingsInitialProjectSection}
          onRerunWizard={() => {
            // Reset onboarding state to trigger wizard
            useSettingsStore.getState().updateSettings({ onboardingCompleted: false });
            // Close settings dialog
            setIsSettingsDialogOpen(false);
            // Open onboarding wizard
            setIsOnboardingWizardOpen(true);
          }}
        />

        {/* Add Project Modal - for creating new projects or cloning repos */}
        <AddProjectModal
          open={isAddProjectModalOpen}
          onOpenChange={setIsAddProjectModalOpen}
          onProjectAdded={handleProjectAdded}
        />

        {/* Rate Limit Modal - shows when Claude Code hits usage limits (terminal) */}
        <RateLimitModal />

        {/* SDK Rate Limit Modal - shows when SDK/CLI operations hit limits (changelog, tasks, etc.) */}
        <SDKRateLimitModal />

        {/* Onboarding Wizard - shows on first launch when onboardingCompleted is false */}
        <OnboardingWizard
          open={isOnboardingWizardOpen}
          onOpenChange={setIsOnboardingWizardOpen}
          onOpenTaskCreator={() => {
            setIsOnboardingWizardOpen(false);
            setIsNewTaskDialogOpen(true);
          }}
          onOpenSettings={() => {
            setIsOnboardingWizardOpen(false);
            setIsSettingsDialogOpen(true);
          }}
        />

        {/* App Update Notification - shows when new app version is available */}
        <AppUpdateNotification />

        {/* Frontend Version Check - shows when new frontend build is available */}
        <VersionCheck />
      </div>
    </TooltipProvider>
  );
}
