import { create } from 'zustand';
import { mergeApi, type FeatureBranch, type MergePreviewResult, type MergeStatusResult } from '../lib/api';

interface FeatureBranchWithStatus extends FeatureBranch {
  status?: MergeStatusResult;
  isLoading?: boolean;
}

interface MergeState {
  // Feature branches for the current project
  featureBranches: FeatureBranchWithStatus[];
  isLoadingBranches: boolean;

  // Selected branch for operations
  selectedBranchName: string | null;

  // Merge preview
  mergePreview: MergePreviewResult | null;
  isLoadingPreview: boolean;

  // Merge operation state
  isMerging: boolean;
  mergeResult: { success: boolean; message: string } | null;

  // Dev branch status
  hasDevBranch: boolean;
  isCreatingDevBranch: boolean;

  // Error state
  error: string | null;

  // Actions
  setFeatureBranches: (branches: FeatureBranchWithStatus[]) => void;
  setIsLoadingBranches: (loading: boolean) => void;
  setSelectedBranchName: (name: string | null) => void;
  setMergePreview: (preview: MergePreviewResult | null) => void;
  setIsLoadingPreview: (loading: boolean) => void;
  setIsMerging: (merging: boolean) => void;
  setMergeResult: (result: { success: boolean; message: string } | null) => void;
  setHasDevBranch: (has: boolean) => void;
  setIsCreatingDevBranch: (creating: boolean) => void;
  updateBranchStatus: (branchName: string, status: MergeStatusResult) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  featureBranches: [],
  isLoadingBranches: false,
  selectedBranchName: null,
  mergePreview: null,
  isLoadingPreview: false,
  isMerging: false,
  mergeResult: null,
  hasDevBranch: false,
  isCreatingDevBranch: false,
  error: null,
};

