import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('..')
const output = path.join(root, '.local-qa', 'fullscreen-recovery')
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const test = base.extend({
  serverURL: async ({}, use) => {
    if (process.env.LASTTRAIN_TEST_URL) {
      await use(process.env.LASTTRAIN_TEST_URL)
      return
    }
    const dataDir = path.join(
      root,
      '.local-qa',
      `fullscreen-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    const env = {
      ...process.env,
      LASTTRAIN_DATA_DIR: dataDir,
      LASTTRAIN_PORT: '8896',
      LASTTRAIN_NONINTERACTIVE: '1',
    }
    const launcher = (command, args = []) =>
      execFileSync(python, [path.join(root, 'back/launcher.py'), command, ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    launcher('init')
    launcher('start', ['--no-browser'])
    try {
      const { port } = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json')))
      await use(`http://127.0.0.1:${port}`)
    } finally {
      launcher('stop')
      const qaRoot = fs.realpathSync(path.join(root, '.local-qa'))
      const actualData = fs.realpathSync(dataDir)
      if (!actualData.startsWith(`${qaRoot}${path.sep}`))
        throw new Error('QA data path escaped workspace')
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  },
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

const selectors = {
  compartment: '.compartment',
  board: '.cabin-board',
  radio: '.table-radio',
  ticket: '.ticket-object',
  atlas: '.atlas-object',
  notebook: '.notebook-object',
  sidebar: '.sidebar',
}

async function geometry(page) {
  return page.evaluate((targets) => {
    const compartment = document.querySelector(targets.compartment).getBoundingClientRect()
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect()
      return {
        x: box.x - compartment.x,
        y: box.y - compartment.y,
        width: box.width,
        height: box.height,
      }
    }
    const boxes = Object.fromEntries(
      Object.entries(targets).map(([name, selector]) => [name, rect(selector)]),
    )
    const intersects = (a, b) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    const objects = ['radio', 'ticket', 'atlas', 'notebook']
    return {
      fullscreen: !!document.fullscreenElement,
      enabled: document.fullscreenEnabled,
      immersive: document.body.classList.contains('journey-immersive'),
      scroll: document.querySelector('.shell-main').scrollTop,
      overflow: document.documentElement.scrollWidth - innerWidth,
      overlap: objects.some((a, index) =>
        objects.some((b, other) => other > index && intersects(boxes[a], boxes[b])),
      ),
      ticketOnBoard: intersects(boxes.ticket, boxes.board),
      boxes,
    }
  }, selectors)
}

async function settleObjectHover(page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('.notebook-object, .ticket-object, .sidebar')].flatMap(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map((animation) => animation.finished),
      ),
    ),
  )
}

test('Escape restores normal compartment geometry', async ({ page }) => {
  test.setTimeout(180000)
  fs.mkdirSync(output, { recursive: true })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/journeys/new')
  await page.locator('input[name="title"]').fill('Fullscreen QA')
  await page.locator('input[name="destination_station"]').fill('Last station')
  await page.locator('.create-form .button.primary').click()
  await expect(page.locator('.cabin-board')).toContainText('Last station')
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
  })
  const results = []
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
    [900, 720],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height })
    for (let cycle = 1; cycle <= 3; cycle++) {
      await page.evaluate(() => {
        window.scrollTo(0, 0)
        document.querySelector('.shell-main').scrollTop = 0
      })
      await settleObjectHover(page)
      const before = await geometry(page)
      if (cycle === 1)
        await page.screenshot({
          path: path.join(output, `${width}x${height}-before.png`),
          fullPage: true,
        })
      await page.locator('.cabin-mode-controls button').click()
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
      const inside = await geometry(page)
      expect(inside.enabled).toBe(true)
      expect(inside.immersive).toBe(true)
      if (cycle === 1)
        await page.screenshot({
          path: path.join(output, `${width}x${height}-inside.png`),
          fullPage: true,
        })
      await page.keyboard.press('Escape')
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
      await expect
        .poll(() => page.evaluate(() => document.body.classList.contains('journey-immersive')))
        .toBe(false)
      await settleObjectHover(page)
      const after = await geometry(page)
      if (cycle === 1)
        await page.screenshot({
          path: path.join(output, `${width}x${height}-after.png`),
          fullPage: true,
        })
      expect(after.overflow, `${width}x${height} horizontal overflow`).toBeLessThanOrEqual(1)
      expect(after.overlap, `${width}x${height} object overlap`).toBe(false)
      expect(after.ticketOnBoard, `${width}x${height} ticket over board`).toBe(false)
      for (const name of Object.keys(selectors)) {
        for (const field of ['x', 'y', 'width', 'height']) {
          expect(
            Math.abs(after.boxes[name][field] - before.boxes[name][field]),
            `${width}x${height} cycle ${cycle} ${name}.${field}`,
          ).toBeLessThan(2)
        }
      }
      results.push({ width, height, cycle, before, inside, after })
      fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(results, null, 2))
    }
    await page.locator('.table-radio').click()
    await expect(page.locator('.radio-overlay')).toBeVisible()
    await page.locator('.radio-overlay .object-overlay-toolbar button').click()
    await page.locator('.atlas-object').click()
    await expect(page.locator('.atlas-overlay')).toBeVisible()
    await page.locator('.atlas-overlay .object-overlay-toolbar button').click()
    await page.locator('.notebook-object').click()
    await expect(page.locator('.notebook-dialog')).toBeVisible()
    await page.locator('.notebook-toolbar button').click()
    await page.locator('.ticket-object').click()
    await expect(page).toHaveURL(/\/statistics$/)
    await page.goto('/dashboard')
    await expect(page.locator('.cabin-heading')).toContainText('Fullscreen QA')
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await settleObjectHover(page)
  const beforeButtonExit = await geometry(page)
  await page.locator('.cabin-mode-controls button').click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await page.locator('.mode-exit').click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('journey-immersive')))
    .toBe(false)
  await settleObjectHover(page)
  const afterButtonExit = await geometry(page)
  for (const name of Object.keys(selectors)) {
    for (const field of ['x', 'y', 'width', 'height']) {
      expect(
        Math.abs(afterButtonExit.boxes[name][field] - beforeButtonExit.boxes[name][field]),
        `button exit ${name}.${field}`,
      ).toBeLessThan(2)
    }
  }
})

