import { test, expect } from '@playwright/test';

const ONLINE = process.env.E2E_ONLINE === '1';
const OFFLINE = process.env.E2E_OFFLINE === '1';

test('app shell renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.getByRole('button', { name: '首页' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新数据' })).toBeVisible();
});

test('refresh shows boot error offline', async ({ page }) => {
  test.skip(!OFFLINE, 'offline smoke only');
  await page.goto('/');
  await page.getByRole('button', { name: '刷新数据' }).click();
  await expect(page.locator('.boot-error')).toBeVisible();
});

test.describe('online only', () => {
  test.skip(!ONLINE, 'requires backend on :8000');
  test('online flow: cold start, play, like, open like grid', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '刷新数据' }).click();
    await expect(page.locator('.boot-error')).toHaveCount(0);

    // Should land in player view and render media
    const media = page.locator('img.media, video.media');
    await expect(media).toBeVisible();

    // Index label present
    const indexLabel = page.locator('.index');
    const before = await indexLabel.textContent();
    await page.keyboard.press('ArrowUp');
    await expect(async () => {
      const after = await indexLabel.textContent();
      expect(after).not.toEqual(before);
    }).toPass();

    // Like current item to ensure like grid has content
    const likeBtn = page.getByRole('button', { name: /点赞|取消点赞/ });
    await likeBtn.click();

    // Open like grid
    await page.getByRole('button', { name: 'like' }).click();
    await expect(page.locator('.grid .cell').first()).toBeVisible();

    // Enter first item and return
    await page.locator('.grid .cell').first().click();
    await expect(page.locator('.player')).toBeVisible();
    await page.getByRole('button', { name: '返回列表' }).click();
    await expect(page.locator('.grid')).toBeVisible();
  });
});
