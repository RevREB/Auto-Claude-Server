import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { useProjectStore } from '../../stores/project-store';

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
}

export function ProjectSelector({
  selectedProjectId,
  onProjectChange
}: ProjectSelectorProps) {
  const projects = useProjectStore((state) => state.projects);
  const [open, setOpen] = useState(false);

  const handleValueChange = (value: string) => {
    onProjectChange(value || null);
    setOpen(false);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <>
      <Select
        value={selectedProjectId || ''}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={setOpen}
      >
        <SelectTrigger className="w-full [&_span]:truncate">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Select a project..." className="truncate min-w-0 flex-1" />
          </div>
        </SelectTrigger>
        <SelectContent className="min-w-(--radix-select-trigger-width) max-w-(--radix-select-trigger-width)">
          {projects.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              <p>No projects yet</p>
              <p className="text-xs mt-1">Add projects in Settings</p>
            </div>
          ) : (
            projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <span className="truncate" title={`${project.name} - ${project.path}`}>
                  {project.name}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Project path - shown when project is selected */}
      {selectedProject && (
        <div className="mt-2">
          <span
            className="truncate block text-xs text-muted-foreground"
            title={selectedProject.path}
          >
            {selectedProject.path}
          </span>
        </div>
      )}
    </>
  );
}
