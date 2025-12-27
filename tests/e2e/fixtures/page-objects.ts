/**
 * Page Object Models for E2E Tests
 * Provides reusable abstractions for interacting with UI components
 */

import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page object with common functionality
 */
export class BasePage {
  constructor(protected page: Page) {}

  async waitForApp() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForWebSocket() {
    // Wait for WebSocket connection to be established
    await this.page.waitForFunction(() => {
      return (window as any).__wsConnected === true;
    }, { timeout: 10000 }).catch(() => {
      // WebSocket flag may not be exposed, continue anyway
    });
  }

  async getToast(): Promise<string | null> {
    const toast = this.page.locator('[role="alert"]').first();
    if (await toast.count() > 0) {
      return await toast.innerText();
    }
    return null;
  }

  async dismissToast() {
    const closeBtn = this.page.locator('[role="alert"] button').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    }
  }
}

/**
 * Sidebar navigation
 */
export class SidebarPage extends BasePage {
  get sidebar(): Locator {
    return this.page.locator('[data-testid="sidebar"]').or(this.page.locator('nav').first());
  }

  async navigateTo(view: 'kanban' | 'terminals' | 'roadmap' | 'ideation' | 'context' | 'insights' | 'changelog' | 'github-issues' | 'worktrees' | 'merges' | 'releases') {
    const viewLabels: Record<string, string> = {
      'kanban': 'Kanban',
      'terminals': 'Terminals',
      'roadmap': 'Roadmap',
      'ideation': 'Ideation',
      'context': 'Context',
      'insights': 'Insights',
      'changelog': 'Changelog',
      'github-issues': 'GitHub Issues',
      'worktrees': 'Worktrees',
      'merges': 'Merges',
      'releases': 'Releases'
    };

    const link = this.page.getByText(viewLabels[view], { exact: true });
    if (await link.count() > 0) {
      await link.first().click();
      await this.page.waitForTimeout(300);
    }
  }

  async isViewActive(view: string): Promise<boolean> {
    const activeLink = this.page.locator('[data-active="true"]').or(
      this.page.locator('.bg-accent, .bg-primary')
    );
    const text = await activeLink.innerText().catch(() => '');
    return text.toLowerCase().includes(view.toLowerCase());
  }
}

/**
 * Insights view page object
 */
export class InsightsPage extends BasePage {
  get chatInput(): Locator {
    return this.page.locator('textarea[placeholder*="Ask"]').or(
      this.page.locator('input[placeholder*="message"]')
    );
  }

  get sendButton(): Locator {
    return this.page.locator('button[type="submit"]').or(
      this.page.locator('button').filter({ has: this.page.locator('svg.lucide-send') })
    );
  }

  get messages(): Locator {
    return this.page.locator('[data-testid="message"]').or(
      this.page.locator('.message-content')
    );
  }

  get sessionList(): Locator {
    return this.page.locator('[data-testid="session-list"]').or(
      this.page.locator('.chat-sessions')
    );
  }

  get newSessionButton(): Locator {
    return this.page.locator('button').filter({ hasText: /new|create/i }).filter({
      has: this.page.locator('svg.lucide-plus')
    }).first();
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text);
    await this.sendButton.click();
  }

  async waitForResponse(timeout = 30000) {
    // Wait for streaming response to complete
    await this.page.waitForFunction(() => {
      const loading = document.querySelector('[data-loading="true"]');
      return !loading;
    }, { timeout });
  }

  async getLastMessage(): Promise<string> {
    const messages = await this.messages.all();
    if (messages.length > 0) {
      return await messages[messages.length - 1].innerText();
    }
    return '';
  }

  async createNewSession() {
    await this.newSessionButton.click();
    await this.page.waitForTimeout(500);
  }

  async selectSession(index: number) {
    const sessions = await this.sessionList.locator('button, [role="button"]').all();
    if (sessions[index]) {
      await sessions[index].click();
    }
  }
}

/**
 * Roadmap view page object
 */
export class RoadmapPage extends BasePage {
  get generateButton(): Locator {
    return this.page.locator('button').filter({ hasText: /generate|create roadmap/i });
  }

  get refreshButton(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-refresh-cw') });
  }

  get featureCards(): Locator {
    return this.page.locator('[data-testid="feature-card"]').or(
      this.page.locator('.feature-card')
    );
  }

  get progressIndicator(): Locator {
    return this.page.locator('[data-testid="progress"]').or(
      this.page.locator('.progress-bar')
    );
  }

