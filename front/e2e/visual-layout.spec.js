import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `visual-layout-${Date.now()}`)
const baseline = process.env.LAYOUT_BASELINE === '1'
const output = path.join(root, '.local-qa', baseline ? 'layout-before' : 'layout-after')
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8878',
  LASTTRAIN_NONINTERACTIVE: '1',
}
const launcher = (command, args = []) =>
  execFileSync(python, [path.join(root, 'back/launcher.py'), command, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
const finishJourney = () =>
  execFileSync(
    python,
    [
      path.join(root, 'back/manage.py'),
      'shell',
      '-c',
      'from django.utils import timezone; from datetime import timedelta; from journeys.models import Journey; j=Journey.objects.get(pk=1); j.started_at=timezone.now()-timedelta(hours=3); j.expected_arrival_at=timezone.now()-timedelta(minutes=1); j.save()',
    ],
    { cwd: root, env, encoding: 'utf8' },
  )

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
        if (dataDir.startsWith(path.join(root, '.local-qa', 'visual-layout-')))
          fs.rmSync(dataDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

const sizes = [
  [1366, 768],
  [1280, 720],
  [900, 720],
  [390, 844],
  [360, 800],
]

async function capture(page, size, state) {
  const label = `${size[0]}x${size[1]}-${state}`
  await page.waitForTimeout(320)
  await page.screenshot({ path: path.join(output, `${label}.png`) })
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    const sidebar = document.querySelector('.sidebar-scroll')
    const shell = document.querySelector('.shell-main')
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      compartment: rect('.compartment'),
      ticket: rect('.ticket-object'),
      atlas: rect('.atlas-object'),
      board: rect('.cabin-board'),
      arrival: rect('.window-arrival'),
      notebook: rect('.notebook-object'),
      radio: rect('.music-player'),
      exit: rect('.mode-exit'),
      sidebar: rect('.sidebar'),
      sidebarScroll: sidebar
        ? { top: sidebar.scrollTop, height: sidebar.clientHeight, content: sidebar.scrollHeight }
        : null,
      shellScroll: shell
        ? { top: shell.scrollTop, height: shell.clientHeight, content: shell.scrollHeight }
        : null,
      fullscreen: !!document.fullscreenElement,
    }
  })
  fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(geometry, null, 2))
  return geometry
}

function overlap(first, second) {
  if (!first || !second) return 0
  return (
    Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
    ) *
    Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
    )
  )
}

