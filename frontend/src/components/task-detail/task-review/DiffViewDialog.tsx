import { Eye, FileCode, ExternalLink } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import type { WorktreeDiff } from '../../../../shared/types';

interface DiffViewDialogProps {
  open: boolean;
  worktreeDiff: WorktreeDiff | null;
  worktreePath?: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog displaying the list of changed files with their status and line changes.
 * Each file is clickable and opens in code-server for review.
 */
export function DiffViewDialog({
  open,
  worktreeDiff,
  worktreePath,
  onOpenChange
}: DiffViewDialogProps) {
  // Build code-server URL to open a specific file
  const getCodeServerUrl = (filePath: string) => {
    if (!worktreePath) return null;
    const fullPath = `${worktreePath}/${filePath}`;
    // code-server URL format: http://localhost:8080/?folder=X&file=Y
    return `http://localhost:8080/?folder=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(fullPath)}`;
  };

  const openInCodeServer = (filePath: string) => {
    const url = getCodeServerUrl(filePath);
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-400" />
            Changed Files
          </AlertDialogTitle>
          <AlertDialogDescription>
            {worktreeDiff?.summary || 'No changes found'}
            {worktreePath && (
              <span className="block text-xs mt-1 text-muted-foreground">
                Click a file to open in Code-Server
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
          {worktreeDiff?.files && worktreeDiff.files.length > 0 ? (
            <div className="space-y-2">
              {worktreeDiff.files.map((file, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg bg-secondary/30 transition-colors",
                    worktreePath && "hover:bg-secondary/50 cursor-pointer"
                  )}
                  onClick={() => worktreePath && openInCodeServer(file.path)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileCode className={cn(
                      'h-4 w-4 shrink-0',
                      file.status === 'added' && 'text-success',
                      file.status === 'deleted' && 'text-destructive',
                      file.status === 'modified' && 'text-info',
                      file.status === 'renamed' && 'text-warning'
                    )} />
                    <span className="text-sm font-mono truncate">{file.path}</span>
                    {worktreePath && (
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        file.status === 'added' && 'bg-success/10 text-success',
                        file.status === 'deleted' && 'bg-destructive/10 text-destructive',
                        file.status === 'modified' && 'bg-info/10 text-info',
                        file.status === 'renamed' && 'bg-warning/10 text-warning'
                      )}
                    >
                      {file.status}
                    </Badge>
                    <span className="text-xs text-success">+{file.additions}</span>
                    <span className="text-xs text-destructive">-{file.deletions}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No changed files found
            </div>
          )}
        </div>
        <AlertDialogFooter className="mt-4">
          {worktreePath && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`http://localhost:8080/?folder=${encodeURIComponent(worktreePath)}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Folder in Code-Server
            </Button>
          )}
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
