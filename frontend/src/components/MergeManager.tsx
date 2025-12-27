import { useEffect, useState } from 'react';
import { GitBranch, GitMerge, Plus, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useProjectStore } from '../stores/project-store';
import { useTaskStore } from '../stores/task-store';
import {
  useMergeStore,
  loadFeatureBranches,
  loadMergeStatus,
  loadMergePreview,
  mergeFeatureToDev,
  ensureDevBranch,
} from '../stores/merge-store';
import { FeatureBranchCard } from './merge-manager/FeatureBranchCard';
import { MergePreviewDialog } from './merge-manager/MergePreviewDialog';

export function MergeManager() {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const tasks = useTaskStore((state) => state.tasks);

  const {
    featureBranches,
    isLoadingBranches,
    selectedBranchName,
    mergePreview,
    isLoadingPreview,
    isMerging,
    mergeResult,
    hasDevBranch,
    isCreatingDevBranch,
    error,
    setSelectedBranchName,
    setMergeResult,
  } = useMergeStore();

  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Load branches when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadFeatureBranches(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Load status for each branch
  useEffect(() => {
    featureBranches.forEach((branch) => {
      if (!branch.status && !branch.isLoading) {
        loadMergeStatus(branch.taskId);
      }
    });
  }, [featureBranches]);

  // Get task info for a branch
  const getTaskForBranch = (taskId: string) => {
    return tasks.find((t) => t.id === taskId || t.specId === taskId);
  };

  // Handle branch selection
  const handleSelectBranch = (branchName: string, taskId: string) => {
    setSelectedBranchName(branchName);
    setSelectedTaskId(taskId);
  };

  // Handle merge preview
  const handlePreview = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowPreviewDialog(true);
    await loadMergePreview(taskId);
  };

  // Handle merge confirmation
  const handleConfirmMerge = async () => {
    if (!selectedTaskId) return;

    const success = await mergeFeatureToDev(selectedTaskId);
    if (success) {
      setShowPreviewDialog(false);
      // Refresh branches
      if (selectedProjectId) {
        loadFeatureBranches(selectedProjectId);
      }
    }
  };

  // Handle direct merge (without preview)
  const handleMerge = async (taskId: string) => {
    setSelectedTaskId(taskId);
    await handlePreview(taskId);
  };

  // Handle creating dev branch
  const handleCreateDevBranch = async () => {
    if (!selectedProjectId) return;
    await ensureDevBranch(selectedProjectId);
    // Refresh branches
    loadFeatureBranches(selectedProjectId);
  };

  // Handle refresh
  const handleRefresh = () => {
    if (selectedProjectId) {
      loadFeatureBranches(selectedProjectId);
    }
  };

  // Dismiss merge result
  const handleDismissResult = () => {
    setMergeResult(null);
  };

  // Group branches by mergability
  const readyBranches = featureBranches.filter(
    (b) => b.status?.branchExists && b.status?.canMergeToDev && !b.status?.hasConflicts && (b.status?.commitsAhead || 0) > 0
  );
  const conflictBranches = featureBranches.filter((b) => b.status?.hasConflicts);
  const emptyBranches = featureBranches.filter(
    (b) => b.status?.branchExists && !b.status?.hasConflicts && (b.status?.commitsAhead || 0) === 0
  );

  if (!selectedProjectId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to manage merges</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitMerge className="h-6 w-6" />
            Merge Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage feature branch merges into the dev branch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoadingBranches}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingBranches ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Merge Result Alert */}
          {mergeResult && (
            <Alert variant={mergeResult.success ? 'default' : 'destructive'}>
              {mergeResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>{mergeResult.success ? 'Merge Successful' : 'Merge Failed'}</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{mergeResult.message}</span>
                <Button variant="ghost" size="sm" onClick={handleDismissResult}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Dev Branch Setup Card */}
          {!hasDevBranch && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Set Up Dev Branch
                </CardTitle>
                <CardDescription>
                  The hierarchical branching model requires a dev branch. Create one to start managing merges.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleCreateDevBranch} disabled={isCreatingDevBranch}>
                  {isCreatingDevBranch ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <GitBranch className="h-4 w-4 mr-2" />
                      Create Dev Branch
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {isLoadingBranches ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : featureBranches.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitBranch className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">
                  No feature branches found.
                  <br />
                  Feature branches are created when tasks are executed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Ready to Merge */}
              {readyBranches.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Ready to Merge ({readyBranches.length})
                  </h2>
                  <div className="grid gap-4">
                    {readyBranches.map((branch) => {
                      const task = getTaskForBranch(branch.taskId);
                      return (
                        <FeatureBranchCard
                          key={branch.name}
                          name={branch.name}
                          taskId={branch.taskId}
                          taskTitle={task?.title}
                          status={branch.status}
                          isSelected={selectedBranchName === branch.name}
                          isLoading={branch.isLoading}
                          onSelect={() => handleSelectBranch(branch.name, branch.taskId)}
                          onMerge={() => handleMerge(branch.taskId)}
                          onPreview={() => handlePreview(branch.taskId)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Has Conflicts */}
              {conflictBranches.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Has Conflicts ({conflictBranches.length})
                  </h2>
                  <div className="grid gap-4">
                    {conflictBranches.map((branch) => {
                      const task = getTaskForBranch(branch.taskId);
                      return (
                        <FeatureBranchCard
                          key={branch.name}
                          name={branch.name}
                          taskId={branch.taskId}
                          taskTitle={task?.title}
                          status={branch.status}
                          isSelected={selectedBranchName === branch.name}
                          isLoading={branch.isLoading}
                          onSelect={() => handleSelectBranch(branch.name, branch.taskId)}
                          onPreview={() => handlePreview(branch.taskId)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Up to Date */}
              {emptyBranches.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="h-5 w-5" />
                    Up to Date ({emptyBranches.length})
                  </h2>
                  <div className="grid gap-4">
                    {emptyBranches.map((branch) => {
                      const task = getTaskForBranch(branch.taskId);
                      return (
                        <FeatureBranchCard
                          key={branch.name}
                          name={branch.name}
                          taskId={branch.taskId}
                          taskTitle={task?.title}
                          status={branch.status}
                          isSelected={selectedBranchName === branch.name}
                          isLoading={branch.isLoading}
                          onSelect={() => handleSelectBranch(branch.name, branch.taskId)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Merge Preview Dialog */}
      <MergePreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        preview={mergePreview}
        isLoading={isLoadingPreview}
        onConfirmMerge={handleConfirmMerge}
        isMerging={isMerging}
      />
    </div>
  );
}
