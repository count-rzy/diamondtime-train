import { test as base, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('..')
const dataDir = path.join(root, '.local-qa', `run-${Date.now()}`)
const env = {
  ...process.env,
  LASTTRAIN_DATA_DIR: dataDir,
  LASTTRAIN_PORT: '8875',
  LASTTRAIN_NONINTERACTIVE: '1',
}
const python = path.join(root, 'back/.venv/Scripts/python.exe')
const test = base.extend({
  serverURL: [async ({}, use) => {
    launcher('init')
    launcher('start', ['--no-browser'])
    try {
      const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json')))
      await use(`http://127.0.0.1:${state.port}`)
    } finally {
      launcher('stop')
      if (dataDir.startsWith(path.join(root, '.local-qa', 'run-'))) fs.rmSync(dataDir, {recursive:true,force:true})
    }
  }, {scope:'worker'}],
  baseURL: async ({serverURL}, use) => use(serverURL),
})
function launcher(command, args = [], input) {
  return execFileSync(python, [path.join(root, 'back/launcher.py'), command, ...args], {
    cwd: root,
    env,
    input,
    encoding: 'utf8',
  })
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    window.audioAudit = []
    const NativeContext = window.AudioContext
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function(destination, ...args) {
      return connect.call(this, destination === this.context.destination && this.context.probe && this !== this.context.probe ? this.context.probe : destination, ...args)
    }
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args)
        this.probe = this.createAnalyser()
        this.probe.fftSize = 2048
        this.probe.connect(this.destination)
        this.liveSources = 0
        window.audioAudit.push(this)
        for (const name of ['createOscillator', 'createBufferSource']) {
          const create = this[name].bind(this)
          this[name] = (...values) => {
            const source = create(...values), start = source.start.bind(source)
            source.start = (...parameters) => { start(...parameters); this.liveSources++ }
            source.addEventListener('ended', () => this.liveSources--, {once:true})
            return source
          }
        }
      }
    }
  })
})

