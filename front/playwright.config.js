import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 180000,
  outputDir: '../.local-qa/browser-results',
  use: {
    baseURL: process.env.LASTTRAIN_TEST_URL || 'http://127.0.0.1:8875',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
