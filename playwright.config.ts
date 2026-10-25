import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://sathyapyro.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // Pure logic + page object checks against a local fixture page; no network needed.
      name: 'offline',
      testMatch: /(planner|fixture)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      // Real site, mobile layout (the site is opened with ?device=mobile).
      name: 'live-mobile',
      testMatch: /cart-3000\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
