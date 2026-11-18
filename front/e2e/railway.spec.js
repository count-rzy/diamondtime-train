import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildRoute, deriveWorld } from '../src/world.js'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `railway-${Date.now()}`)
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const manage = path.join(root, 'back/manage.py')
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8877',
  LASTTRAIN_NONINTERACTIVE: '1',
}
const launcher = (command, args = []) =>
  execFileSync(python, [path.join(root, 'back/launcher.py'), command, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
const timeTravel = (code) =>
  execFileSync(
    python,
    [
      manage,
      'shell',
      '-c',
      `from django.utils import timezone; from datetime import timedelta; from journeys.models import Journey; j=Journey.objects.get(pk=1); now=timezone.now(); ${code}`,
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
        if (dataDir.startsWith(path.join(root, '.local-qa', 'railway-')))
          fs.rmSync(dataDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

test('breaks, atlas, events, depot and existing carriage remain connected', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.getByLabel('Язык', { exact: true }).selectOption('en')
  await page.goto('/journeys/new')
  await page.getByLabel('Journey name').fill('Living railway')
  await page.getByLabel('Destination station').fill('Final depot')
  await page.getByLabel('Hours', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Add break' }).click()
  await page.getByRole('button', { name: 'Add break' }).click()
  await page.locator('.break-row').nth(0).locator('input').first().fill('60')
  await page.locator('.break-row').nth(1).locator('input').first().fill('100')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.getByRole('button', { name: 'Stop at station' })).toBeVisible()
  const snapshot = await (await page.request.get('/api/journeys/1/')).json()
  expect(snapshot.breaks).toHaveLength(2)
  await page.getByRole('link', { name: 'Open Railway Atlas' }).click()
  await expect(page.getByRole('heading', { name: 'Railway Atlas' })).toBeVisible()
  await expect(page.locator('.atlas-locomotive')).toHaveCount(1)
  await page.screenshot({ path: path.join(root, '.local-qa', 'railway-atlas.png') })
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('button', { name: 'Stop at station' }).click()
  await expect(page.getByText('Rest time remaining')).toBeVisible()
  await expect(page.locator('.compartment')).not.toHaveClass(/in-motion/)
  const stopped = await (await page.request.get('/api/journeys/1/')).json()
  expect(stopped.status).toBe('break')
  const stoppedDistance = stopped.distance_meters
  await page.waitForTimeout(1100)
  expect((await (await page.request.get('/api/journeys/1/')).json()).distance_meters).toBe(
    stoppedDistance,
  )
  timeTravel(
    'j.started_at=now-timedelta(minutes=10,seconds=5); j.break_started_at=now-timedelta(minutes=10,seconds=5); j.break_ends_at=now-timedelta(seconds=5); j.expected_arrival_at=j.started_at+timedelta(minutes=140); j.save()',
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Stop at station' })).toBeVisible()
  const resumed = await (await page.request.get('/api/journeys/1/')).json()
  expect(resumed.break_seconds).toBe(600)
  expect(resumed.distance_meters).toBeGreaterThanOrEqual(stoppedDistance)
  const route = buildRoute(snapshot)
  const eventSeconds = Array.from({ length: 99 * 60 }, (_, i) => i + 1).find(
    (seconds) => deriveWorld({ ...snapshot, status: 'active', elapsed_seconds: seconds }).event,
  )
  expect(eventSeconds).toBeTruthy()
  timeTravel(
    `j.started_at=now-timedelta(seconds=${eventSeconds + 600}); j.expected_arrival_at=j.started_at+timedelta(minutes=140); j.save()`,
  )
  await page.reload()
  await expect(page.locator('.rail-world-event')).toHaveCount(1)
  await page.goto('/settings')
  await page.getByLabel('Atmospheric events').uncheck()
  await page.goto('/dashboard')
  await expect(page.locator('.rail-world-event')).toHaveCount(0)
  const boundarySeconds = (route[0].end * 60) / 100 + 60
  timeTravel(
    `j.started_at=now-timedelta(seconds=${boundarySeconds + 600}); j.expected_arrival_at=j.started_at+timedelta(minutes=140); j.save()`,
  )
  await page.goto('/atlas')
  await expect(page.locator('.atlas-navigation strong')).toContainText(
    /forest|Mountain|Lakeside|bridge|tunnel|settlement|Industrial|city/i,
  )
  expect(
    (await (await page.request.get('/api/journeys/1/')).json()).distance_meters,
  ).toBeGreaterThan(route[0].end)
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByRole('button', { name: 'Follow train' }).click()
  await page.goto('/dashboard')
  const crossed = await (await page.request.get('/api/journeys/1/')).json()
  const crossedScene = deriveWorld(crossed).region.scene
  if (crossedScene === 'valley') {
    await expect(page.locator('.cabin-art image[href^="/art/valley-"]')).toHaveCount(2)
  } else {
    await expect(
      page.locator(`.cabin-art image[href="/art/rail-${crossedScene}.png"]`),
    ).toHaveCount(1)
  }
  timeTravel(
    'j.started_at=now-timedelta(minutes=110,seconds=5); j.expected_arrival_at=j.started_at+timedelta(minutes=140); j.save()',
  )
  await page.reload()
  await expect(page.getByText('Rest time remaining')).toBeVisible()
  const secondStop = await (await page.request.get('/api/journeys/1/')).json()
  expect(secondStop.breaks.filter((item) => item.status === 'active')).toHaveLength(1)
  timeTravel(
    'j.started_at=j.started_at-timedelta(minutes=10); j.break_started_at=now-timedelta(minutes=10,seconds=5); j.break_ends_at=now-timedelta(seconds=5); j.expected_arrival_at=j.started_at+timedelta(minutes=140); j.save()',
  )
  await page.reload()
  await expect(page.locator('.compartment')).toHaveClass(/in-motion/)
  await page.getByRole('button', { name: 'Open travel notebook' }).click()
  await expect(page.getByRole('dialog', { name: 'Travel notebook' })).toBeVisible()
  await page.getByRole('button', { name: 'Close editor' }).click()
  await page.getByRole('button', { name: 'Enter immersive mode' }).click()
  await expect(page.locator('body')).toHaveClass(/journey-immersive/)
  await page.getByRole('button', { name: 'Exit immersive mode' }).click()
  timeTravel(
    'j.started_at=now-timedelta(minutes=140,seconds=5); j.expected_arrival_at=now-timedelta(seconds=5); j.save()',
  )
  await page.reload()
  await expect(page.getByText("You've arrived.")).toBeVisible()
  await expect(page.locator('.cabin-art image[href="/art/rail-depot.png"]')).toHaveCount(1)
  await page.goto('/history')
  await expect(page.getByText('Living railway')).toBeVisible()
  launcher('stop')
  launcher('start', ['--no-browser'])
  await page.reload()
  await expect(page.getByText('Living railway')).toBeVisible()
  expect((await (await page.request.get('/api/journeys/1/')).json()).status).toBe('completed')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/atlas')
  await expect(page.locator('.atlas-frame')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  expect(errors).toEqual([])
})