  get emptyState(): Locator {
    return this.page.locator('[data-testid="empty-roadmap"]').or(
      this.page.getByText(/no roadmap|generate a roadmap/i)
    );
  }

  async generateRoadmap() {
    await this.generateButton.click();
  }

  async waitForGeneration(timeout = 60000) {
    await this.page.waitForFunction(() => {
      const progress = document.querySelector('[data-generating="true"]');
      return !progress;
    }, { timeout });
  }

  async getFeatureCount(): Promise<number> {
    return await this.featureCards.count();
  }

  async clickFeature(index: number) {
    const features = await this.featureCards.all();
    if (features[index]) {
      await features[index].click();
    }
  }

  async updateFeatureStatus(featureIndex: number, status: string) {
    await this.clickFeature(featureIndex);
    const statusDropdown = this.page.locator('[data-testid="status-select"]').or(
      this.page.locator('select, [role="combobox"]')
    );
    await statusDropdown.click();
    await this.page.getByText(status, { exact: true }).click();
  }
}

/**
 * Ideation view page object
 */
export class IdeationPage extends BasePage {
  get generateButton(): Locator {
    return this.page.locator('button').filter({ hasText: /generate|get ideas/i });
  }

  get stopButton(): Locator {
    return this.page.locator('button').filter({ hasText: /stop/i });
  }

  get ideaCards(): Locator {
    return this.page.locator('[data-testid="idea-card"]').or(
      this.page.locator('.idea-card')
    );
  }

  get ideaTypeFilters(): Locator {
    return this.page.locator('[data-testid="idea-type-filter"]').or(
      this.page.locator('.idea-filters input[type="checkbox"]')
    );
  }

  get emptyState(): Locator {
    return this.page.getByText(/no ideas|generate ideas/i);
  }

  async generateIdeas(types?: string[]) {
    if (types) {
      // Select specific idea types
      for (const type of types) {
        const checkbox = this.page.locator(`input[value="${type}"]`);
        if (await checkbox.count() > 0) {
          await checkbox.check();
        }
      }
    }
    await this.generateButton.click();
  }

  async stopGeneration() {
    await this.stopButton.click();
  }

  async waitForGeneration(timeout = 60000) {
    await this.page.waitForFunction(() => {
      const generating = document.querySelector('[data-generating="true"]');
      return !generating;
    }, { timeout });
  }

  async getIdeaCount(): Promise<number> {
    return await this.ideaCards.count();
  }

  async dismissIdea(index: number) {
    const ideas = await this.ideaCards.all();
    if (ideas[index]) {
      const dismissBtn = ideas[index].locator('button').filter({
        has: this.page.locator('svg.lucide-x')
      });
      await dismissBtn.click();
    }
  }

  async convertIdeaToTask(index: number) {
    const ideas = await this.ideaCards.all();
    if (ideas[index]) {
      const convertBtn = ideas[index].locator('button').filter({
        hasText: /convert|create task/i
      });
      await convertBtn.click();
    }
  }

  async dismissAllIdeas() {
    const dismissAllBtn = this.page.locator('button').filter({ hasText: /dismiss all/i });
    if (await dismissAllBtn.count() > 0) {
      await dismissAllBtn.click();
      // Confirm if dialog appears
      const confirmBtn = this.page.locator('button').filter({ hasText: /confirm|yes/i });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      }
    }
  }
}

/**
 * Changelog view page object
 */
export class ChangelogPage extends BasePage {
  get generateButton(): Locator {
    return this.page.locator('button').filter({ hasText: /generate changelog/i });
  }

  get versionInput(): Locator {
    return this.page.locator('input[placeholder*="version"]').or(
      this.page.locator('input[name="version"]')
    );
  }

  get taskCheckboxes(): Locator {
    return this.page.locator('[data-testid="task-checkbox"]').or(
      this.page.locator('input[type="checkbox"]')
    );
  }

  get changelogPreview(): Locator {
    return this.page.locator('[data-testid="changelog-preview"]').or(
      this.page.locator('.changelog-content')
    );
  }

  get saveButton(): Locator {
    return this.page.locator('button').filter({ hasText: /save/i });
  }

  get releaseButton(): Locator {
    return this.page.locator('button').filter({ hasText: /create release/i });
  }

  get branchSelector(): Locator {
    return this.page.locator('[data-testid="branch-select"]').or(
      this.page.locator('select[name="branch"]')
    );
  }

  async setVersion(version: string) {
    await this.versionInput.fill(version);
  }