function checkLayout(geometry, state) {
  if (baseline) return
  expect(overlap(geometry.ticket, geometry.atlas), 'ticket and atlas overlap').toBe(0)
  expect(overlap(geometry.board, geometry.arrival), 'route board and arrival overlap').toBe(0)
  if (!['immersive', 'notebook'].includes(state)) {
    expect(overlap(geometry.board, geometry.ticket), 'route board and ticket overlap').toBe(0)
    expect(overlap(geometry.board, geometry.atlas), 'route board and atlas overlap').toBe(0)
  }
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width + 1)
  if (['immersive', 'notebook'].includes(state)) {
    expect(geometry.fullscreen).toBe(true)
    for (const key of ['exit', 'radio']) {
      const box = geometry[key]
      expect(box?.x, `${key} left`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${key} right`).toBeLessThanOrEqual(geometry.viewport.width + 1)
      expect(box.y, `${key} top`).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height, `${key} bottom`).toBeLessThanOrEqual(geometry.viewport.height + 1)
    }
  }
}

test('compartment and sidebar layout across viewports', async ({ page }) => {
  test.setTimeout(300000)
  fs.mkdirSync(output, { recursive: true })
  await page.goto('/settings')
  await page.getByLabel('\u042f\u0437\u044b\u043a', { exact: true }).selectOption('en')
  await page.goto('/journeys/new')
  await page.getByLabel('Journey name').fill('Visual layout journey')
  await page.getByLabel('Destination station').fill('Depot')
  await page.getByLabel('Hours', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.locator('.ticket-object')).toBeVisible()

  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] })
    await page.goto('/dashboard')
    await expect(page.locator('.atlas-object')).toBeVisible()
    await expect(page.locator('.cabin-heading strong')).toHaveText('Visual layout journey')
    checkLayout(await capture(page, size, 'active'), 'active')
    if (size[0] === 1366 || size[0] === 360) {
      if (size[0] === 1366) {
        await page.locator('.atlas-object').focus()
        await page.keyboard.press('Enter')
      } else {
        await page.locator('.atlas-object').click()
      }
      await expect(page.getByRole('heading', { name: 'Railway Atlas' })).toBeVisible()
      await page.getByRole('link', { name: 'Return to carriage' }).click()
      await page.locator('.ticket-object').click()
      await expect(page).toHaveURL(/\/statistics$/)
      await page.goto('/dashboard')
      await expect(page.locator('.cabin-heading strong')).toHaveText('Visual layout journey')
    }
    await page.getByRole('button', { name: 'Enter immersive mode' }).click()
    await expect(page.locator('body')).toHaveClass(/journey-immersive/)
    checkLayout(await capture(page, size, 'immersive'), 'immersive')
    if (size[0] <= 800) {
      const scroll = page.locator('.shell-main')
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      const bottom = await capture(page, size, 'immersive-bottom')
      expect(bottom.shellScroll.top).toBeGreaterThan(0)
      checkLayout(bottom, 'immersive')
    }
    await page.getByRole('button', { name: 'Open travel notebook' }).click()
    await expect(page.getByRole('dialog', { name: 'Travel notebook' })).toBeVisible()
    checkLayout(await capture(page, size, 'notebook'), 'notebook')
    await page.getByRole('button', { name: 'Close editor' }).click()
    await page.getByRole('button', { name: 'Exit immersive mode' }).click()
    await expect(page.locator('body')).not.toHaveClass(/journey-immersive/)
    if (size[0] <= 800) await page.getByRole('button', { name: 'Open menu' }).click()
    await capture(page, size, 'sidebar')
    const sidebar = page.locator('.sidebar-scroll')
    const beforeMainScroll = await page.evaluate(() => window.scrollY)
    await sidebar.focus()
    await page.keyboard.press('End')
    if (size[0] > 800) {
      await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      expect(await page.evaluate(() => window.scrollY)).toBe(beforeMainScroll)
      await sidebar.evaluate((element) => {
        element.scrollTop = 0
      })
      await sidebar.hover()
      await page.mouse.wheel(0, 400)
      await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      expect(await page.evaluate(() => window.scrollY)).toBe(beforeMainScroll)
    }
    await expect(page.locator('.user-chip')).toBeInViewport()
    await sidebar.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  }

  finishJourney()
  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] })
    await page.goto('/dashboard')
    await expect(page.locator('.window-arrival')).toBeVisible()
    checkLayout(await capture(page, size, 'completed'), 'completed')
  }
})

test('short mobile sidebar supports touch and Russian labels', async ({ browser, serverURL }) => {
  const context = await browser.newContext({
    baseURL: serverURL,
    viewport: { width: 360, height: 500 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  try {
    await page.goto('/settings')
    await page.getByLabel(/Language|\u042f\u0437\u044b\u043a/).selectOption('en')
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const sidebar = page.locator('.sidebar-scroll')
    await expect(sidebar).toBeVisible()
    const dimensions = await sidebar.evaluate((element) => ({
      height: element.clientHeight,
      content: element.scrollHeight,
    }))
    expect(dimensions.content).toBeGreaterThan(dimensions.height)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 125, y: 430 }],
    })
    for (const y of [390, 350, 310, 270, 230, 190]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 125, y }],
      })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeInViewport()
    await sidebar.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByLabel('Language', { exact: true }).selectOption('ru')
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    await expect(page.locator('.sidebar-scroll')).toContainText('Железнодорожный атлас')
    await page.waitForTimeout(350)
    const menuBounds = await page.locator('.sidebar').boundingBox()
    expect(menuBounds.x).toBeGreaterThanOrEqual(0)
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(360)
    await page.screenshot({ path: path.join(output, '360x500-ru-sidebar.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361)
  } finally {
    await context.close()
  }
})
