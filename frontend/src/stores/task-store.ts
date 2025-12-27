import { create } from 'zustand';
import { tasksApi } from '../lib/api';
import { wsService } from '../lib/websocket-service';
import type { Task, TaskStatus, ImplementationPlan, Subtask, TaskMetadata, ExecutionProgress, ExecutionPhase, ReviewReason, TaskDraft } from '../../shared/types';

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTaskFromPlan: (taskId: string, plan: ImplementationPlan) => void;
  updateExecutionProgress: (taskId: string, progress: Partial<ExecutionProgress>) => void;
  appendLog: (taskId: string, log: string) => void;
  selectTask: (taskId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearTasks: () => void;

  // Selectors
  getSelectedTask: () => Task | undefined;
  getTasksByStatus: (status: TaskStatus) => Task[];
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  isLoading: false,
  error: null,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task]
    })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId || t.specId === taskId ? { ...t, ...updates } : t
      )
    })),

  updateTaskStatus: (taskId, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId && t.specId !== taskId) return t;

        // When status goes to backlog, reset execution progress to idle
        // This ensures the planning/coding animation stops when task is stopped
        const executionProgress = status === 'backlog'
          ? { phase: 'idle' as ExecutionPhase, phaseProgress: 0, overallProgress: 0 }
          : t.executionProgress;

        return { ...t, status, executionProgress, updatedAt: new Date() };
      })
    })),

  updateTaskFromPlan: (taskId, plan) =>
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId && t.specId !== taskId) return t;

        // Extract subtasks from plan
        const subtasks: Subtask[] = plan.phases.flatMap((phase) =>
          phase.subtasks.map((subtask) => ({
            id: subtask.id,
            title: subtask.description,
            description: subtask.description,
            status: subtask.status,
            files: [],
            verification: subtask.verification as Subtask['verification']
          }))
        );

        // Determine status and reviewReason based on subtasks
        // This logic must match the backend (project-store.ts) exactly
        const allCompleted = subtasks.length > 0 && subtasks.every((s) => s.status === 'completed');
        const anyInProgress = subtasks.some((s) => s.status === 'in_progress');
        const anyFailed = subtasks.some((s) => s.status === 'failed');
        const anyCompleted = subtasks.some((s) => s.status === 'completed');

        let status: TaskStatus = t.status;
        let reviewReason: ReviewReason | undefined = t.reviewReason;

        if (allCompleted) {
          // Manual tasks skip AI review and go directly to human review
          status = t.metadata?.sourceType === 'manual' ? 'human_review' : 'ai_review';
          if (t.metadata?.sourceType === 'manual') {
            reviewReason = 'completed';
          } else {
            reviewReason = undefined;
          }
        } else if (anyFailed) {
          // Some subtasks failed - needs human attention
          status = 'human_review';
          reviewReason = 'errors';
        } else if (anyInProgress || anyCompleted) {
          // Work in progress
          status = 'in_progress';
          reviewReason = undefined;
        }

        return {
          ...t,
          title: plan.feature || t.title,
          subtasks,
          status,
          reviewReason,
          updatedAt: new Date()
        };
      })
    })),

  updateExecutionProgress: (taskId, progress) =>
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId && t.specId !== taskId) return t;

        // Merge with existing progress
        const existingProgress = t.executionProgress || {
          phase: 'idle' as ExecutionPhase,
          phaseProgress: 0,
          overallProgress: 0
        };

        return {
          ...t,
          executionProgress: {
            ...existingProgress,
            ...progress
          },
          updatedAt: new Date()
        };
      })
    })),

  appendLog: (taskId, log) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId || t.specId === taskId
          ? { ...t, logs: [...(t.logs || []), log] }
          : t
      )
    })),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearTasks: () => set({ tasks: [], selectedTaskId: null }),

  getSelectedTask: () => {
    const state = get();
    return state.tasks.find((t) => t.id === state.selectedTaskId);
  },

  getTasksByStatus: (status) => {
    const state = get();
    return state.tasks.filter((t) => t.status === status);
  }
}));

/**
 * Load tasks for a project
 */
