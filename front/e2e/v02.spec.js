import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `v02-${Date.now()}`)
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8876',
  LASTTRAIN_NONINTERACTIVE: '1',
}
const launcher = (command, args = []) =>
  execFileSync(python, [path.join(root, 'back/launcher.py'), command, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
const test = base.extend({
  serverURL: [
    async ({}, use) => {
      launcher('init')
      launcher('start', ['--no-browser'])
      try {
        const { port } = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json')))
        await use(`http://127.0.0.1:${port}`)
      } finally {
        launcher('stop')
        if (dataDir.startsWith(path.join(root, '.local-qa', 'v02-')))
          fs.rmSync(dataDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

test('immersive carriage and notebook preserve journey and diary data', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.getByLabel('Язык', { exact: true }).selectOption('en')
  await page.goto('/dashboard')
  await page.getByRole('link', { name: /TAKE YOUR SEAT/ }).click()
  await page.getByLabel('Journey name').fill('Immersive trip')
  await page.getByLabel('Destination station').fill('Notebook stop')
  await page.getByLabel('Hours', { exact: true }).fill('0')
  await page.getByLabel('Minutes', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.getByRole('button', { name: 'Enter immersive mode' })).toBeVisible()
  const timerBefore = await page.locator('.cabin-timer').textContent()
  await page.getByRole('button', { name: 'Play music' }).click()
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await page.getByRole('button', { name: 'Enter immersive mode' }).click()
  await expect(page.locator('body')).toHaveClass(/journey-immersive/)
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await page.waitForTimeout(4200)
  expect(
    await page.locator('.cabin-board').evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0')
  await page.screenshot({ path: path.join(root, '.local-qa', 'v02-immersive.png') })
  await page.getByRole('button', { name: 'Open travel notebook' }).click()
  await expect(page.getByRole('dialog', { name: 'Travel notebook' })).toBeVisible()
  await expect(page).toHaveURL(/dashboard/)
  await page.getByRole('textbox', { name: 'Title' }).fill('Window notes')
  await page.getByRole('textbox', { name: 'Your reflection' }).fill('Привет, поезд!')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('status')).toContainText('Entry saved.')
  await page.getByRole('button', { name: 'Close editor' }).click()
  await expect(page.locator('body')).toHaveClass(/journey-immersive/)
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit immersive mode' }).click()
  await expect(page.locator('body')).not.toHaveClass(/journey-immersive/)
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  await expect(page.locator('.sidebar')).toBeVisible()
  await page.getByRole('button', { name: 'Open travel notebook' }).click()
  await page.getByRole('button', { name: /Window notes/ }).click()
  await expect(page.getByRole('textbox', { name: 'Your reflection' })).toHaveValue('Привет, поезд!')
  await page.getByRole('textbox', { name: 'Your reflection' }).fill('Edited note')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('status')).toContainText('Entry saved.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Open travel notebook' }).click()
  await page.getByRole('button', { name: /Window notes/ }).click()
  await expect(page.getByRole('textbox', { name: 'Your reflection' })).toHaveValue('Edited note')
  await page.getByRole('button', { name: 'Close editor' }).click()
  await page.getByRole('button', { name: 'Enter immersive mode' }).click()
  await expect(page.locator('body')).toHaveClass(/journey-immersive/)
  await page.evaluate(() => document.exitFullscreen())
  await expect(page.locator('body')).not.toHaveClass(/journey-immersive/)
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('denied'))
  })
  await page.getByRole('button', { name: 'Enter immersive mode' }).click()
  await expect(page.locator('body')).toHaveClass(/journey-immersive/)
  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/journey-immersive/)
  await expect(page.locator('.cabin-timer')).not.toHaveText(timerBefore)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open travel notebook' }).click()
  await expect(page.getByRole('textbox', { name: 'Your reflection' })).toBeVisible()
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(root, '.local-qa', 'v02-mobile-notebook.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  expect(errors).toEqual([])
})
