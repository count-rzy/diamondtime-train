import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `compartment-${Date.now()}`)
const output = path.join(root, '.local-qa', 'compartment-after')
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8884',
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
      if (process.env.LASTTRAIN_TEST_URL) {
        await use(process.env.LASTTRAIN_TEST_URL)
        return
      }
      launcher('init')
      launcher('start', ['--no-browser'])
      try {
        const { port } = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json')))
        await use(`http://127.0.0.1:${port}`)
      } finally {
        launcher('stop')
        fs.rmSync(dataDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

test('compartment objects, scroll, focus and independent audio', async ({ page, browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(output, { recursive: true })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.radioContexts = []
    const Native = window.AudioContext
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (destination, ...args) {
      return connect.call(
        this,
        destination === this.context.destination &&
          this.context.probe &&
          this !== this.context.probe
          ? this.context.probe
          : destination,
        ...args,
      )
    }
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args)
        this.probe = this.createAnalyser()
        this.probe.fftSize = 2048
        this.probe.connect(this.destination)
        window.radioContexts.push(this)
      }
    }
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/settings')
  await page.getByLabel('Язык', { exact: true }).selectOption('en')
  await page.goto('/dashboard')
  await page.locator('.train-sound-status').click()
  await page.getByRole('link', { name: 'New journey' }).click()
  await page.getByLabel('Journey name').fill('Compartment QA')
  await page.getByLabel('Destination station').fill('Last station')
  await page.getByLabel('Hours', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.locator('.cabin-heading')).toContainText('Compartment QA')

  for (const immersive of [false, true]) {
    if (immersive) await page.getByRole('button', { name: /Enter immersive/i }).click()
    for (const [width, height] of [
      [1366, 768],
      [1280, 720],
      [900, 720],
      [390, 844],
      [360, 800],
      [360, 500],
    ]) {
      await page.setViewportSize({ width, height })
      const name = `${width}x${height}-${immersive ? 'immersive' : 'regular'}`
      await page.locator('.table-radio').scrollIntoViewIfNeeded()
      const geometry = await page.evaluate(() => {
        const rect = (selector) => {
          const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect()
          return { x, y, width, height }
        }
        const intersects = (a, b) =>
          a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
        const objects = ['.notebook-object', '.ticket-object', '.atlas-object', '.table-radio'].map(
          rect,
        )
        return {
          overlap: objects.some((a, i) => objects.some((b, j) => j > i && intersects(a, b))),
          ticketOnPanel: intersects(objects[1], rect('.cabin-board')),
          documentWidth: document.documentElement.scrollWidth,
          objects,
        }
      })
      fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(geometry, null, 2))
      expect(geometry.overlap, name).toBe(false)
      expect(geometry.ticketOnPanel, name).toBe(false)
      expect(geometry.documentWidth, name).toBeLessThanOrEqual(width + 1)
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })

      await page.locator('.cabin-new').click()
      await expect(page.getByRole('dialog', { name: 'New journey' })).toBeVisible()
      await page.waitForTimeout(250)
      await page.locator('.journey-overlay .object-overlay-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect(page.getByRole('button', { name: 'Begin journey' })).toBeInViewport()
      await page.screenshot({ path: path.join(output, `${name}-journey.png`) })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'New journey' })).toHaveCount(0)

      await page.locator('.atlas-object').click()
      await expect(page.getByRole('dialog', { name: 'Atlas' })).toBeVisible()
      await expect(page.locator('.atlas-frame')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      )
      const close = page.getByRole('button', { name: /Close .*Atlas/ })
      await expect(close).toBeInViewport()
      await page.waitForTimeout(250)
      await page.locator('.object-overlay-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      if (width === 360 && !immersive) {
        await page.locator('.object-overlay-dialog').evaluate((el) => {
          el.style.maxHeight = '500px'
        })
        await page.locator('.object-overlay-scroll').evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
        expect(
          await page.locator('.object-overlay-scroll').evaluate((el) => el.scrollTop),
        ).toBeGreaterThan(0)
      }
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.locator('.atlas-frame').focus()
      await page.keyboard.press('ArrowLeft')
      await page.screenshot({ path: path.join(output, `${name}-atlas.png`) })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Atlas' })).toHaveCount(0)
      await expect(page.locator('.atlas-object')).toBeFocused()
      await expect(page.locator('.cabin-heading')).toContainText('Compartment QA')

      await page.locator('.table-radio').click()
      await expect(page.getByRole('dialog', { name: 'Radio' })).toBeVisible()
      await expect(page.locator('.radio-overlay .object-overlay-toolbar button')).toBeInViewport()
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(output, `${name}-radio.png`) })
      if (!immersive && width === 1366) {
        await page.getByRole('button', { name: 'Play music' }).click()
        await expect.poll(() => page.evaluate(() => window.radioContexts.length)).toBe(2)
        await expect.poll(() => page.evaluate(() => window.radioContexts[1]?.state)).toBe('running')
      }
      await page.locator('.radio-overlay .object-overlay-toolbar button').click()
      await expect(page.locator('.table-radio')).toBeFocused()
      expect(await page.evaluate(() => window.radioContexts.length)).toBe(2)
      expect(await page.evaluate(() => window.radioContexts[1].state)).toBe('running')
      const peaks = await page.evaluate(() =>
        window.radioContexts.map((context) => {
          const samples = new Float32Array(2048)
          context.probe.getFloatTimeDomainData(samples)
          return Math.max(...samples.map(Math.abs))
        }),
      )
      expect(peaks[0]).toBeGreaterThan(0.001)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const samples = new Float32Array(2048)
            window.radioContexts[1].probe.getFloatTimeDomainData(samples)
            return Math.max(...samples.map(Math.abs))
          }),
        )
        .toBeGreaterThan(0.001)
      await page.locator('.notebook-object').click()
      await expect(page.getByRole('dialog', { name: 'Travel notebook' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.notebook-backdrop')).toHaveCount(0)
    }
  }
  await page.goto('/atlas')
  await expect(page.locator('.atlas-frame')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const touchPage = await touchContext.newPage()
  await touchPage.goto('/dashboard')
  await touchPage.locator('.atlas-object').tap()
  await expect(touchPage.locator('.atlas-frame')).toBeVisible()
  await touchPage.locator('.atlas-marker.station.start').tap()
  await expect(touchPage.locator('.atlas-point-info')).toBeVisible()
  await touchPage.locator('.atlas-overlay .object-overlay-toolbar button').tap()
  await touchPage.locator('.table-radio').tap()
  await expect(touchPage.locator('.radio-overlay')).toBeVisible()
  await touchPage.locator('.radio-overlay .object-overlay-toolbar button').tap()
  await touchContext.close()
  expect(errors).toEqual([])
})