  async selectTasks(indices: number[]) {
    const checkboxes = await this.taskCheckboxes.all();
    for (const index of indices) {
      if (checkboxes[index]) {
        await checkboxes[index].check();
      }
    }
  }

  async generateChangelog() {
    await this.generateButton.click();
  }

  async waitForGeneration(timeout = 60000) {
    await this.page.waitForFunction(() => {
      const generating = document.querySelector('[data-generating="true"]');
      return !generating;
    }, { timeout });
  }

  async saveChangelog() {
    await this.saveButton.click();
  }

  async getPreviewContent(): Promise<string> {
    return await this.changelogPreview.innerText();
  }

  async createRelease(draft = false) {
    await this.releaseButton.click();
    if (draft) {
      const draftCheckbox = this.page.locator('input[name="draft"]');
      if (await draftCheckbox.count() > 0) {
        await draftCheckbox.check();
      }
    }
    const confirmBtn = this.page.locator('button').filter({ hasText: /confirm|create/i });
    await confirmBtn.click();
  }
}

/**
 * Context view page object
 */
export class ContextPage extends BasePage {
  get refreshButton(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-refresh-cw') });
  }

  get memoryStatus(): Locator {
    return this.page.locator('[data-testid="memory-status"]').or(
      this.page.getByText(/memory|indexed/i)
    );
  }

  get searchInput(): Locator {
    return this.page.locator('input[placeholder*="search"]');
  }

  get memoryResults(): Locator {
    return this.page.locator('[data-testid="memory-item"]').or(
      this.page.locator('.memory-result')
    );
  }

  async refreshIndex() {
    await this.refreshButton.click();
  }

  async searchMemories(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(1000);
  }

  async getMemoryCount(): Promise<number> {
    return await this.memoryResults.count();
  }

  async isIndexed(): Promise<boolean> {
    const status = await this.memoryStatus.innerText();
    return status.toLowerCase().includes('indexed') || status.toLowerCase().includes('ready');
  }
}

/**
 * GitHub Issues view page object
 */
export class GitHubIssuesPage extends BasePage {
  get issueList(): Locator {
    return this.page.locator('[data-testid="issue-list"]').or(
      this.page.locator('.issue-list')
    );
  }

  get issueCards(): Locator {
    return this.page.locator('[data-testid="issue-card"]').or(
      this.page.locator('.issue-item')
    );
  }

  get refreshButton(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-refresh-cw') });
  }

  get stateFilter(): Locator {
    return this.page.locator('[data-testid="state-filter"]').or(
      this.page.locator('select[name="state"]')
    );
  }

  get labelFilter(): Locator {
    return this.page.locator('[data-testid="label-filter"]');
  }

  get importButton(): Locator {
    return this.page.locator('button').filter({ hasText: /import/i });
  }

  get investigateButton(): Locator {
    return this.page.locator('button').filter({ hasText: /investigate/i });
  }

  get connectionStatus(): Locator {
    return this.page.locator('[data-testid="github-status"]').or(
      this.page.getByText(/connected|not connected/i)
    );
  }

  async refreshIssues() {
    await this.refreshButton.click();
    await this.page.waitForTimeout(2000);
  }

  async filterByState(state: 'open' | 'closed' | 'all') {
    await this.stateFilter.click();
    await this.page.getByText(state, { exact: true }).click();
  }

  async getIssueCount(): Promise<number> {
    return await this.issueCards.count();
  }

  async selectIssue(index: number) {
    const issues = await this.issueCards.all();
    if (issues[index]) {
      await issues[index].click();
    }
  }

  async importSelectedIssues() {
    await this.importButton.click();
  }

  async investigateIssue(index: number) {
    await this.selectIssue(index);
    await this.investigateButton.click();
  }

  async isConnected(): Promise<boolean> {
    const status = await this.connectionStatus.innerText();
    return status.toLowerCase().includes('connected') && !status.toLowerCase().includes('not');
  }
}

/**
 * Worktrees view page object
 */
export class WorktreesPage extends BasePage {
  get worktreeList(): Locator {
    return this.page.locator('[data-testid="worktree-list"]').or(
      this.page.locator('.worktree-list')
    );
  }

  get worktreeCards(): Locator {
    return this.page.locator('[data-testid="worktree-card"]').or(
      this.page.locator('.worktree-item')
    );
  }

  get createButton(): Locator {
    return this.page.locator('button').filter({ hasText: /create|new worktree/i });
  }

  get branchInput(): Locator {
    return this.page.locator('input[placeholder*="branch"]').or(
      this.page.locator('input[name="branch"]')
    );
  }

