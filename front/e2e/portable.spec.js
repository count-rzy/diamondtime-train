import { test, expect } from '@playwright/test'

test('packaged Last Train: journeys, diary, atlas, audio and routes', async ({ page }) => {
  test.skip(!!process.env.LASTTRAIN_VERIFY_RESTART)
  test.setTimeout(90000)
  const errors = []
  await page.addInitScript(() => {
    window.audioContexts = []
    const NativeContext = window.AudioContext
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args)
        window.audioContexts.push(this)
      }
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`)
    if (response.status() >= 400 && /\/(assets|art)\/|favicon-\d+\.png/.test(response.url()))
      errors.push(`${response.status()} ${response.url()}`)
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/settings')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="en"]') })
    .selectOption('en')
  await expect(page.getByLabel('Train ambience volume', { exact: true })).toBeVisible()
  await page.goto('/journeys/new')
  await page.getByLabel('Journey name').fill('Portable journey QA')
  await page.getByLabel('Destination station').fill('Portable destination')
  await page.getByLabel('Hours', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible()
  await page.locator('.train-sound-status').click()
  await expect(page.locator('.train-sound-status')).toContainText('Train sounds on')
  await expect
    .poll(() =>
      page.evaluate(() => window.audioContexts.filter((c) => c.state === 'running').length),
    )
    .toBe(1)
  await page.getByRole('button', { name: 'Expand music player' }).first().click()
  await page.getByRole('button', { name: 'Play music' }).click()
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => window.audioContexts.filter((c) => c.state === 'running').length),
    )
    .toBe(2)
  await page.getByRole('button', { name: 'Collapse music player' }).click()
  await page.locator('.atlas-object').click()
  await expect(page.locator('.atlas-frame')).toBeVisible()
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible()
  await page.goto('/diary')
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Portable diary QA')
  await page.getByLabel('Your reflection').fill('Saved by the packaged application.')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('heading', { name: 'Portable diary QA' })).toBeVisible()
  for (const route of ['/history', '/statistics', '/settings', '/dashboard']) {
    await page.goto(route)
    await expect(page.locator('.page-loading')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('packaged data remains visible after restart and binary replacement', async ({ page }) => {
  test.skip(!process.env.LASTTRAIN_VERIFY_RESTART)
  await page.goto('/dashboard')
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible()
  await page.goto('/diary')
  await expect(page.getByRole('heading', { name: 'Portable diary QA' })).toBeVisible()
})
