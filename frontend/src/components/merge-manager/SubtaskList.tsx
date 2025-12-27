import { GitMerge, Check, Clock, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'merged' | 'failed';
  branchName?: string;
  mergedAt?: string;
}

interface SubtaskListProps {
  subtasks: Subtask[];
  taskId: string;
  onMergeSubtask?: (subtaskId: string) => void;
  isMerging?: boolean;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    label: 'Pending',
  },
  in_progress: {
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'In Progress',
  },
  completed: {
    icon: Check,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    label: 'Completed',
  },
  merged: {
    icon: GitMerge,
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    label: 'Merged',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    label: 'Failed',
  },
};

export function SubtaskList({ subtasks, taskId, onMergeSubtask, isMerging }: SubtaskListProps) {
  if (!subtasks || subtasks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No subtasks defined
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {subtasks.map((subtask) => {
        const config = statusConfig[subtask.status] || statusConfig.pending;
        const Icon = config.icon;
        const canMerge = subtask.status === 'completed' && subtask.branchName;

        return (
          <div
            key={subtask.id}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg p-3',
              config.bg
            )}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{subtask.title}</p>
                {subtask.branchName && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {subtask.branchName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-xs font-medium', config.color)}>
                {config.label}
              </span>

              {canMerge && onMergeSubtask && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onMergeSubtask(subtask.id)}
                  disabled={isMerging}
                >
                  <GitMerge className="h-3.5 w-3.5 mr-1" />
                  Merge
                </Button>
              )}

              {subtask.status === 'merged' && subtask.mergedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(subtask.mergedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