  async createWorktree(branch: string) {
    await this.createButton.click();
    await this.branchInput.fill(branch);
    const confirmBtn = this.page.locator('button').filter({ hasText: /create|confirm/i });
    await confirmBtn.click();
  }

  async getWorktreeCount(): Promise<number> {
    return await this.worktreeCards.count();
  }

  async switchToWorktree(index: number) {
    const worktrees = await this.worktreeCards.all();
    if (worktrees[index]) {
      const switchBtn = worktrees[index].locator('button').filter({ hasText: /switch/i });
      await switchBtn.click();
    }
  }

  async deleteWorktree(index: number) {
    const worktrees = await this.worktreeCards.all();
    if (worktrees[index]) {
      const deleteBtn = worktrees[index].locator('button').filter({
        has: this.page.locator('svg.lucide-trash')
      });
      await deleteBtn.click();
      // Confirm deletion
      const confirmBtn = this.page.locator('button').filter({ hasText: /confirm|delete/i });
      await confirmBtn.click();
    }
  }
}

/**
 * Terminal grid page object
 */
export class TerminalsPage extends BasePage {
  get terminalGrid(): Locator {
    return this.page.locator('[data-testid="terminal-grid"]').or(
      this.page.locator('.terminal-grid')
    );
  }

  get terminals(): Locator {
    return this.page.locator('[data-testid="terminal"]').or(
      this.page.locator('.xterm')
    );
  }

  get addTerminalButton(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-plus') });
  }

  get closeTerminalButtons(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('svg.lucide-x') });
  }

  async addTerminal() {
    await this.addTerminalButton.click();
    await this.page.waitForTimeout(1000);
  }

  async getTerminalCount(): Promise<number> {
    return await this.terminals.count();
  }

  async closeTerminal(index: number) {
    const closeButtons = await this.closeTerminalButtons.all();
    if (closeButtons[index]) {
      await closeButtons[index].click();
    }
  }

  async sendInput(terminalIndex: number, text: string) {
    const terminals = await this.terminals.all();
    if (terminals[terminalIndex]) {
      await terminals[terminalIndex].click();
      await this.page.keyboard.type(text);
      await this.page.keyboard.press('Enter');
    }
  }

  async getTerminalOutput(index: number): Promise<string> {
    const terminals = await this.terminals.all();
    if (terminals[index]) {
      return await terminals[index].innerText();
    }
    return '';
  }
}

/**
 * Settings dialog page object
 */
export class SettingsPage extends BasePage {
  get settingsButton(): Locator {
    return this.page.locator('button').filter({
      has: this.page.locator('svg.lucide-settings-2, svg.lucide-settings')
    }).first();
  }

  get dialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  get tabs(): Locator {
    return this.page.locator('[role="tab"]');
  }

  get closeButton(): Locator {
    return this.dialog.locator('button').filter({
      has: this.page.locator('svg.lucide-x')
    }).first();
  }

  async openSettings() {
    await this.settingsButton.click();
    await this.page.waitForTimeout(300);
  }

  async closeSettings() {
    await this.closeButton.click();
    await this.page.waitForTimeout(300);
  }

  async switchTab(tabName: string) {
    const tab = this.page.getByRole('tab', { name: tabName });
    await tab.click();
  }

  async isOpen(): Promise<boolean> {
    return await this.dialog.count() > 0;
  }

  async getTabNames(): Promise<string[]> {
    const tabs = await this.tabs.all();
    return Promise.all(tabs.map(tab => tab.innerText()));
  }
}

/**
 * Task creation wizard page object
 */
export class TaskWizardPage extends BasePage {
  get newTaskButton(): Locator {
    return this.page.locator('button').filter({ hasText: /new task|create task/i });
  }

  get wizard(): Locator {
    return this.page.locator('[data-testid="task-wizard"]').or(
      this.page.locator('[role="dialog"]')
    );
  }

  get titleInput(): Locator {
    return this.page.locator('input[name="title"]').or(
      this.page.locator('input[placeholder*="title"]')
    );
  }

  get descriptionInput(): Locator {
    return this.page.locator('textarea[name="description"]').or(
      this.page.locator('textarea[placeholder*="description"]')
    );
  }

  get nextButton(): Locator {
    return this.page.locator('button').filter({ hasText: /next|continue/i });
  }

  get backButton(): Locator {
    return this.page.locator('button').filter({ hasText: /back|previous/i });
  }

