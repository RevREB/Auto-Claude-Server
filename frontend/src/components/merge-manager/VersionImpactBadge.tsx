import { cn } from '../../lib/utils';

interface VersionImpactBadgeProps {
  impact: 'major' | 'minor' | 'patch' | null | undefined;
  isBreaking?: boolean;
  className?: string;
}

export function VersionImpactBadge({ impact, isBreaking, className }: VersionImpactBadgeProps) {
  if (!impact && !isBreaking) return null;

  const displayImpact = isBreaking ? 'major' : impact;

  const colors = {
    major: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    minor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    patch: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400',
  };

  const labels = {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        colors[displayImpact || 'patch'],
        className
      )}
    >
      {isBreaking && (
        <span className="text-red-600 dark:text-red-400">!</span>
      )}
      {labels[displayImpact || 'patch']}
    </span>
  );
}
