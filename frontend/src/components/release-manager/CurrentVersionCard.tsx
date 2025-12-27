import { Tag, ArrowRight, TrendingUp, AlertTriangle, Sparkles, Bug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';

interface CurrentVersionCardProps {
  currentVersion: string;
  nextVersion?: string;
  bumpType?: 'major' | 'minor' | 'patch';
  breakingChanges?: string[];
  features?: string[];
  fixes?: string[];
  isLoading?: boolean;
}

const bumpColors = {
  major: 'text-red-500 bg-red-50 dark:bg-red-900/20',
  minor: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  patch: 'text-gray-500 bg-gray-50 dark:bg-gray-800/50',
};

const bumpLabels = {
  major: 'Major Release',
  minor: 'Minor Release',
  patch: 'Patch Release',
};

export function CurrentVersionCard({
  currentVersion,
  nextVersion,
  bumpType,
  breakingChanges = [],
  features = [],
  fixes = [],
  isLoading,
}: CurrentVersionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Version Status
        </CardTitle>
        <CardDescription>Current version and suggested next version</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Version Display */}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold font-mono">v{currentVersion}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                  Current
                </p>
              </div>

              {nextVersion && (
                <>
                  <ArrowRight className="h-6 w-6 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-3xl font-bold font-mono text-primary">v{nextVersion}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                      Suggested
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Bump Type Badge */}
            {bumpType && (
              <div className="flex justify-center">
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full',
                    bumpColors[bumpType]
                  )}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">{bumpLabels[bumpType]}</span>
                </div>
              </div>
            )}

            {/* Change Summary */}
            <div className="space-y-3">
              {breakingChanges.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Breaking Changes ({breakingChanges.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {breakingChanges.slice(0, 3).map((change, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400 truncate">
                        {change}
                      </li>
                    ))}
                    {breakingChanges.length > 3 && (
                      <li className="text-xs text-red-500 dark:text-red-400">
                        +{breakingChanges.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {features.length > 0 && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Features ({features.length})</span>
                  </div>
                  <ul className="space-y-1">
                    {features.slice(0, 3).map((feature, i) => (
                      <li key={i} className="text-sm text-blue-600 dark:text-blue-400 truncate">
                        {feature}
                      </li>
                    ))}
                    {features.length > 3 && (
                      <li className="text-xs text-blue-500 dark:text-blue-400">
                        +{features.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {fixes.length > 0 && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2">
                    <Bug className="h-4 w-4" />
                    <span className="text-sm font-medium">Bug Fixes ({fixes.length})</span>
                  </div>
                  <ul className="space-y-1">
                    {fixes.slice(0, 3).map((fix, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {fix}
                      </li>
                    ))}
                    {fixes.length > 3 && (
                      <li className="text-xs text-gray-500 dark:text-gray-400">
                        +{fixes.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {breakingChanges.length === 0 && features.length === 0 && fixes.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No unreleased changes detected
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
