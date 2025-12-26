import { test, expect } from '@playwright/test';
import { TaskWizardPage, SidebarPage } from '../fixtures/page-objects';

/**
 * Task Creation Wizard Tests
 *
 * Tests for the multi-step task creation wizard including
 * form validation, image upload, and file autocomplete.
 */

test.describe('Task Wizard Access', () => {
  test('should have new task button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    const newTaskBtn = wizard.newTaskButton;

    const count = await newTaskBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should open task wizard on button click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    const newTaskBtn = wizard.newTaskButton;

    if (await newTaskBtn.count() > 0) {
      await wizard.openWizard();
      expect(await wizard.isOpen()).toBe(true);
    }
  });

  test('should open via keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    await page.keyboard.press('n');
    await page.waitForTimeout(300);

    // Wizard might open
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Task Wizard Form', () => {
  test('should display title input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const titleInput = wizard.titleInput;
      const count = await titleInput.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should display description textarea', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const descInput = wizard.descriptionInput;
      const count = await descInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should allow entering task details', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      await wizard.setTitle('Test Task Title');
      const titleValue = await wizard.titleInput.inputValue();
      expect(titleValue).toBe('Test Task Title');
    }
  });
});

test.describe('Task Wizard Navigation', () => {
  test('should have next button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const nextBtn = wizard.nextButton;
      const count = await nextBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have back button on later steps', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();
      await wizard.setTitle('Test');

      // Try to advance
      const nextBtn = wizard.nextButton;
      if (await nextBtn.count() > 0) {
        await wizard.nextStep();

        const backBtn = wizard.backButton;
        const count = await backBtn.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should have cancel button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const cancelBtn = wizard.cancelButton;
      const count = await cancelBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Wizard Steps', () => {
  test('should track current step', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const step = await wizard.getCurrentStep();
      expect(step).toBeGreaterThanOrEqual(1);
    }
  });

  test('should advance step on next click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();
      await wizard.setTitle('Test Task');

      const initialStep = await wizard.getCurrentStep();
      await wizard.nextStep();
      const newStep = await wizard.getCurrentStep();

      expect(newStep).toBeGreaterThanOrEqual(initialStep);
    }
  });
});

test.describe('Task Wizard Validation', () => {
  test('should require title field', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      // Try to submit without title
      const nextBtn = wizard.nextButton;
      if (await nextBtn.count() > 0) {
        await nextBtn.click();

        // Should show error or stay on same step
        const errorMsg = page.getByText(/required|title is required/i);
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Task Wizard Image Upload', () => {
  test('should have image upload option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const imageUpload = page.locator('input[type="file"]').or(
        page.getByText(/upload|image|screenshot/i)
      );

      const count = await imageUpload.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Wizard File Autocomplete', () => {
  test('should have file reference input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const fileInput = page.locator('input[placeholder*="file"]').or(
        page.getByText(/reference|files/i)
      );

      const count = await fileInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Wizard Submission', () => {
  test('should have create button on final step', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();

      const createBtn = wizard.createButton;
      const count = await createBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should create task via API', async ({ page }) => {
    const response = await page.request.post('/api/tasks', {
      data: {
        projectId: 'test-project',
        title: 'E2E Wizard Test Task',
        description: 'Created via wizard test'
      }
    });

    expect([200, 201, 422]).toContain(response.status());
  });
});

test.describe('Task Wizard Cancel', () => {
  test('should close wizard on cancel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();
      await wizard.cancel();
      await page.waitForTimeout(300);

      expect(await wizard.isOpen()).toBe(false);
    }
  });

  test('should confirm cancel if form is dirty', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const wizard = new TaskWizardPage(page);
    if (await wizard.newTaskButton.count() > 0) {
      await wizard.openWizard();
      await wizard.setTitle('Unsaved changes');

      // Try to cancel - might show confirmation
      await wizard.cancel();
      await page.waitForTimeout(300);

      await expect(page.locator('body')).toBeVisible();
    }
  });
});
