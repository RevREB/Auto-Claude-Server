import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../../stores/project-store';
import { checkTaskRunning, isIncompleteHumanReview, getTaskProgress } from '../../../stores/task-store';
import { workspaceApi, tasksApi } from '../../../lib/api';
import { wsService } from '../../../lib/websocket-service';
import type { Task, TaskLogs, TaskLogPhase, WorktreeStatus, WorktreeDiff, MergeConflict, MergeStats, GitConflictInfo } from '../../../../shared/types';

export interface UseTaskDetailOptions {
  task: Task;
}

export function useTaskDetail({ task }: UseTaskDetailOptions) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [hasCheckedRunning, setHasCheckedRunning] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [worktreeStatus, setWorktreeStatus] = useState<WorktreeStatus | null>(null);
  const [worktreeDiff, setWorktreeDiff] = useState<WorktreeDiff | null>(null);
  const [isLoadingWorktree, setIsLoadingWorktree] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [stageOnly, setStageOnly] = useState(task.status === 'human_review');
  const [stagedSuccess, setStagedSuccess] = useState<string | null>(null);
  const [stagedProjectPath, setStagedProjectPath] = useState<string | undefined>(undefined);
  const [suggestedCommitMessage, setSuggestedCommitMessage] = useState<string | undefined>(undefined);
  const [phaseLogs, setPhaseLogs] = useState<TaskLogs | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<TaskLogPhase>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Merge preview state
  const [mergePreview, setMergePreview] = useState<{
    files: string[];
    conflicts: MergeConflict[];
    summary: MergeStats;
    gitConflicts?: GitConflictInfo;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const selectedProject = useProjectStore((state) => state.getSelectedProject());
  const isRunning = task.status === 'in_progress' || task.status === 'ai_review';
  const needsReview = task.status === 'human_review';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';
  const isIncomplete = isIncompleteHumanReview(task);
  const taskProgress = getTaskProgress(task);

  // Check if task is stuck (status says in_progress but no actual process)
  // Add a grace period to avoid false positives during process spawn
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (isRunning && !hasCheckedRunning) {
      // Wait 2 seconds before checking - gives process time to spawn and register
      timeoutId = setTimeout(() => {
        checkTaskRunning(task.id).then((actuallyRunning) => {
          setIsStuck(!actuallyRunning);
          setHasCheckedRunning(true);
        });
      }, 2000);
    } else if (!isRunning) {
      setIsStuck(false);
      setHasCheckedRunning(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [task.id, isRunning, hasCheckedRunning]);

  // Handle scroll events in logs to detect if user scrolled up
  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setIsUserScrolledUp(!isNearBottom);
  };

  // Auto-scroll logs to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current && !isUserScrolledUp) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [task.logs, activeTab, isUserScrolledUp]);

  // Reset scroll state when switching to logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      setIsUserScrolledUp(false);
    }
  }, [activeTab]);

  // Load worktree status when task is in human_review
  useEffect(() => {
    if (needsReview) {
      setIsLoadingWorktree(true);
      setWorkspaceError(null);

      Promise.all([
        workspaceApi.getStatus(task.id),
        workspaceApi.getDiff(task.id)
      ]).then(([statusResult, diffResult]) => {
        console.log('[useTaskDetail] Worktree status:', statusResult);
        console.log('[useTaskDetail] Worktree diff:', diffResult);
        setWorktreeStatus(statusResult as WorktreeStatus);
        setWorktreeDiff(diffResult as WorktreeDiff);
      }).catch((err) => {
        console.error('Failed to load worktree info:', err);
        setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspace');
      }).finally(() => {
        setIsLoadingWorktree(false);
      });
    } else {
      setWorktreeStatus(null);
      setWorktreeDiff(null);
    }
  }, [task.id, needsReview]);

  // Load and watch phase logs
  useEffect(() => {
    if (!selectedProject) return;

    const loadLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const result = await tasksApi.getLogs(selectedProject.id, task.specId);
        console.log('[useTaskDetail] Task logs result:', result);
        if (result) {
          setPhaseLogs(result as TaskLogs);
          // Auto-expand active phase
          const logsData = result as TaskLogs;
          const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
            phase => logsData?.phases?.[phase]?.status === 'active'
          );
          if (activePhase) {
            setExpandedPhases(new Set([activePhase]));
          }
        }
      } catch (err) {
        console.error('Failed to load task logs:', err);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    loadLogs();

    // Subscribe to log change events via WebSocket
    const unsubscribe = wsService.on(`task.${task.id}.logs`, (data) => {
      console.log('[useTaskDetail] Received log update:', data);
      if (data.logs) {
        setPhaseLogs(data.logs);
        // Auto-expand newly active phase
        const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
          phase => data.logs.phases?.[phase]?.status === 'active'
        );
        if (activePhase) {
          setExpandedPhases(prev => {
            const next = new Set(prev);
            next.add(activePhase);
            return next;
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedProject, task.specId, task.id]);

  // Toggle phase expansion
  const togglePhase = useCallback((phase: TaskLogPhase) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, []);

  // Restore merge preview from sessionStorage on mount (survives HMR reloads)
  useEffect(() => {
    const storageKey = `mergePreview-${task.id}`;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        const previewData = JSON.parse(stored);
        console.warn('%c[useTaskDetail] Restored merge preview from sessionStorage:', 'color: magenta;', previewData);
        setMergePreview(previewData);
        // Don't auto-popup - restored data stays silent
      } catch {
        console.warn('[useTaskDetail] Failed to parse stored merge preview');
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [task.id]);

  // Load merge preview (conflict detection)
  const loadMergePreview = useCallback(async () => {
    console.log('[useTaskDetail] loadMergePreview called for task:', task.id);
    setIsLoadingPreview(true);
    try {
      const result = await workspaceApi.mergePreview(task.id);
      console.log('[useTaskDetail] mergePreview result:', result);
      if (result.success && result.preview) {
        const previewData = result.preview;
        console.log('[useTaskDetail] Setting merge preview:', previewData);
        setMergePreview(previewData);
        // Persist to sessionStorage to survive HMR reloads
        sessionStorage.setItem(`mergePreview-${task.id}`, JSON.stringify(previewData));
      } else {
        console.log('[useTaskDetail] Preview not successful or no preview data:', result);
      }
    } catch (err) {
      console.error('[useTaskDetail] Failed to load merge preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [task.id]);

  // Auto-load merge preview when worktree is ready (eliminates need to click "Check Conflicts")
  // NOTE: This must be placed AFTER loadMergePreview definition since it depends on that callback
  useEffect(() => {
    // Only auto-load if:
    // 1. Task needs review
    // 2. Worktree exists
    // 3. We haven't already loaded the preview
    // 4. We're not currently loading
    if (needsReview && worktreeStatus?.exists && !mergePreview && !isLoadingPreview) {
      console.warn('[useTaskDetail] Auto-loading merge preview for task:', task.id);
      loadMergePreview();
    }
  }, [needsReview, worktreeStatus?.exists, mergePreview, isLoadingPreview, task.id, loadMergePreview]);

  return {
    // State
    feedback,
    isSubmitting,
    activeTab,
    isUserScrolledUp,
    isStuck,
    isRecovering,
    hasCheckedRunning,
    showDeleteDialog,
    isDeleting,
    deleteError,
    isEditDialogOpen,
    worktreeStatus,
    worktreeDiff,
    isLoadingWorktree,
    isMerging,
    isDiscarding,
    showDiscardDialog,
    workspaceError,
    showDiffDialog,
    stageOnly,
    stagedSuccess,
    stagedProjectPath,
    suggestedCommitMessage,
    phaseLogs,
    isLoadingLogs,
    expandedPhases,
    logsEndRef,
    logsContainerRef,
    selectedProject,
    isRunning,
    needsReview,
    executionPhase,
    hasActiveExecution,
    isIncomplete,
    taskProgress,
    mergePreview,
    isLoadingPreview,
    showConflictDialog,

    // Setters
    setFeedback,
    setIsSubmitting,
    setActiveTab,
    setIsUserScrolledUp,
    setIsStuck,
    setIsRecovering,
    setHasCheckedRunning,
    setShowDeleteDialog,
    setIsDeleting,
    setDeleteError,
    setIsEditDialogOpen,
    setWorktreeStatus,
    setWorktreeDiff,
    setIsLoadingWorktree,
    setIsMerging,
    setIsDiscarding,
    setShowDiscardDialog,
    setWorkspaceError,
    setShowDiffDialog,
    setStageOnly,
    setStagedSuccess,
    setStagedProjectPath,
    setSuggestedCommitMessage,
    setPhaseLogs,
    setIsLoadingLogs,
    setExpandedPhases,
    setMergePreview,
    setIsLoadingPreview,
    setShowConflictDialog,

    // Handlers
    handleLogsScroll,
    togglePhase,
    loadMergePreview,
  };
}