  get createButton(): Locator {
    return this.page.locator('button').filter({ hasText: /create|submit/i });
  }

  get cancelButton(): Locator {
    return this.page.locator('button').filter({ hasText: /cancel/i });
  }

  async openWizard() {
    await this.newTaskButton.click();
    await this.page.waitForTimeout(300);
  }

  async setTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async setDescription(description: string) {
    await this.descriptionInput.fill(description);
  }

  async nextStep() {
    await this.nextButton.click();
    await this.page.waitForTimeout(300);
  }

  async previousStep() {
    await this.backButton.click();
    await this.page.waitForTimeout(300);
  }

  async createTask() {
    await this.createButton.click();
    await this.page.waitForTimeout(500);
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async isOpen(): Promise<boolean> {
    return await this.wizard.count() > 0;
  }

  async getCurrentStep(): Promise<number> {
    const stepIndicator = this.page.locator('[data-current-step]');
    if (await stepIndicator.count() > 0) {
      const step = await stepIndicator.getAttribute('data-current-step');
      return parseInt(step || '1', 10);
    }
    return 1;
  }
}

/**
 * Kanban board page object
 */
export class KanbanPage extends BasePage {
  get columns(): Locator {
    return this.page.locator('[data-testid="kanban-column"]').or(
      this.page.locator('.kanban-column')
    );
  }

  get taskCards(): Locator {
    return this.page.locator('[data-testid="task-card"]').or(
      this.page.locator('.task-card')
    );
  }

  get backlogColumn(): Locator {
    return this.page.locator('[data-column="backlog"]').or(
      this.page.getByText('Backlog').locator('..').locator('..')
    );
  }

  get inProgressColumn(): Locator {
    return this.page.locator('[data-column="in_progress"]').or(
      this.page.getByText('In Progress').locator('..').locator('..')
    );
  }

  get doneColumn(): Locator {
    return this.page.locator('[data-column="done"]').or(
      this.page.getByText('Done').locator('..').locator('..')
    );
  }

  async getColumnCount(): Promise<number> {
    return await this.columns.count();
  }

  async getTaskCount(): Promise<number> {
    return await this.taskCards.count();
  }

  async getTasksInColumn(columnName: string): Promise<number> {
    const column = this.page.locator(`[data-column="${columnName}"]`).or(
      this.page.getByText(columnName).locator('..').locator('..')
    );
    return await column.locator('[data-testid="task-card"], .task-card').count();
  }

  async clickTask(index: number) {
    const tasks = await this.taskCards.all();
    if (tasks[index]) {
      await tasks[index].click();
    }
  }

  async dragTask(taskIndex: number, targetColumn: string) {
    const tasks = await this.taskCards.all();
    const targetCol = this.page.locator(`[data-column="${targetColumn}"]`);

    if (tasks[taskIndex] && await targetCol.count() > 0) {
      await tasks[taskIndex].dragTo(targetCol);
    }
  }
}

/**
 * Onboarding wizard page object
 */
export class OnboardingPage extends BasePage {
  get wizard(): Locator {
    return this.page.locator('[data-testid="onboarding-wizard"]').or(
      this.page.locator('.onboarding-wizard')
    );
  }

  get stepIndicator(): Locator {
    return this.page.locator('[data-testid="step-indicator"]');
  }

  get nextButton(): Locator {
    return this.page.locator('button').filter({ hasText: /next|continue|get started/i });
  }

  get skipButton(): Locator {
    return this.page.locator('button').filter({ hasText: /skip/i });
  }

  get finishButton(): Locator {
    return this.page.locator('button').filter({ hasText: /finish|complete|done/i });
  }

  async isVisible(): Promise<boolean> {
    return await this.wizard.count() > 0;
  }

  async nextStep() {
    await this.nextButton.click();
    await this.page.waitForTimeout(300);
  }

  async skip() {
    await this.skipButton.click();
  }

  async finish() {
    await this.finishButton.click();
    await this.page.waitForTimeout(500);
  }

  async getCurrentStep(): Promise<number> {
    const indicator = await this.stepIndicator.getAttribute('data-step');
    return parseInt(indicator || '1', 10);
  }
}

// Export all page objects
export const PageObjects = {
  BasePage,
  SidebarPage,
  InsightsPage,
  RoadmapPage,
  IdeationPage,
  ChangelogPage,
  ContextPage,
  GitHubIssuesPage,
  WorktreesPage,
  TerminalsPage,
  SettingsPage,
  TaskWizardPage,
  KanbanPage,
  OnboardingPage
};
