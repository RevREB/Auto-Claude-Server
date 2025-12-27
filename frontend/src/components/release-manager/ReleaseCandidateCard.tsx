import { GitBranch, Tag, Rocket, Trash2, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface ReleaseCandidateCardProps {
  version: string;
  branch: string;
  status: 'candidate' | 'promoted' | 'abandoned';
  tag?: string | null;
  releaseNotes?: string | null;
  commitDate?: string;
  commitMessage?: string;
  isSelected?: boolean;
  isLoading?: boolean;
  onSelect?: () => void;
  onPromote?: () => void;
  onAbandon?: () => void;
}

const statusConfig = {
  candidate: {
    icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    label: 'Candidate',
  },
  promoted: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    label: 'Promoted',
  },
  abandoned: {
    icon: XCircle,
    color: 'text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    label: 'Abandoned',
  },
};

export function ReleaseCandidateCard({
  version,
  branch,
  status,
  tag,
  releaseNotes,
  commitDate,
  commitMessage,
  isSelected,
  isLoading,
  onSelect,
  onPromote,
  onAbandon,
}: ReleaseCandidateCardProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        isSelected
          ? 'ring-2 ring-primary border-primary'
          : 'hover:border-primary/50',
        status === 'abandoned' && 'opacity-60'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', config.bg)}>
              <Tag className={cn('h-5 w-5', config.color)} />
            </div>
            <div>
              <p className="text-xl font-bold font-mono">v{version}</p>
              <div className="flex items-center gap-2 mt-1">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono text-muted-foreground">{branch}</span>
              </div>
            </div>
          </div>
          <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', config.bg, config.color)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {config.label}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Commit Info */}
        {(commitDate || commitMessage) && (
          <div className="text-sm text-muted-foreground">
            {commitDate && (
              <p className="text-xs">
                Last commit: {new Date(commitDate).toLocaleDateString()}
              </p>
            )}
            {commitMessage && (
              <p className="truncate mt-0.5">{commitMessage}</p>
            )}
          </div>
        )}

        {/* Release Notes Preview */}
        {releaseNotes && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes</p>
            <p className="text-sm line-clamp-2">{releaseNotes}</p>
          </div>
        )}

        {/* Tag if promoted */}
        {tag && (
          <div className="flex items-center gap-2 text-sm">
            <Tag className="h-4 w-4 text-green-500" />
            <span className="font-mono">{tag}</span>
          </div>
        )}

        {/* Actions */}
        {status === 'candidate' && (
          <div className="flex items-center gap-2 pt-2">
            {onPromote && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPromote();
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Promote to Main
              </Button>
            )}
            {onAbandon && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbandon();
                }}
                disabled={isLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Abandon
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
