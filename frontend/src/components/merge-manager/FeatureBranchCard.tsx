import { GitBranch, GitMerge, AlertTriangle, ChevronRight, FileCode, Plus, Minus, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { VersionImpactBadge } from './VersionImpactBadge';
import type { MergeStatusResult } from '../../lib/api';

interface FeatureBranchCardProps {
  name: string;
  taskId: string;
  taskTitle?: string;
  status?: MergeStatusResult;
  versionImpact?: 'major' | 'minor' | 'patch' | null;
  isBreaking?: boolean;
  isSelected?: boolean;
  isLoading?: boolean;
  onSelect?: () => void;
  onMerge?: () => void;
  onPreview?: () => void;
}

export function FeatureBranchCard({
  name,
  taskId,
  taskTitle,
  status,
  versionImpact,
  isBreaking,
  isSelected,
  isLoading,
  onSelect,
  onMerge,
  onPreview,
}: FeatureBranchCardProps) {
  const hasConflicts = status?.hasConflicts;
  const canMerge = status?.branchExists && status?.canMergeToDev && !hasConflicts;
  const commitsAhead = status?.commitsAhead || 0;
  const filesChanged = status?.filesChanged || 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        isSelected
          ? 'ring-2 ring-primary border-primary'
          : 'hover:border-primary/50',
        hasConflicts && 'border-amber-500/50'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <GitBranch className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium truncate">{name}</p>
              {taskTitle && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {taskTitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <VersionImpactBadge impact={versionImpact} isBreaking={isBreaking} />
            {hasConflicts && (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : status?.branchExists ? (
          <div className="space-y-3">
            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                <span>{commitsAhead} commits ahead</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                <span>{filesChanged} files</span>
              </div>
              {status.additions !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                    <Plus className="h-3 w-3" />
                    {status.additions}
                  </span>
                  <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                    <Minus className="h-3 w-3" />
                    {status.deletions}
                  </span>
                </div>
              )}
            </div>

            {/* Conflict Warning */}
            {hasConflicts && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2.5 py-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Merge conflicts detected - resolve before merging</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {onPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                >
                  Preview
                </Button>
              )}
              {onMerge && (
                <Button
                  size="sm"
                  disabled={!canMerge}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMerge();
                  }}
                >
                  <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                  Merge to Dev
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-2">
            No branch found for this task
          </div>
        )}
      </CardContent>
    </Card>
  );
}