test('offline local edition: real browser, persistence, backup and responsive screens', async ({
  page,
  context,
}) => {
  const errors = [],
    external = [],
    failed = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('400 (Bad Request)')) errors.push(message.text().slice(0,200))
  })
  page.on('response', (response) => {
    if (response.status() >= 500) failed.push(response.url())
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByRole('link', { name: 'ЗАНЯТЬ МЕСТО' })).toBeVisible()
  await page.goto('/settings')
  await page.getByLabel('Язык', {exact:true}).selectOption('en')
  await expect(page.getByText('Preferences saved.')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('link', { name: /TAKE YOUR SEAT/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in|register/i })).toHaveCount(0)
  await page.screenshot({ path: path.join(root, '.local-qa', 'welcome.png'), fullPage: true })
  await page.getByRole('link', { name: /TAKE YOUR SEAT/ }).click()
  await page.getByLabel('Journey name').fill('Browser QA journey')
  await page.getByLabel('Destination station').fill('Offline arrival')
  await page.getByLabel('Hours', { exact: true }).fill('0')
  await page.getByLabel('Minutes', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Begin journey' }).click()
  await expect(page.getByRole('button', { name: 'PAUSE', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible()
  const pausedTimer = await page.locator('.cabin-timer').textContent()
  await page.screenshot({ path: path.join(root, '.local-qa', 'paused.png'), fullPage: true })
  const originalPid = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json'))).pid
  launcher('start', ['--no-browser'])
  expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json'))).pid).toBe(originalPid)
  launcher('stop')
  launcher('start', ['--no-browser'])
  await page.reload()
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible()
  await expect(page.locator('.cabin-timer')).toHaveText(pausedTimer)
  await page.goto('/diary')
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Offline note')
  await page.getByLabel('Your reflection').fill('Saved in SQLite across restart.')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('heading', { name: 'Offline note' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit Offline note' }).click()
  await page.getByLabel('Your reflection').fill('Edited and persisted in SQLite.')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await page.getByLabel('Search diary entries').fill('persisted')
  await expect(page.getByText('Edited and persisted in SQLite.')).toBeVisible()
  await page.goto('/settings')
  await page.getByLabel('Display name').fill('Local traveler')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()
  await page.getByLabel('Visual atmosphere').selectOption('night')
  await expect(page.getByText('Preferences saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Create backup', exact: true }).click()
  await expect(page.getByText(/Backup saved:/)).toBeVisible()
  await page.getByRole('button', { name: 'Expand music player' }).first().click()
  await page.getByRole('button', { name: 'Play music' }).click()
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.audioAudit.filter(context => context.state === 'running').length)).toBe(2)
  await page.getByRole('button', { name: 'Next track' }).click()
  await expect(page.locator('.track-info')).toContainText('Night Carriage')
  await page.getByRole('button', { name: 'Previous track' }).click()
  await page.getByRole('button', { name: 'Mute', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause music' }).click()
  const wav = Buffer.alloc(44 + 16000)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(16000, 40)
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.locator('.track-info')).toContainText('test-tone')
  await page.getByRole('button', { name: 'Play music' }).click()
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause music' }).click()
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'invalid.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('This is not an audio file.'),
    })
  await expect(page.locator('.track-info')).toContainText('valid WAV')
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'RESUME', exact: true }).click()
  const viewports = [
    [1920, 1080],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    for (const route of [
      '/dashboard',
      '/journeys/new',
      '/diary',
      '/statistics',
      '/settings',
      '/history',
    ]) {
      await page.goto(route)
      await expect(page.locator('main.content')).toBeVisible()
      await expect(page.locator('.page-loading')).toHaveCount(0)
      await page.waitForLoadState('networkidle')
      await page.screenshot({
        path: path.join(root, '.local-qa', `${width}-${route.replaceAll('/', '_')}.png`),
        fullPage: true,
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${width} ${route} overflow`,
      ).toBeTruthy()
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/dashboard')
  await expect(page.getByText("You've arrived.")).toBeVisible({ timeout: 75000 })
  await page.screenshot({ path: path.join(root, '.local-qa', 'arrival.png'), fullPage: true })
  await page.goto('/login')
  await expect(page).toHaveURL(/dashboard/)
  await page.goto('/register')
  await expect(page).toHaveURL(/dashboard/)
  await page.goto('/settings')
  await expect(page.getByLabel('Display name')).toHaveValue('Local traveler')
  await expect(page.getByLabel('Visual atmosphere')).toHaveValue('night')
  launcher('backup')
  const backup = fs.readdirSync(path.join(dataDir, 'backups')).sort().at(-1)
  launcher('stop')
  launcher('restore', ['--file', path.join(dataDir, 'backups', backup)], 'RESTORE\n')
  launcher('start', ['--no-browser'])
  await page.goto('/diary')
  await expect(page.getByText('Edited and persisted in SQLite.')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete Offline note' }).click()
  await expect(page.getByText('Entry deleted.')).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
  expect(failed).toEqual([])
})

test('Russian workflow, independent audio, hidden tab lifecycle and performance', async ({page, context}) => {
  const errors = [], external = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0,200)) })
  await context.route('**/*', route => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
      external.push(route.request().url()); return route.abort()
    }
    return route.continue()
  })
  await page.goto('/settings')
  const languageSelector = page.locator('select').filter({has: page.locator('option[value="ru"]')})
  await languageSelector.selectOption('ru')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.getByLabel('Громкость поезда', {exact:true}).fill('23')
  await page.getByLabel('Громкость поезда', {exact:true}).press('ArrowRight')
  await expect(page.getByLabel('Громкость поезда', {exact:true})).toHaveValue('24')
  await page.getByLabel('Далёкий гудок поезда', {exact:true}).uncheck()
  await page.getByLabel('Звуки погоды', {exact:true}).uncheck()
  await expect(page.getByText('Настройки сохранены.')).toBeVisible()
  launcher('stop'); launcher('start', ['--no-browser'])
  await page.reload()
  await expect(page.getByLabel('Язык', {exact:true})).toHaveValue('ru')
  await expect(page.getByLabel('Громкость поезда', {exact:true})).toHaveValue('24')
  await expect(page.getByLabel('Далёкий гудок поезда', {exact:true})).not.toBeChecked()
  await page.goto('/journeys/new')
  await page.getByLabel('Название поездки', {exact:true}).fill('Утро — Dawn 🚂')
  await page.getByLabel('Станция назначения', {exact:true}).fill('Ереван')
  await page.getByLabel('Часы', {exact:true}).fill('0')
  await page.getByLabel('Минуты', {exact:true}).fill('1')
  await page.getByRole('button', {name:'Начать поездку', exact:true}).click()
  await expect(page.getByRole('button', {name:'ПАУЗА', exact:true})).toBeVisible()
  await page.getByRole('button', {name:'ПАУЗА', exact:true}).click()
  await expect(page.getByRole('button', {name:'В ПУТЬ', exact:true})).toBeVisible()
  await page.goto('/diary')
  await page.getByRole('button', {name:'Новая запись', exact:true}).click()
  await page.getByLabel('Заголовок', {exact:true}).fill('Ёжик в поезде')
  await page.getByLabel('Ваши мысли', {exact:true}).fill('Тихое утро, кириллица и English остаются как написаны.')
  await page.getByRole('button', {name:'Сохранить запись', exact:true}).click()
  await page.getByLabel('Поиск в дневнике', {exact:true}).fill('кириллица')
  await expect(page.getByRole('heading', {name:'Ёжик в поезде'})).toBeVisible()
  for (const [width, height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844],[360,800]]) {
    await page.setViewportSize({width,height})
    for (const route of ['/dashboard','/journeys/new','/diary','/statistics','/settings','/history']) {
      await page.goto(route)
      await expect(page.locator('.page-loading')).toHaveCount(0)
      await page.waitForLoadState('networkidle')
      await page.screenshot({path:path.join(root,'.local-qa',`ru-${width}-${route.replaceAll('/','_')}.png`), fullPage:true})
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${route}`).toBeTruthy()
      expect(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    }
  }
  await page.goto('/dashboard')
  await page.getByRole('button', {name:'Открыть меню',exact:true}).click()
  await page.getByRole('link', {name:'Настройки',exact:true}).click()
  await expect(page).toHaveURL(/settings/)
  await page.getByRole('button', {name:'Открыть меню',exact:true}).click()
  await page.getByRole('link', {name:'Купе',exact:true}).click()
  await page.locator('.notebook-object').click()
  await expect(page).toHaveURL(/diary/)
  await page.goto('/dashboard')
  await page.locator('.ticket-object').click()
  await expect(page).toHaveURL(/statistics/)
  await page.setViewportSize({width:1366,height:768})
  await page.goto('/dashboard')
  await page.getByRole('button', {name:'В ПУТЬ',exact:true}).click()
  await page.getByRole('button', {name:'Включить музыку',exact:true}).click()
  await page.getByRole('button', {name:'Открыть радио',exact:true}).first().click()
  await expect(page.locator('.playlist-tracks button')).toHaveCount(3)
  if (await page.getByRole('button', {name:'Включить звук радио',exact:true}).count()) await page.getByRole('button', {name:'Включить звук радио',exact:true}).click()
  await page.getByRole('button', {name:'Свернуть радио',exact:true}).click()
  await expect.poll(() => page.evaluate(() => window.audioAudit.filter(audio => audio.state === 'running').length)).toBe(2)
  await page.waitForTimeout(2000)
  const signal = await page.evaluate(() => window.audioAudit.map(audio => { const samples = new Float32Array(2048); audio.probe.getFloatTimeDomainData(samples); return Math.max(...samples.map(Math.abs)) }))
  expect(signal.every(peak => peak > 0 && peak < 0.3), `Audio peaks: ${signal}`).toBe(true)
  await page.getByRole('button', {name:'Выключить звук поезда',exact:true}).click()
  await page.waitForTimeout(2500)
  const muted = await page.evaluate(() => window.audioAudit.map(audio => { const samples = new Float32Array(2048); audio.probe.getFloatTimeDomainData(samples); return Math.max(...samples.map(Math.abs)) }))
  expect(muted[0]).toBeLessThan(0.0001)
  expect(muted[1]).toBeGreaterThan(0.001)
  await page.getByRole('button', {name:'Включить звук поезда',exact:true}).click()
  await page.getByRole('button', {name:'Приостановить музыку',exact:true}).click()
  await expect.poll(() => page.evaluate(() => window.audioAudit[1].liveSources)).toBe(0)
  // Synthetic visibility event checks lifecycle deterministically; actual OS sleep is not simulated.
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => page.evaluate(() => window.audioAudit.every(audio => audio.state === 'suspended'))).toBe(true)
  expect(await page.locator('html').getAttribute('data-hidden')).toBe('true')
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => page.evaluate(() => window.audioAudit[0].state)).toBe('running')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name,item.value]))
  await page.waitForTimeout(20000)
  await cdp.send('HeapProfiler.collectGarbage')
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name,item.value]))
  const measurement = {seconds:after.Timestamp-before.Timestamp, rendererTaskSeconds:after.TaskDuration-before.TaskDuration, heapBefore:before.JSHeapUsedSize, heapAfter:after.JSHeapUsedSize, audio:await page.evaluate(() => window.audioAudit.map(audio => ({state:audio.state, liveSources:audio.liveSources})))}
  fs.writeFileSync(path.join(root,'.local-qa','performance.json'), JSON.stringify(measurement,null,2))
  expect(after.JSHeapUsedSize-before.JSHeapUsedSize).toBeLessThan(8*1024*1024)
  expect(measurement.audio[0].liveSources).toBeLessThan(12)
  await expect(page.getByText('Вы прибыли.')).toBeVisible({timeout:75000})
  await page.goto('/history')
  await expect(page.getByText('Утро — Dawn 🚂')).toBeVisible()
  await page.goto('/diary')
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Удалить «Ёжик в поезде»'); await dialog.accept() })
  await page.getByRole('button', {name:'Удалить: Ёжик в поезде',exact:true}).click()
  await expect(page.getByText('Запись удалена.')).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})