test('immersive journey form validates and creates one journey', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'FINISH', exact: true }).click()
  await expect(page.getByText("You've arrived.")).toBeVisible()
  const initialCount = await page.evaluate(() =>
    fetch('/api/journeys/')
      .then((response) => response.json())
      .then((data) => data.count),
  )
  await page.getByRole('button', { name: 'Enter immersive mode' }).click()
  await page.locator('.cabin-new').click()
  const form = page.getByRole('dialog', { name: 'New journey' })
  await expect(form).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await form.getByLabel('Journey name').fill('Immersive departure QA')
  await form.getByLabel('Destination station').fill('Next station')
  await form.getByLabel('Hours', { exact: true }).fill('0')
  await form.getByLabel('Minutes', { exact: true }).fill('0')
  await form.getByRole('button', { name: 'Begin journey' }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  await expect(form).toBeVisible()
  await form.getByLabel('Hours', { exact: true }).fill('1')
  const creates = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/journeys/')
      creates.push(request)
  })
  await form.getByRole('button', { name: 'Begin journey' }).click()
  await expect(form).toHaveCount(0)
  await expect(page.locator('.cabin-heading')).toContainText('Immersive departure QA')
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  expect(creates).toHaveLength(1)
  await expect
    .poll(() =>
      page.evaluate(() =>
        fetch('/api/journeys/')
          .then((response) => response.json())
          .then((data) => data.count),
      ),
    )
    .toBe(initialCount + 1)
})