export async function loadTasks(projectId: string): Promise<void> {
  const store = useTaskStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await tasksApi.list(projectId);
    console.log('[task-store] loadTasks result:', result);
    if (Array.isArray(result)) {
      store.setTasks(result as Task[]);
      // Subscribe to task events for this project (handled internally to avoid duplicates)
      subscribeToTaskEventsInternal(projectId);
    } else {
      store.setError('Failed to load tasks');
    }
  } catch (error) {
    console.error('[task-store] loadTasks error:', error);
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Create a new task
 */
export async function createTask(
  projectId: string,
  title: string,
  description: string,
  _metadata?: TaskMetadata
): Promise<Task | null> {
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.create(projectId, title, description);
    console.log('[task-store] createTask result:', result);
    if (result && result.task) {
      store.addTask(result.task as Task);
      return result.task as Task;
    } else {
      store.setError('Failed to create task');
      return null;
    }
  } catch (error) {
    console.error('[task-store] createTask error:', error);
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Start planning for a task (runs spec_runner in planning-only mode)
 * Task moves to 'planning' status and generates spec/plan in background.
 * When complete, task moves to 'human_review' with reason='plan_review'.
 */
export async function planTask(taskId: string): Promise<void> {
  const store = useTaskStore.getState();
  try {
    const result = await tasksApi.plan(taskId);
    console.log('[task-store] planTask result:', result);
    // Update task status in store
    store.updateTaskStatus(taskId, 'planning');
  } catch (error) {
    console.error('[task-store] planTask error:', error);
  }
}

/**
 * Start a task
 */
export async function startTask(taskId: string, _options?: { parallel?: boolean; workers?: number }): Promise<void> {
  const store = useTaskStore.getState();
  try {
    const result = await tasksApi.start(taskId);
    console.log('[task-store] startTask result:', result);
    // Update task status in store
    store.updateTaskStatus(taskId, 'in_progress');
  } catch (error) {
    console.error('[task-store] startTask error:', error);
  }
}

/**
 * Stop a task
 */
export async function stopTask(taskId: string): Promise<void> {
  const store = useTaskStore.getState();
  try {
    const result = await tasksApi.stop(taskId);
    console.log('[task-store] stopTask result:', result);
    // Update task status in store - back to backlog when stopped
    store.updateTaskStatus(taskId, 'backlog');
  } catch (error) {
    console.error('[task-store] stopTask error:', error);
  }
}

/**
 * Submit review for a task
 */
export async function submitReview(
  taskId: string,
  approved: boolean,
  feedback?: string
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.review(taskId, approved, feedback);
    console.log('[task-store] submitReview result:', result);
    if (approved) {
      store.updateTaskStatus(taskId, 'done');
    } else {
      // Task was rejected with feedback - it gets restarted
      // Backend sets it to in_progress after restart
      store.updateTaskStatus(taskId, 'in_progress');
    }
    return true;
  } catch (error) {
    console.error('[task-store] submitReview error:', error);
    return false;
  }
}

/**
 * Update task status and persist to file
 */
export async function persistTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    // Update local state first for immediate feedback
    store.updateTaskStatus(taskId, status);

    // Persist to file
    const result = await tasksApi.updateStatus(taskId, status);
    console.log('[task-store] persistTaskStatus result:', result);
    return true;
  } catch (error) {
    console.error('Error persisting task status:', error);
    return false;
  }
}

/**
 * Update task title/description/metadata and persist to file
 */
