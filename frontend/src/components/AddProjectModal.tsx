import { useState, useEffect } from 'react';
import { GitBranch, FolderPlus, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import { useProjectStore, addProject } from '../stores/project-store';
import { BranchMigrationModal } from './BranchMigrationModal';
import type { Project } from '../../shared/types';
import type { BranchModelInfo } from '../../shared/types/api';

type ModalStep = 'choose' | 'create-form' | 'clone-form';

interface AddProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project) => void;
}

export function AddProjectModal({ open, onOpenChange, onProjectAdded }: AddProjectModalProps) {
  const [step, setStep] = useState<ModalStep>('choose');
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [initGit, setInitGit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Branch migration modal state
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [clonedProject, setClonedProject] = useState<Project | null>(null);
  const [branchModelInfo, setBranchModelInfo] = useState<BranchModelInfo | null>(null);

  // Reset state and load default location when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setProjectName('');
      setInitGit(true);
      setError(null);
      setGitUrl('');
      setIsCloning(false);
      setShowMigrationModal(false);
      setClonedProject(null);
      setBranchModelInfo(null);

      // Load default location
      const loadDefaultLocation = async () => {
        try {
          const defaultDir = await window.api.getDefaultProjectLocation();
          if (defaultDir) {
            setProjectLocation(defaultDir);
          }
        } catch {
          // Use fallback
          setProjectLocation('/projects');
        }
      };
      loadDefaultLocation();
    }
  }, [open]);

  const handleCloneRepo = async () => {
    if (!gitUrl.trim()) {
      setError('Please enter a Git repository URL');
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      // Clone and add project in one step - backend handles everything
      const result = await window.api.cloneGitRepo(gitUrl.trim(), projectName.trim() || undefined);

      if (!result.success) {
        setError(result.error || 'Failed to clone repository');
        setIsCloning(false);
        return;
      }

      // Backend returns the created project - add to store and select it
      if (result.data?.project) {
        const project = result.data.project;
        const store = useProjectStore.getState();
        store.addProject(project);
        store.selectProject(project.id);
        store.openProjectTab(project.id);

        // Check if branch model migration is needed
        const branchModel = result.data.branchModel;
        if (branchModel?.needsMigration) {
          // Store project info and show migration modal
          setClonedProject(project);
          setBranchModelInfo(branchModel);
          setShowMigrationModal(true);
          onOpenChange(false); // Close the add project modal
        } else {
          onProjectAdded?.(project);
          onOpenChange(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository');
    } finally {
      setIsCloning(false);
    }
  };

  const handleMigrationComplete = () => {
    if (clonedProject) {
      onProjectAdded?.(clonedProject);
    }
    setShowMigrationModal(false);
    setClonedProject(null);
    setBranchModelInfo(null);
  };

  const handleMigrationSkip = () => {
    if (clonedProject) {
      onProjectAdded?.(clonedProject);
    }
    setShowMigrationModal(false);
    setClonedProject(null);
    setBranchModelInfo(null);
  };

  const handleSelectLocation = async () => {
    try {
      const path = await window.api.selectDirectory();
      if (path) {
        setProjectLocation(path);
      }
    } catch {
      // User cancelled - ignore
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError('Please enter a project name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Use default location if not specified
      let location = projectLocation.trim();
      if (!location) {
        location = '/projects';
      }

      // Create the project folder
      const result = await window.api.createProjectFolder(
        location,
        projectName.trim(),
        initGit
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to create project folder');
        return;
      }

      // Add the project to our store
      const project = await addProject(result.data.path);
      if (project) {
        // For new projects with git init, set main branch
        // Git init creates 'main' branch by default on modern git
        if (initGit) {
          try {
            const mainBranchResult = await window.api.detectMainBranch(result.data.path);
            if (mainBranchResult.success && mainBranchResult.data) {
              await window.api.updateProjectSettings(project.id, {
                mainBranch: mainBranchResult.data
              });
            }
          } catch {
            // Non-fatal - main branch can be set later in settings
          }
        }
        onProjectAdded?.(project);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const renderChooseStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>Add Project</DialogTitle>
        <DialogDescription>
          Choose how you'd like to add a project
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-3">
        {/* Clone Git Repo Option */}
        <button
          onClick={() => setStep('clone-form')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">Clone Git Repository</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Clone an existing repository from GitHub or GitLab
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Create New Option */}
        <button
          onClick={() => setStep('create-form')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <FolderPlus className="h-6 w-6 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">Create New Project</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Start fresh with a new project folder
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mt-2">
          {error}
        </div>
      )}
    </>
  );

  const renderCreateForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogDescription>
          Set up a new project folder
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">Project Name</Label>
          <Input
            id="project-name"
            placeholder="my-awesome-project"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This will be the folder name. Use lowercase with hyphens.
          </p>
        </div>

        {/* Location Preview */}
        {projectName && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Project will be created at:</Label>
            <div className="bg-muted rounded-lg p-3">
              <code className="text-sm">{projectLocation || '/projects'}/{projectName}</code>
            </div>
          </div>
        )}

        {/* Git Init Checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="init-git"
            checked={initGit}
            onChange={(e) => setInitGit(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background"
          />
          <Label htmlFor="init-git" className="text-sm font-normal cursor-pointer">
            Initialize git repository
          </Label>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCreating}>
          Back
        </Button>
        <Button onClick={handleCreateProject} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogFooter>
    </>
  );

  const renderCloneForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>Clone Git Repository</DialogTitle>
        <DialogDescription>
          Enter the URL of the repository to clone
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Git URL */}
        <div className="space-y-2">
          <Label htmlFor="git-url">Repository URL</Label>
          <Input
            id="git-url"
            placeholder="https://github.com/username/repository.git"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Supports HTTPS URLs from GitHub, GitLab, or any git host
          </p>
        </div>

        {/* Project Name (optional) */}
        <div className="space-y-2">
          <Label htmlFor="clone-name">Project Name (optional)</Label>
          <Input
            id="clone-name"
            placeholder="Leave empty to use repository name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Override the project name (defaults to repository name)
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCloning}>
          Back
        </Button>
        <Button onClick={handleCloneRepo} disabled={isCloning || !gitUrl.trim()}>
          {isCloning ? 'Cloning...' : 'Clone Repository'}
        </Button>
      </DialogFooter>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case 'choose':
        return renderChooseStep();
      case 'create-form':
        return renderCreateForm();
      case 'clone-form':
        return renderCloneForm();
      default:
        return renderChooseStep();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          {renderStep()}
        </DialogContent>
      </Dialog>

      {/* Branch Migration Modal - shown after cloning if migration needed */}
      <BranchMigrationModal
        open={showMigrationModal}
        onOpenChange={setShowMigrationModal}
        project={clonedProject}
        branchModelInfo={branchModelInfo}
        onMigrationComplete={handleMigrationComplete}
        onSkip={handleMigrationSkip}
      />
    </>
  );
}
