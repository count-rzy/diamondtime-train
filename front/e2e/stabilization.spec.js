import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { hashSeed } from '../src/world.js'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `scenery-${Date.now()}`)
const output = path.join(root, '.local-qa', 'stabilization-browser')
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const env = { ...process.env, LASTTRAIN_DATA_DIR: dataDir, LASTTRAIN_PORT: '8894' }
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
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

const seedFor = (offset) => {
  for (let index = 0; index < 1000; index++) {
    const candidate = `scene-${index}`
    if (hashSeed(candidate) % 8 === offset) return candidate
  }
  throw new Error('No route seed')
}

test('scenery follows productive progress, holds stops and stays at the depot', async ({
  page,
}) => {
  fs.mkdirSync(output, { recursive: true })
  const errors = []
  const failedAssets = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.url().includes('/art/') && response.status() >= 400)
      failedAssets.push(response.url())
  })
  const trip = {
    id: 501,
    title: 'Scenery QA',
    description: '',
    starting_station: 'Departure',
    destination_station: 'Depot',
    duration_minutes: 200,
    elapsed_seconds: 2999,
    remaining_seconds: 9001,
    progress: 24.99,
    status: 'active',
    route_seed: seedFor(0),
    breaks: [],
    break_seconds: 0,
    diary_count: 0,
  }
  await page.route(/\/api\/journeys\/(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [trip] }),
    }),
  )
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/dashboard')
  const art = page.locator('.rail-region-art')
  await expect(art).toHaveAttribute('href', '/art/rail-forest.png')
  await page.screenshot({ path: path.join(output, 'forest.png') })

  trip.elapsed_seconds = 3001
  trip.remaining_seconds = 8999
  trip.progress = 25.01
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.rail-scene-enter')).toBeVisible()
  await page.screenshot({ path: path.join(output, 'transition-start.png') })
  await page.waitForTimeout(220)
  await page.screenshot({ path: path.join(output, 'transition-middle.png') })
  await expect(page.locator('.rail-scene-exit')).toHaveCount(0)
  await page.screenshot({ path: path.join(output, 'valley.png') })

  trip.status = 'break'
  trip.progress = 25.01
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.compartment')).not.toHaveClass(/in-motion/)
  await expect(page.locator('.pixel-valley-drift')).toBeVisible()
  await page.screenshot({ path: path.join(output, 'station-break.png') })

  trip.status = 'active'
  trip.route_seed = seedFor(4)
  trip.elapsed_seconds = 0
  trip.remaining_seconds = 12000
  trip.progress = 0
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.rail-region-art').last()).toHaveAttribute(
    'href',
    '/art/rail-tunnel-v3.png',
  )
  await expect(page.locator('.tunnel-passing-lights')).toBeVisible()
  await page.screenshot({ path: path.join(output, 'tunnel.png') })

  trip.status = 'completed'
  trip.elapsed_seconds = 12000
  trip.remaining_seconds = 0
  trip.progress = 100
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.rail-region-art').last()).toHaveAttribute(
    'href',
    '/art/rail-depot.png',
  )
  await expect(page.locator('.rail-scene-exit')).toHaveCount(0)
  await page.waitForTimeout(1100)
  await expect(page.locator('.rail-region-art')).toHaveCount(1)
  await page.screenshot({ path: path.join(output, 'depot.png') })
  expect(failedAssets).toEqual([])
  expect(errors).toEqual([])
})
