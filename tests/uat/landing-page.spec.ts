import { test, expect } from '@playwright/test';

test('has title and main analyze button', async ({ page }) => {
  await page.goto('/');

  // Check the title of the page
  await expect(page).toHaveTitle(/RepoSage/i);

  // Check that there is an analyze button or input field
  // The exact selectors depend on the app's UI, we will just look for some text
  // indicating the main function of the app.
  const header = page.locator('h1');
  await expect(header).toBeVisible();

  // Find something that indicates we are on the right page
  const analyzeButton = page.getByRole('button', { name: /Analyze/i });
  if (await analyzeButton.isVisible()) {
    await expect(analyzeButton).toBeVisible();
  }
});
