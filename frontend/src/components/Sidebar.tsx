import { useState, useEffect } from 'react';
import {
  Plus,
  LayoutGrid,
  Terminal,
  Map,
  BookOpen,
  Lightbulb,
  Github,
  FileText,
  Sparkles,
  GitMerge,
  Rocket
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { TooltipProvider } from './ui/tooltip';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/project-store';
import { GitSetupModal } from './GitSetupModal';
import { RateLimitIndicator } from './RateLimitIndicator';
import { ProjectSelector } from './settings/ProjectSelector';
import type { GitStatus } from '../../shared/types';

export type SidebarView = 'kanban' | 'terminals' | 'roadmap' | 'context' | 'ideation' | 'github-issues' | 'changelog' | 'insights' | 'merges' | 'releases' | 'agent-tools';

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
  { id: 'merges', label: 'Merges', icon: GitMerge, shortcut: 'M' },
  { id: 'releases', label: 'Releases', icon: Rocket, shortcut: 'R' }
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

  const [showGitSetupModal, setShowGitSetupModal] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

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

        {/* Bottom section with New Task */}
        <div className="p-4 space-y-3">
          {/* New Task button */}
          <Button
            className="w-full"
            onClick={onNewTaskClick}
            disabled={!selectedProjectId}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

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
