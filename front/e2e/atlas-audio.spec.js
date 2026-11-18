import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `atlas-audio-${Date.now()}`)
const output = path.join(
  root,
  '.local-qa',
  process.env.QA_BASELINE ? 'atlas-audio-before' : 'atlas-audio-after',
)
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8879',
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
        if (dataDir.startsWith(path.join(root, '.local-qa', 'atlas-audio-')))
          fs.rmSync(dataDir, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ serverURL }, use) => use(serverURL),
})

test('railway atlas and independent train audio in the local browser', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(240000)
  fs.mkdirSync(output, { recursive: true })
  await page.addInitScript(() => {
    window.audioAudit = []
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
        window.audioAudit.push(this)
      }
    }
  })
  const state = async () =>
    page.evaluate(() =>
      window.audioAudit.map((context) => {
        const samples = new Float32Array(2048)
        context.probe.getFloatTimeDomainData(samples)
        return { state: context.state, peak: Math.max(...samples.map(Math.abs)) }
      }),
    )
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/settings')
  await page.getByLabel('\u042f\u0437\u044b\u043a', { exact: true }).selectOption('en')
  await page.goto('/dashboard')
  const before = {
    status: await page.locator('.train-sound-status').innerText(),
    audio: await state(),
  }
  await page.locator('.train-sound-status').click()
  await page.waitForTimeout(900)
  const afterClick = {
    status: await page.locator('.train-sound-status').innerText(),
    audio: await state(),
  }
  await page.getByRole('link', { name: 'New journey' }).click()
  await page.getByLabel('Journey name').fill('Atlas audio QA')
  await page.getByLabel('Destination station').fill('Depot')
  await page.getByLabel('Hours', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await page.waitForTimeout(1000)
  const traveling = {
    status: await page.locator('.train-sound-status').innerText(),
    audio: await state(),
  }
  await page.locator('.atlas-object').click()
  await expect(page.locator('.atlas-frame')).toBeVisible()
  await page.screenshot({ path: path.join(output, '1366x768-atlas.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(output, '390x844-atlas.png') })
  fs.writeFileSync(
    path.join(output, 'baseline.json'),
    JSON.stringify({ before, afterClick, traveling }, null, 2),
  )
  expect(before.status).toContain('Press to enable')
  expect(afterClick.status).toContain('Train sounds on')
  expect(afterClick.audio).toHaveLength(1)
  expect(afterClick.audio[0].state).toBe('running')
  expect(traveling.audio[0].peak).toBeGreaterThan(0.003)
  expect(traveling.audio[0].peak).toBeLessThan(0.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  const map = page.locator('.atlas-frame')
  expect(await map.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
    await map.evaluate((element) => element.clientWidth),
  )
  await map.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.screenshot({ path: path.join(output, '390x844-atlas-right.png') })
  await map.evaluate((element) => {
    element.scrollLeft = 0
  })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.screenshot({ path: path.join(output, '390x844-atlas-bottom.png') })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Departure station' }).click()
  await expect(page.getByRole('status')).toContainText('Departure station')
  await page.getByRole('button', { name: 'Destination station' }).click()
  await expect(page.getByRole('status')).toContainText('Depot')
  await page.getByRole('button', { name: 'Inspect train position' }).click()
  await expect(page.getByRole('status')).toContainText('Current train location')
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.screenshot({ path: path.join(output, '1366x768-atlas-bottom.png') })
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const ambienceVolume = page.getByLabel('Train ambience volume', { exact: true })
  await ambienceVolume.fill('60')
  await ambienceVolume.press('ArrowRight')
  await expect(ambienceVolume).toHaveValue('61')
  await page.getByRole('link', { name: 'Overview' }).click()
  await expect.poll(async () => (await state())[0]?.peak || 0).toBeGreaterThan(0.003)
  await page.getByRole('button', { name: 'Mute train ambience' }).click()
  await page.waitForTimeout(1600)
  expect((await state())[0].peak).toBeLessThan(0.0003)
  await page.getByRole('button', { name: 'Unmute train ambience' }).click()
  await page.getByRole('button', { name: 'Play music' }).click()
  await expect.poll(async () => (await state()).length).toBe(2)
  await page.getByRole('button', { name: 'Mute train ambience' }).click()
  await page.waitForTimeout(1600)
  const independent = await state()
  expect(independent[0].peak).toBeLessThan(0.0003)
  expect(independent[1].peak).toBeGreaterThan(0.001)
  await page.getByRole('button', { name: 'Unmute train ambience' }).click()
  await page.getByRole('button', { name: 'Pause music' }).click()
  await expect.poll(async () => (await state())[0]?.peak || 0).toBeGreaterThan(0.003)
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  await expect.poll(async () => (await state())[0].peak, { timeout: 12000 }).toBeLessThan(0.01)
  await page.getByRole('button', { name: 'RESUME', exact: true }).click()
  await expect.poll(async () => (await state())[0]?.peak || 0).toBeGreaterThan(0.003)
  await page.getByRole('button', { name: 'FINISH', exact: true }).click()
  await page.waitForTimeout(1600)
  expect((await state())[0].peak).toBeLessThan(0.04)
  await page.getByRole('link', { name: 'New journey' }).click()
  await page.getByLabel('Journey name').fill('Short branch')
  await page.getByLabel('Destination station').fill('Halt')
  await page.getByLabel('Hours', { exact: true }).fill('0')
  await page.getByLabel('Minutes', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await page.locator('.atlas-object').click()
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await expect(page.locator('.atlas-navigation-hint')).toContainText('one region')
  await page.screenshot({ path: path.join(output, '1366x768-short.png') })
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('button', { name: 'FINISH', exact: true }).click()
  await page.getByRole('link', { name: 'New journey' }).click()
  await page.getByLabel('Journey name').fill('Long railway')
  await page.getByLabel('Destination station').fill('Mountain depot')
  await page.getByLabel('Hours', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Add break' }).click()
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await page.locator('.atlas-object').click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  const startMarker = await page.locator('.atlas-marker.train').getAttribute('style')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled()
  await page.locator('.atlas-frame').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await page.reload()
  const reloadedMarker = await page.locator('.atlas-marker.train').getAttribute('style')
  const xPosition = (style) => Number(style.match(/left: ([\d.]+)%/)[1])
  expect(Math.abs(xPosition(reloadedMarker) - xPosition(startMarker))).toBeLessThan(0.3)
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  await page.locator('.atlas-object').click()
  const frozen = await page.locator('.atlas-marker.train').getAttribute('style')
  const frozenRegion = await page.locator('.atlas-map-title').innerText()
  await page.waitForTimeout(1300)
  await expect(page.locator('.atlas-marker.train')).toHaveAttribute('style', frozen)
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('button', { name: 'RESUME', exact: true }).click()
  const id = await page.evaluate(
    async () => (await (await fetch('/api/journeys/?status=active')).json()).results[0].id,
  )
  const advance = `from datetime import timedelta; from journeys.models import Journey; j=Journey.objects.get(pk=${Number(id)}); j.started_at-=timedelta(minutes=91); j.expected_arrival_at-=timedelta(minutes=91); j.save(update_fields=['started_at','expected_arrival_at'])`
  execFileSync(python, [path.join(root, 'back/manage.py'), 'shell', '-c', advance], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  await page.locator('.atlas-object').click()
  const advancedMarker = await page.locator('.atlas-marker.train').getAttribute('style')
  const advancedRegion = await page.locator('.atlas-map-title').innerText()
  expect(
    advancedRegion !== frozenRegion || Math.abs(xPosition(advancedMarker) - xPosition(frozen)) > 5,
  ).toBe(true)
  await page.reload()
  await expect(page.locator('.atlas-marker.train')).toHaveCount(1)
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await expect(page.locator('.cabin-heading')).toContainText('At the station')
  await page.locator('.train-sound-status').click()
  await expect(page.locator('.train-sound-status')).toContainText('Train sounds on')
  await page.waitForTimeout(1000)
  expect((await state()).at(-1).peak).toBeLessThan(0.04)
  await page.locator('.atlas-object').click()
  const stationMarker = await page.locator('.atlas-marker.train').getAttribute('style')
  await page.waitForTimeout(1300)
  await expect(page.locator('.atlas-marker.train')).toHaveAttribute('style', stationMarker)
  await page.getByRole('link', { name: 'Return to carriage' }).click()
  await page.getByRole('button', { name: 'FINISH', exact: true }).click()
  await page.locator('.atlas-object').click()
  await expect(page.locator('.atlas-marker.train')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Train ambience volume', { exact: true })).toHaveValue('61')
  await page.getByRole('button', { name: 'Mute train ambience' }).click()
  await page.reload()
  expect(
    await page.evaluate(async () => (await (await fetch('/api/settings/')).json()).ambience_muted),
  ).toBe(true)
  await context.close()
  const restartedBrowser = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const touchPage = await restartedBrowser.newPage()
  await touchPage.goto('/settings')
  const saved = await touchPage.evaluate(async () => await (await fetch('/api/settings/')).json())
  expect(saved.ambience_volume).toBe(61)
  expect(saved.ambience_muted).toBe(true)
  launcher('stop')
  launcher('start', ['--no-browser'])
  await touchPage.reload()
  const reopened = await touchPage.evaluate(
    async () => await (await fetch('/api/settings/')).json(),
  )
  expect(reopened.ambience_volume).toBe(61)
  expect(reopened.ambience_muted).toBe(true)
  await touchPage.goto(`/atlas?journey=${id}`)
  await touchPage.locator('.atlas-marker.station.start').tap()
  await expect(touchPage.locator('.atlas-point-info')).toBeVisible()
  await restartedBrowser.close()
  expect(errors).toEqual([])
})
