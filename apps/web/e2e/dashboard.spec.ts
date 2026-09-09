import { expect, test } from '@playwright/test';

const robots = [{ id: 'robot-1', name: 'Example robot', type: 'scrape', startUrl: 'https://example.com', status: 'ready' }];

async function mockApi(page: import('@playwright/test').Page) {
  await page.route('http://localhost:3001/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/auth/login')) {
      await route.fulfill({ json: { token: 'test-session-token', user: { id: 'user-1', workspaceId: 'workspace-1' } } });
      return;
    }
    if (url.pathname.endsWith('/robots') && request.method() === 'GET') {
      await route.fulfill({ json: robots });
      return;
    }
    if (url.pathname.endsWith('/api-keys')) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname.endsWith('/metrics/workspace')) {
      await route.fulfill({ json: { robots: 1, activeSchedules: 2, runs: { queued: 0, running: 0, success: 4, failed: 1, cancelled: 0 } } });
      return;
    }
    if (url.pathname.endsWith('/preview')) {
      await route.fulfill({ contentType: 'text/html', body: '<main><button data-testid="buy">Buy</button></main>' });
      return;
    }
    if (url.pathname.endsWith('/steps') && request.method() === 'POST') {
      await route.fulfill({ json: { id: 'step-1', action: 'click', orderIndex: 0 } });
      return;
    }
    if (url.pathname.includes('/runs')) {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

test('logs in and renders the authenticated workspace dashboard', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByText('Authenticated workspace')).toBeVisible();
  await expect(page.getByText('Example robot')).toBeVisible();
  await expect(page.getByText('Schedules')).toBeVisible();
  await expect(page.getByText('4')).toBeVisible();

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recorder preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Buy' }).click();
});
