import { useState } from 'react';
import { FolderOpen, Trash2, Plus, GitBranch, ListTodo, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { useProjectStore, removeProject } from '../../stores/project-store';
import { AddProjectModal } from '../AddProjectModal';
import { cn } from '../../lib/utils';
import type { Project } from '../../../shared/types';

interface ProjectsSettingsProps {
  onProjectSelect?: (projectId: string) => void;
}

export function ProjectsSettings({ onProjectSelect }: ProjectsSettingsProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);

  const [showAddModal, setShowAddModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      await removeProject(projectToDelete.id);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleProjectClick = (project: Project) => {
    selectProject(project.id);
    onProjectSelect?.(project.id);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Manage your projects and their settings
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-foreground mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add a project to get started with Auto Claude
            </p>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className={cn(
                'transition-all cursor-pointer hover:border-primary/50',
                selectedProjectId === project.id && 'border-primary bg-primary/5'
              )}
              onClick={() => handleProjectClick(project)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Project Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-medium truncate">{project.name}</h3>
                      {selectedProjectId === project.id && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-3" title={project.path}>
                      {project.path}
                    </p>

                    {/* Stats Row */}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {project.settings?.mainBranch && (
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5" />
                          <span>{project.settings.mainBranch}</span>
                        </div>
                      )}
                      {project.autoBuildPath && (
                        <div className="flex items-center gap-1.5">
                          <ListTodo className="h-3.5 w-3.5" />
                          <span>Auto-build configured</span>
                        </div>
                      )}
                      {project.createdAt && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Added {formatDate(project.createdAt)}</span>
                        </div>
                      )}
                      {!project.autoBuildPath && (
                        <div className="flex items-center gap-1.5 text-warning">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Needs initialization</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToDelete(project);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Project count */}
      {projects.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {projects.length} project{projects.length !== 1 ? 's' : ''} total
        </p>
      )}

      {/* Add Project Modal */}
      <AddProjectModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Project</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete <strong>{projectToDelete?.name}</strong>?
                </p>
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <strong>Warning:</strong> This will permanently delete all project files from the server. This action cannot be undone.
                </div>
                <p className="text-xs text-muted-foreground">
                  Path: {projectToDelete?.path}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
