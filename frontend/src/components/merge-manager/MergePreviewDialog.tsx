import { GitMerge, FileCode, Plus, Minus, AlertTriangle, Loader2, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import type { MergePreviewResult } from '../../lib/api';

interface MergePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: MergePreviewResult | null;
  isLoading?: boolean;
  onConfirmMerge?: () => void;
  isMerging?: boolean;
}

export function MergePreviewDialog({
  open,
  onOpenChange,
  preview,
  isLoading,
  onConfirmMerge,
  isMerging,
}: MergePreviewDialogProps) {
  const hasConflicts = preview?.conflicts && preview.conflicts.length > 0;
  const canMerge = preview?.canMerge && !hasConflicts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Preview
          </DialogTitle>
          <DialogDescription>
            {preview?.sourceBranch && preview?.targetBranch && (
              <>
                Merging <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{preview.sourceBranch}</code>
                {' '}into{' '}
                <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{preview.targetBranch}</code>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{preview.commitsAhead || 0}</p>
                <p className="text-xs text-muted-foreground">Commits</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{preview.filesChanged || 0}</p>
                <p className="text-xs text-muted-foreground">Files</p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  +{preview.additions || 0}
                </p>
                <p className="text-xs text-muted-foreground">Additions</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  -{preview.deletions || 0}
                </p>
                <p className="text-xs text-muted-foreground">Deletions</p>
              </div>
            </div>

            {/* Conflict Warning */}
            {hasConflicts && (
              <div className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Merge conflicts detected
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    The following files have conflicts that need to be resolved manually:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {preview.conflicts?.map((conflict, i) => (
                      <li key={i} className="text-sm font-mono text-amber-700 dark:text-amber-300">
                        {conflict.file}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Can Merge Indicator */}
            {canMerge && (
              <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                <Check className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Ready to merge
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                    No conflicts detected. This branch can be merged automatically.
                  </p>
                </div>
              </div>
            )}

            {/* Changed Files List */}
            {preview.changedFiles && preview.changedFiles.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Changed Files</h4>
                <ScrollArea className="h-48 rounded-lg border">
                  <div className="p-2 space-y-1">
                    {preview.changedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-mono truncate">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                          <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No preview data available
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            onClick={onConfirmMerge}
            disabled={!canMerge || isMerging}
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-2" />
                Confirm Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