test('native exit before request promise settles clears immersive state', async ({ page }) => {
  await page.goto('/journeys/new')
  await page.locator('input[name="title"]').fill('Fullscreen race QA')
  await page.locator('input[name="destination_station"]').fill('Last station')
  await page.locator('.create-form .button.primary').click()
  await expect(page.locator('.cabin-heading')).toContainText('Fullscreen race QA')
  await page.evaluate(() => {
    const request = Element.prototype.requestFullscreen
    Element.prototype.requestFullscreen = function (...args) {
      return request.apply(this, args).then(
        () =>
          new Promise((resolve) => {
            window.releaseFullscreenRequest = resolve
          }),
      )
    }
  })
  await page.locator('.cabin-mode-controls button').click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await page.evaluate(() => document.exitFullscreen())
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  await page.evaluate(() => window.releaseFullscreenRequest())
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('journey-immersive')))
    .toBe(false)
})

test('fullscreen exit keeps overlays, focus, audio and scrolling consistent', async ({ page }) => {
  test.setTimeout(90000)
  await page.addInitScript(() => {
    window.audioContexts = []
    const NativeContext = window.AudioContext
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
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args)
        this.probe = this.createAnalyser()
        this.probe.fftSize = 2048
        this.probe.connect(this.destination)
        window.audioContexts.push(this)
      }
    }
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/settings')
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="en"]') })
    .selectOption('en')
  await page.goto('/journeys/new')
  await page.locator('input[name="title"]').fill('Fullscreen overlays QA')
  await page.locator('input[name="destination_station"]').fill('Last station')
  await page.locator('.create-form .button.primary').click()
  await expect(page.locator('.cabin-heading')).toContainText('Fullscreen overlays QA')
  await page.evaluate(() => document.fonts.ready)
  const sidebarScroll = await page.locator('.sidebar-scroll').evaluate((element) => {
    element.scrollTop = 100
    return element.scrollTop
  })
  const timerBefore = await page.locator('.cabin-timer').textContent()
  await page.locator('.cabin-mode-controls button').click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await page.locator('.mode-exit').click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('journey-immersive')))
    .toBe(false)

  const musicPeak = () =>
    page.evaluate(() => {
      const context = window.audioContexts.at(-1)
      if (!context) return 0
      const samples = new Float32Array(2048)
      context.probe.getFloatTimeDomainData(samples)
      return Math.max(...samples.map(Math.abs))
    })
  for (const [object, dialog] of [
    ['.table-radio', '.radio-overlay'],
    ['.atlas-object', '.atlas-overlay'],
    ['.notebook-object', '.notebook-dialog'],
    ['.cabin-new', '.journey-overlay'],
  ]) {
    await page.locator('.cabin-mode-controls button').click()
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await page.locator(object).click()
    await expect(page.locator(dialog)).toBeVisible()
    if (dialog === '.radio-overlay') {
      await page.getByRole('button', { name: 'Play music' }).click()
      await expect.poll(musicPeak).toBeGreaterThan(0.001)
    }
    if (dialog === '.journey-overlay')
      await page.locator(`${dialog} input[name="title"]`).fill('Unfinished draft')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('journey-immersive')))
      .toBe(false)
    await expect(page.locator(dialog)).toBeVisible()
    if (dialog === '.journey-overlay')
      await expect(page.locator(`${dialog} input[name="title"]`)).toHaveValue('Unfinished draft')
    if (dialog !== '.radio-overlay') await expect.poll(musicPeak).toBeGreaterThan(0.001)
    await page.keyboard.press('Escape')
    await expect(page.locator(dialog)).toHaveCount(0)
    await expect(page.locator(object)).toBeFocused()
    expect(await page.locator('.sidebar-scroll').evaluate((element) => element.scrollTop)).toBe(
      sidebarScroll,
    )
    expect(await page.locator('.shell-main').evaluate((element) => element.style.overflow)).toBe('')
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  }
  expect(await page.evaluate(() => window.audioContexts.length)).toBe(1)
  expect(await page.evaluate(() => window.audioContexts[0].state)).toBe('running')
  expect(await page.locator('.cabin-timer').textContent()).not.toBe(timerBefore)
})
