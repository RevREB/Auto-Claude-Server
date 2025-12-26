import { useState, useEffect, useRef } from 'react';
import { GitBranch, GitMerge, CheckCircle2, AlertCircle, Loader2, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import type { Project } from '../../shared/types';
import type { BranchModelInfo, BranchModelStatus } from '../../shared/types/api';
import { projectMock } from '../lib/mocks/project-mock';

interface BranchMigrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  branchModelInfo?: BranchModelInfo | null;
  onMigrationComplete?: () => void;
  onSkip?: () => void;
}

type MigrationStep = 'info' | 'preview' | 'migrating' | 'success' | 'error';

export function BranchMigrationModal({
  open,
  onOpenChange,
  project,
  branchModelInfo,
  onMigrationComplete,
  onSkip
}: BranchMigrationModalProps) {
  const [step, setStep] = useState<MigrationStep>('info');
  const [isMigrating, setIsMigrating] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BranchModelStatus | null>(null);
  const [preview, setPreview] = useState<{
    branchesToCreate: string[];
    branchesToRename: string[];
    warnings: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    branchesCreated: string[];
    branchesRenamed: string[];
    warnings: string[];
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up countdown timer on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('info');
      setError(null);
      setPreview(null);
      setResult(null);
      setShowDetails(false);
      setCountdown(null);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      // Load status if we have a project
      if (project && branchModelInfo?.needsMigration) {
        loadStatus();
      }
    }
  }, [open, project, branchModelInfo]);

  const loadStatus = async () => {
    if (!project) return;

    try {
      const response = await projectMock.getBranchModelStatus(project.id);
      if (response.success && response.data) {
        setStatus(response.data.status);
      }
    } catch (err) {
      console.error('Failed to load branch model status:', err);
    }
  };

  const handleClose = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    onMigrationComplete?.();
    onOpenChange(false);
  };

  const startCountdown = () => {
    setCountdown(10);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          // Auto-close when countdown reaches 0
          handleClose();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleShowPreview = async () => {
    if (!project) return;

    setIsLoadingPreview(true);
    setError(null);

    try {
      const response = await projectMock.previewBranchModelMigration(project.id);
      if (response.success && response.data) {
        const hasChanges = (response.data.branchesToCreate?.length || 0) > 0 ||
                          (response.data.branchesToRename?.length || 0) > 0;

        setPreview({
          branchesToCreate: response.data.branchesToCreate || [],
          branchesToRename: response.data.branchesToRename || [],
          warnings: response.data.warnings || []
        });
        setStep('preview');

        // Start countdown if no changes needed
        if (!hasChanges) {
          startCountdown();
        }
      } else {
        setError(response.error || 'Failed to preview migration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview migration');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleMigrate = async () => {
    if (!project) return;

    setIsMigrating(true);
    setError(null);
    setStep('migrating');

    try {
      const response = await projectMock.migrateBranchModel(project.id);

      if (response.success && response.data) {
        setResult({
          branchesCreated: response.data.branchesCreated || [],
          branchesRenamed: response.data.branchesRenamed || [],
          warnings: response.data.warnings || []
        });

        if (response.data.errors && response.data.errors.length > 0) {
          setError(response.data.errors.join(', '));
          setStep('error');
        } else {
          setStep('success');
          // Auto-close after success
          setTimeout(() => {
            onMigrationComplete?.();
            onOpenChange(false);
          }, 2000);
        }
      } else {
        setError(response.error || 'Migration failed');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
      setStep('error');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onOpenChange(false);
  };

  const getModelLabel = (model: string) => {
    switch (model) {
      case 'flat': return 'Flat';
      case 'worktree': return 'Legacy Worktree';
      case 'hierarchical': return 'Hierarchical';
      default: return 'Unknown';
    }
  };

  const renderInfoStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          Branch Model Migration
        </DialogTitle>
        <DialogDescription>
          Migrate to the hierarchical branch model for better organization
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Current status */}
        <div className="rounded-lg bg-muted p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                Current model: {branchModelInfo ? getModelLabel(branchModelInfo.model) : 'Unknown'}
              </p>
              <p className="text-sm text-muted-foreground">
                {branchModelInfo?.message || 'This repository needs migration to the hierarchical branch model.'}
              </p>
            </div>
          </div>
        </div>

        {/* Branch hierarchy diagram */}
        <div className="rounded-lg border border-border p-4">
          <p className="font-medium text-sm mb-3">Target branch structure:</p>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-foreground font-semibold">main</span>
              <span className="text-xs">(production releases)</span>
            </div>
            <div className="flex items-center gap-2 ml-4 text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              <span className="text-foreground">release/1.0.0</span>
              <span className="text-xs">(release candidates)</span>
            </div>
            <div className="flex items-center gap-2 ml-8 text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              <span className="text-foreground font-semibold">dev</span>
              <span className="text-xs">(integration branch)</span>
            </div>
            <div className="flex items-center gap-2 ml-12 text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              <span className="text-foreground">feature/task-123</span>
              <span className="text-xs">(feature work)</span>
            </div>
          </div>
        </div>

        {/* Current branches if available */}
        {status && (
          <details className="text-sm" open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
              {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Current repository status
            </summary>
            <div className="mt-3 rounded-lg bg-muted/50 p-3 space-y-2 text-xs">
              {status.mainBranch && (
                <p><span className="font-medium">Main:</span> {status.mainBranch}</p>
              )}
              {status.devBranch && (
                <p><span className="font-medium">Dev:</span> {status.devBranch}</p>
              )}
              {status.worktreeBranches.length > 0 && (
                <div>
                  <p className="font-medium text-warning">Legacy branches to migrate:</p>
                  <ul className="ml-4 mt-1">
                    {status.worktreeBranches.map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {status.featureBranches.length > 0 && (
                <div>
                  <p className="font-medium">Feature branches:</p>
                  <ul className="ml-4 mt-1">
                    {status.featureBranches.slice(0, 5).map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                    {status.featureBranches.length > 5 && (
                      <li className="text-muted-foreground">... and {status.featureBranches.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleSkip}>
          Skip for now
        </Button>
        <Button onClick={handleShowPreview} disabled={isLoadingPreview}>
          {isLoadingPreview ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <GitMerge className="mr-2 h-4 w-4" />
              Preview Migration
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );

  const renderPreviewStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-primary" />
          Migration Preview
        </DialogTitle>
        <DialogDescription>
          Review the changes that will be made
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {preview && (
          <>
            {preview.branchesToCreate.length > 0 && (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="font-medium text-sm text-success mb-2">Branches to create:</p>
                <ul className="space-y-1">
                  {preview.branchesToCreate.map((branch, i) => (
                    <li key={i} className="text-sm flex items-center gap-2">
                      <span className="text-success">+</span>
                      <code className="bg-muted px-1 rounded">{branch}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.branchesToRename.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="font-medium text-sm text-primary mb-2">Branches to rename:</p>
                <ul className="space-y-1">
                  {preview.branchesToRename.map((rename, i) => (
                    <li key={i} className="text-sm flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <code className="bg-muted px-1 rounded">{rename}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <p className="font-medium text-sm text-warning mb-2">Warnings:</p>
                <ul className="space-y-1">
                  {preview.warnings.map((warning, i) => (
                    <li key={i} className="text-sm text-warning/90">• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.branchesToCreate.length === 0 && preview.branchesToRename.length === 0 && (
              <div className="rounded-lg bg-muted p-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No changes needed - repository is already set up!</p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => {
          // Stop countdown if going back
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setCountdown(null);
          setStep('info');
        }}>
          Back
        </Button>
        {preview && preview.branchesToCreate.length === 0 && preview.branchesToRename.length === 0 ? (
          <Button onClick={handleClose}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {countdown !== null ? `Continue (${countdown})` : 'Continue'}
          </Button>
        ) : (
          <Button onClick={handleMigrate} disabled={isMigrating}>
            <GitMerge className="mr-2 h-4 w-4" />
            Migrate Now
          </Button>
        )}
      </DialogFooter>
    </>
  );

  const renderMigratingStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Migrating Branch Model
        </DialogTitle>
      </DialogHeader>

      <div className="py-8 flex flex-col items-center justify-center">
        <div className="space-y-3 text-center">
          <GitMerge className="h-12 w-12 text-muted-foreground mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">
            Creating branches and updating repository structure...
          </p>
        </div>
      </div>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" />
          Migration Complete
        </DialogTitle>
      </DialogHeader>

      <div className="py-6 flex flex-col items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <p className="text-sm text-muted-foreground">
            Repository successfully migrated to hierarchical branch model!
          </p>
          {result && (
            <div className="text-xs text-muted-foreground space-y-1">
              {result.branchesCreated.length > 0 && (
                <p>Created: {result.branchesCreated.join(', ')}</p>
              )}
              {result.branchesRenamed.length > 0 && (
                <p>Renamed: {result.branchesRenamed.length} branches</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderErrorStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Migration Failed
        </DialogTitle>
      </DialogHeader>

      <div className="py-6 space-y-4">
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>

        {result && result.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <p className="font-medium text-sm text-warning mb-2">Warnings:</p>
            <ul className="space-y-1">
              {result.warnings.map((warning, i) => (
                <li key={i} className="text-sm text-warning/90">• {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleSkip}>
          Skip for now
        </Button>
        <Button onClick={() => setStep('info')}>
          Try Again
        </Button>
      </DialogFooter>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case 'info':
        return renderInfoStep();
      case 'preview':
        return renderPreviewStep();
      case 'migrating':
        return renderMigratingStep();
      case 'success':
        return renderSuccessStep();
      case 'error':
        return renderErrorStep();
      default:
        return renderInfoStep();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