export const useMergeStore = create<MergeState>((set) => ({
  ...initialState,

  setFeatureBranches: (branches) => set({ featureBranches: branches }),
  setIsLoadingBranches: (loading) => set({ isLoadingBranches: loading }),
  setSelectedBranchName: (name) => set({ selectedBranchName: name, mergePreview: null }),
  setMergePreview: (preview) => set({ mergePreview: preview }),
  setIsLoadingPreview: (loading) => set({ isLoadingPreview: loading }),
  setIsMerging: (merging) => set({ isMerging: merging }),
  setMergeResult: (result) => set({ mergeResult: result }),
  setHasDevBranch: (has) => set({ hasDevBranch: has }),
  setIsCreatingDevBranch: (creating) => set({ isCreatingDevBranch: creating }),
  updateBranchStatus: (branchName, status) => set((state) => ({
    featureBranches: state.featureBranches.map((b) =>
      b.name === branchName ? { ...b, status, isLoading: false } : b
    ),
  })),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));

// ============================================
// Actions
// ============================================

/**
 * Load feature branches for a project
 */
export async function loadFeatureBranches(projectId: string): Promise<void> {
  const store = useMergeStore.getState();
  store.setIsLoadingBranches(true);
  store.setError(null);

  try {
    const result = await mergeApi.listFeatureBranches(projectId);
    if (result.success) {
      store.setFeatureBranches(result.branches);
      // Update dev branch status from response
      if ('hasDevBranch' in result) {
        store.setHasDevBranch(result.hasDevBranch);
      }
    } else {
      store.setError(result.error || 'Failed to load branches');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load branches');
  } finally {
    store.setIsLoadingBranches(false);
  }
}

/**
 * Load merge status for a specific task/branch
 */
export async function loadMergeStatus(taskId: string): Promise<MergeStatusResult | null> {
  const store = useMergeStore.getState();

  // Mark branch as loading
  const branchName = `feature/${taskId}`;
  store.setFeatureBranches(
    store.featureBranches.map((b) =>
      b.taskId === taskId ? { ...b, isLoading: true } : b
    )
  );

  try {
    const result = await mergeApi.status(taskId);
    if (result.success) {
      store.updateBranchStatus(branchName, result);
      return result;
    }
    return null;
  } catch (error) {
    console.error('Failed to load merge status:', error);
    return null;
  }
}

/**
 * Load merge preview for a task
 */
export async function loadMergePreview(
  taskId: string,
  sourceBranch?: string,
  targetBranch?: string
): Promise<void> {
  const store = useMergeStore.getState();
  store.setIsLoadingPreview(true);
  store.setError(null);

  try {
    const result = await mergeApi.preview(taskId, sourceBranch, targetBranch);
    store.setMergePreview(result);
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load merge preview');
  } finally {
    store.setIsLoadingPreview(false);
  }
}

/**
 * Merge a feature branch to dev
 */
export async function mergeFeatureToDev(
  taskId: string,
  options?: { noCommit?: boolean; message?: string }
): Promise<boolean> {
  const store = useMergeStore.getState();
  store.setIsMerging(true);
  store.setMergeResult(null);
  store.setError(null);

  try {
    const result = await mergeApi.mergeFeatureToDev(taskId, options);
    store.setMergeResult({
      success: result.success,
      message: result.message,
    });

    if (result.success) {
      // Refresh branch list after successful merge
      // Note: We'd need the projectId here, so the caller should handle this
    }

    return result.success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Merge failed';
    store.setMergeResult({ success: false, message });
    store.setError(message);
    return false;
  } finally {
    store.setIsMerging(false);
  }
}

/**
 * Merge a subtask into its parent feature branch
 */
export async function mergeSubtask(
  taskId: string,
  subtaskId: string,
  options?: { noCommit?: boolean; message?: string }
): Promise<boolean> {
  const store = useMergeStore.getState();
  store.setIsMerging(true);
  store.setMergeResult(null);
  store.setError(null);

  try {
    const result = await mergeApi.mergeSubtask(taskId, subtaskId, options);
    store.setMergeResult({
      success: result.success,
      message: result.message,
    });
    return result.success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Merge failed';
    store.setMergeResult({ success: false, message });
    store.setError(message);
    return false;
  } finally {
    store.setIsMerging(false);
  }
}

/**
 * Ensure dev branch exists
 */
export async function ensureDevBranch(projectId: string, baseBranch?: string): Promise<boolean> {
  const store = useMergeStore.getState();
  console.log('[MergeStore] ensureDevBranch called with projectId:', projectId);
  store.setIsCreatingDevBranch(true);
  store.setError(null);

  try {
    console.log('[MergeStore] Calling mergeApi.ensureDevBranch...');
    const result = await mergeApi.ensureDevBranch(projectId, baseBranch);
    console.log('[MergeStore] ensureDevBranch result:', result);
    store.setHasDevBranch(result.success);
    return result.success;
  } catch (error) {
    console.error('[MergeStore] ensureDevBranch error:', error);
    store.setError(error instanceof Error ? error.message : 'Failed to create dev branch');
    return false;
  } finally {
    store.setIsCreatingDevBranch(false);
  }
}

/**
 * Create a feature branch for a task
 */
export async function createFeatureBranch(
  taskId: string,
  baseBranch?: string
): Promise<string | null> {
  const store = useMergeStore.getState();
  store.setError(null);

  try {
    const result = await mergeApi.createFeatureBranch(taskId, baseBranch);
    if (result.success && result.branchName) {
      // Add to branches list
      store.setFeatureBranches([
        ...store.featureBranches,
        { name: result.branchName, taskId, isSubtask: false },
      ]);
      return result.branchName;
    }
    store.setError(result.error || 'Failed to create branch');
    return null;
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to create branch');
    return null;
  }
}

// ============================================
// Selectors
// ============================================

/**
 * Get branches that are ready to merge (have commits, no conflicts)
 */
export function getMergableBranches(): FeatureBranchWithStatus[] {
  const store = useMergeStore.getState();
  return store.featureBranches.filter(
    (b) => b.status?.branchExists && b.status?.canMergeToDev && !b.status?.hasConflicts
  );
}

/**
 * Get branches with conflicts
 */
export function getConflictingBranches(): FeatureBranchWithStatus[] {
  const store = useMergeStore.getState();
  return store.featureBranches.filter((b) => b.status?.hasConflicts);
}

/**
 * Get the selected branch
 */
export function getSelectedBranch(): FeatureBranchWithStatus | undefined {
  const store = useMergeStore.getState();
  return store.featureBranches.find((b) => b.name === store.selectedBranchName);
}