export async function persistUpdateTask(
  taskId: string,
  updates: { title?: string; description?: string; metadata?: Partial<TaskMetadata> }
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.update(taskId, updates);
    console.log('[task-store] persistUpdateTask result:', result);

    if (result) {
      // Update local state with the returned task data
      store.updateTask(taskId, {
        title: updates.title,
        description: updates.description,
        updatedAt: new Date()
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error persisting task update:', error);
    return false;
  }
}

/**
 * Check if a task has an active running process
 */
export async function checkTaskRunning(taskId: string): Promise<boolean> {
  try {
    const result = await tasksApi.checkRunning(taskId);
    console.log('[task-store] checkTaskRunning result:', result);
    return result?.running === true;
  } catch (error) {
    console.error('Error checking task running status:', error);
    return false;
  }
}

/**
 * Recover a stuck task (status shows in_progress but no process running)
 * @param taskId - The task ID to recover
 * @param options - Recovery options (autoRestart defaults to true)
 */
export async function recoverStuckTask(
  taskId: string,
  options: { targetStatus?: TaskStatus; autoRestart?: boolean } = { autoRestart: true }
): Promise<{ success: boolean; message: string; autoRestarted?: boolean }> {
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.recover(taskId, options);
    console.log('[task-store] recoverStuckTask result:', result);

    if (result) {
      // Update local state to backlog
      store.updateTaskStatus(taskId, 'backlog');
      return {
        success: true,
        message: 'Task recovered',
        autoRestarted: options.autoRestart
      };
    }

    return {
      success: false,
      message: 'Failed to recover task'
    };
  } catch (error) {
    console.error('Error recovering stuck task:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Delete a task and its spec directory
 */
export async function deleteTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.delete(taskId);
    console.log('[task-store] deleteTask result:', result);

    // Remove from local state
    store.setTasks(store.tasks.filter(t => t.id !== taskId && t.specId !== taskId));
    // Clear selection if this task was selected
    if (store.selectedTaskId === taskId) {
      store.selectTask(null);
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Archive tasks
 * Marks tasks as archived by adding archivedAt timestamp to metadata
 */
export async function archiveTasks(
  projectId: string,
  taskIds: string[],
  version?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await window.api.archiveTasks(projectId, taskIds, version);

    if (result.success) {
      // Reload tasks to update the UI (archived tasks will be filtered out by default)
      await loadTasks(projectId);
      return { success: true };
    }

    return {
      success: false,
      error: result.error || 'Failed to archive tasks'
    };
  } catch (error) {
    console.error('Error archiving tasks:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Task Creation Draft Management
// ============================================

const DRAFT_KEY_PREFIX = 'task-creation-draft';

/**
 * Get the localStorage key for a project's draft
 */
function getDraftKey(projectId: string): string {
  return `${DRAFT_KEY_PREFIX}-${projectId}`;
}

/**
 * Save a task creation draft to localStorage
 * Note: For large images, we only store thumbnails in the draft to avoid localStorage limits
 */
export function saveDraft(draft: TaskDraft): void {
  try {
    const key = getDraftKey(draft.projectId);
    // Create a copy with thumbnails only to avoid localStorage size limits
    const draftToStore = {
      ...draft,
      images: draft.images.map(img => ({
        ...img,
        data: undefined // Don't store full image data in localStorage
      })),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(draftToStore));
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

/**
 * Load a task creation draft from localStorage
 */
export function loadDraft(projectId: string): TaskDraft | null {
  try {
    const key = getDraftKey(projectId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const draft = JSON.parse(stored);
    // Convert savedAt back to Date
    draft.savedAt = new Date(draft.savedAt);
    return draft as TaskDraft;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

/**
 * Clear a task creation draft from localStorage
 */
export function clearDraft(projectId: string): void {
  try {
    const key = getDraftKey(projectId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear draft:', error);
  }
}

/**
 * Check if a draft exists for a project
 */
export function hasDraft(projectId: string): boolean {
  const key = getDraftKey(projectId);
  return localStorage.getItem(key) !== null;
}

/**
 * Check if a draft has any meaningful content (title, description, or images)
 */
export function isDraftEmpty(draft: TaskDraft | null): boolean {
  if (!draft) return true;
  return (
    !draft.title.trim() &&
    !draft.description.trim() &&
    draft.images.length === 0 &&
    !draft.category &&
    !draft.priority &&
    !draft.complexity &&
    !draft.impact
  );
}

// ============================================
// GitHub Issue Linking Helpers
// ============================================

/**
 * Find a task by GitHub issue number
 * Used to check if a task already exists for a GitHub issue
 */
export function getTaskByGitHubIssue(issueNumber: number): Task | undefined {
  const store = useTaskStore.getState();
  return store.tasks.find(t => t.metadata?.githubIssueNumber === issueNumber);
}

// ============================================
// Task State Detection Helpers
// ============================================

/**
 * Check if a task is in human_review but has no completed subtasks.
 * This indicates the task crashed/exited before implementation completed
 * and should be resumed rather than reviewed.
 */
export function isIncompleteHumanReview(task: Task): boolean {
  if (task.status !== 'human_review') return false;

  // If no subtasks defined, task hasn't been planned yet (shouldn't be in human_review)
  if (!task.subtasks || task.subtasks.length === 0) return true;

  // Check if any subtasks are completed
  const completedSubtasks = task.subtasks.filter(s => s.status === 'completed').length;

  // If 0 completed subtasks, this task crashed before implementation
  return completedSubtasks === 0;
}

/**
 * Get the count of completed subtasks for a task
 */
export function getCompletedSubtaskCount(task: Task): number {
  if (!task.subtasks || task.subtasks.length === 0) return 0;
  return task.subtasks.filter(s => s.status === 'completed').length;
}

/**
 * Get task progress info
 */
export function getTaskProgress(task: Task): { completed: number; total: number; percentage: number } {
  const total = task.subtasks?.length || 0;
  const completed = task.subtasks?.filter(s => s.status === 'completed').length || 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

// ============================================
// State Reconciliation
// ============================================

/**
 * Reconcile UI state with backend state.
 * Called on WebSocket reconnect or visibility change to ensure UI is in sync.
 */
export async function reconcileTasks(projectId: string): Promise<void> {
  console.log('[task-store] Reconciling tasks for project:', projectId);
  const store = useTaskStore.getState();

  try {
    const result = await tasksApi.list(projectId);
    if (Array.isArray(result)) {
      const backendTasks = result as Task[];
      const currentTasks = store.tasks;

      // Log any differences for debugging
      backendTasks.forEach(backendTask => {
        const currentTask = currentTasks.find(t => t.id === backendTask.id);
        if (currentTask && currentTask.status !== backendTask.status) {
          console.log(`[task-store] Status mismatch for ${backendTask.id}: UI=${currentTask.status}, Backend=${backendTask.status}`);
        }
      });

      // Update the store with the authoritative backend state
      store.setTasks(backendTasks);
      console.log('[task-store] Reconciliation complete, synced', backendTasks.length, 'tasks');
    }
  } catch (error) {
    console.error('[task-store] Reconciliation failed:', error);
  }
}

// ============================================
// WebSocket Event Subscriptions
// ============================================

// Track subscribed projects to avoid duplicate subscriptions
const subscribedProjects = new Set<string>();

// Track the currently active project ID for filtering events
let currentActiveProjectId: string | null = null;

/**
 * Set the currently active project ID.
 * Events from other projects will be ignored.
 */
export function setActiveProjectForTasks(projectId: string | null): void {
  currentActiveProjectId = projectId;
  console.log('[task-store] Active project set to:', projectId);
}

/**
 * Internal function to subscribe to task events for a project.
 * Called automatically when tasks are loaded.
 */
function subscribeToTaskEventsInternal(projectId: string): void {
  if (subscribedProjects.has(projectId)) {
    return; // Already subscribed
  }

  subscribedProjects.add(projectId);
  console.log('[task-store] Subscribing to task events for project:', projectId);

  wsService.on(`project.${projectId}.tasks`, (data) => {
    console.log('[task-store] Received task event:', data);

    // Ignore events from non-active projects to prevent cross-project pollution
    if (currentActiveProjectId && data.task?.projectId !== currentActiveProjectId) {
      console.log('[task-store] Ignoring event for non-active project:', data.task?.projectId, 'current:', currentActiveProjectId);
      return;
    }

    const store = useTaskStore.getState();

    if (data.action === 'created' && data.task) {
      // Add new task to store (avoid duplicates)
      const exists = store.tasks.some(t => t.id === data.task.id);
      if (!exists) {
        store.addTask(data.task as Task);
      }
    } else if (data.action === 'updated' && data.task) {
      // Update existing task in store
      const taskData = data.task;
      console.log('[task-store] Updating task:', taskData.id, 'to status:', taskData.status, 'subtasks:', taskData.subtasks?.length || 0, 'phase:', taskData.executionProgress?.phase);

      // Debug: Check if task exists in store before update
      const existingTask = store.tasks.find(t => t.id === taskData.id || t.specId === taskData.id);
      console.log('[task-store] Existing task before update:', existingTask ? `id=${existingTask.id}, status=${existingTask.status}` : 'NOT FOUND');

      store.updateTask(taskData.id, {
        status: taskData.status as TaskStatus,
        stagedInMainProject: taskData.stagedInMainProject,
        subtasks: taskData.subtasks || undefined,
        executionProgress: taskData.executionProgress || undefined,
      });

      // Debug: Check task after update
      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === taskData.id || t.specId === taskData.id);
      console.log('[task-store] Task after update:', updatedTask ? `id=${updatedTask.id}, status=${updatedTask.status}` : 'NOT FOUND');
    } else if (data.action === 'deleted' && data.taskId) {
      // Remove task from store
      const tasks = store.tasks.filter(t => t.id !== data.taskId);
      store.setTasks(tasks);
    }
  });
}
