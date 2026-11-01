import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

test('starts, catches a parrot, pauses and resumes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');

  await expect(page).toHaveTitle(/Напальчик/);
  await expect(page.locator('.lives-block .stat-label')).toHaveText('Жизнь');
  await expect(page.locator('#lives .life svg')).toHaveCount(3);
  await expect(page.locator('.level-pill, #toast')).toHaveCount(0);
  await expect(page.locator('#startScreen')).toBeVisible();
  await page.locator('#startButton').click();
  await expect(page.locator('#startScreen')).toBeHidden();
  await expect(page.locator('#pauseButton')).toBeEnabled();

  await page.keyboard.press('KeyQ');
  await expect(page.locator('#score')).toHaveText('1', { timeout: 10_000 });
  await expect(page.locator('.life.lost')).toHaveCount(0);

  await page.keyboard.press('KeyP');
  await expect(page.locator('#pauseScreen')).toBeVisible();
  await page.locator('#resumeButton').click();
  await expect(page.locator('#pauseScreen')).toBeHidden();

  await page.locator('#helpButton').click();
  await expect(page.locator('#helpDialog')).toBeVisible();
  await expect(page.locator('#pauseScreen')).toBeVisible();
  await page.locator('#readyButton').click();
  await expect(page.locator('#helpDialog')).toBeHidden();
  await expect(page.locator('#pauseScreen')).toBeHidden();
  expect(errors).toEqual([]);
});

test('catches parrots from the lower level', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Select lane 2 (lower left) and its catching pose.
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto('/');
  await page.locator('#startButton').click();
  await page.keyboard.press('KeyA');

  await expect(page.locator('#score')).toHaveText('1', { timeout: 10_000 });
  await expect(page.locator('.life.lost')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('three missed parrots end the game and restart resets the HUD', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await page.locator('#startButton').click();

  await expect(page.locator('#gameOverScreen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#finalScore')).toHaveText('0');
  await expect(page.locator('#finalWord')).toHaveText('попугаев');
  await expect(page.locator('.life.lost')).toHaveCount(3);
  await expect(page.locator('#pauseButton')).toBeDisabled();

  await page.locator('#restartButton').click();
  await expect(page.locator('#gameOverScreen')).toBeHidden();
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('.life.lost')).toHaveCount(0);
  await expect(page.locator('#pauseButton')).toBeEnabled();
});

test('CSP blocks inline scripts and invalid saved scores are discarded', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('napalchik-best', 'Infinity');
  });
  await page.goto('/');
  await expect(page.locator('#bestScore')).toHaveText('0');

  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineScriptRan = true;';
    document.body.appendChild(script);
  });
  expect(await page.evaluate(() => window.__inlineScriptRan)).toBeUndefined();
});

test('mobile layout fits the viewport and canvas touches work without buttons', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#startButton').click();
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.controls')).toHaveCount(0);
  const bounds = await canvas.boundingBox();
  await page.touchscreen.tap(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.25);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile-game.png', fullPage: true });
});
