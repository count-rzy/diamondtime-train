// Bounded real-browser resource soak against a disposable database.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve('..')
const data = path.join(root, '.local-qa', `soak-${Date.now()}`)
const env = {...process.env, LASTTRAIN_DATA_DIR:data, LASTTRAIN_PORT:'8885'}
const launcher = command => execFileSync(path.join(root,'back/.venv/Scripts/python.exe'),[path.join(root,'back/launcher.py'),command,...(command==='start'?['--no-browser']:[])],{env,encoding:'utf8'})
let browser
try {
  launcher('init'); launcher('start')
  const port = JSON.parse(fs.readFileSync(path.join(data,'server.json'))).port
  browser = await chromium.launch({channel:'chrome',headless:true})
  const page = await browser.newPage({viewport:{width:1366,height:768}})
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await page.addInitScript(() => {
    window.audioContexts=[]
    const Original = window.AudioContext
    window.AudioContext=class extends Original {
      constructor(...args) {
        super(...args); window.audioContexts.push(this); this.liveSources=0
        for (const method of ['createOscillator','createBufferSource']) {
          const create=this[method].bind(this)
          this[method]=(...args) => {
            const node=create(...args), start=node.start.bind(node)
            node.start=(...args) => { start(...args); this.liveSources++ }
            node.addEventListener('ended',()=>this.liveSources--,{once:true})
            return node
          }
        }
      }
    }
  })
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,150))})
  await page.goto(`http://127.0.0.1:${port}/journeys/new`)
  await page.getByLabel('Название поездки',{exact:true}).fill('Проверка ресурсов')
  await page.getByLabel('Станция назначения',{exact:true}).fill('Финиш')
  await page.getByLabel('Часы',{exact:true}).fill('0')
  await page.getByLabel('Минуты',{exact:true}).fill('5')
  await page.getByRole('button',{name:'Начать поездку',exact:true}).click()
  await page.getByRole('button',{name:'Включить музыку',exact:true}).click()
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics=async()=>{
    await cdp.send('HeapProfiler.collectGarbage')
    return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]))
  }
  await page.waitForTimeout(3000)
  const initial=await metrics(), samples=[]
  for(let index=0;index<12;index++){
    await page.waitForTimeout(10000)
    await page.getByRole('button',{name:'Следующий трек',exact:true}).click()
    const sample=await metrics()
    const audio=await page.evaluate(()=>window.audioContexts.map(context=>({state:context.state,sources:context.liveSources})))
    assert.equal(audio.length,2)
    assert.ok(audio[0].sources<=12 && audio[1].sources<=6)
    assert.ok(sample.JSHeapUsedSize-initial.JSHeapUsedSize<8*1024*1024)
    samples.push({seconds:sample.Timestamp-initial.Timestamp,heap:sample.JSHeapUsedSize,taskSeconds:sample.TaskDuration-initial.TaskDuration,audio})
    if(index%3===2) console.log(`Resource soak: ${Math.round(samples.at(-1).seconds)} seconds; heap ${sample.JSHeapUsedSize}; sources ${audio.map(item=>item.sources).join('/')}`)
  }
  await page.getByRole('button',{name:'Приостановить музыку',exact:true}).click()
  launcher('stop')
  await page.waitForFunction(()=>window.audioContexts[0].state==='suspended',null,{timeout:20000})
  assert.equal(await page.evaluate(()=>window.audioContexts[1].liveSources),0)
  assert.deepEqual(errors.filter(error=>!error.includes('ERR_CONNECTION_REFUSED')),[])
  fs.writeFileSync(path.join(root,'.local-qa','audio-soak.json'),JSON.stringify({initialHeap:initial.JSHeapUsedSize,samples,serverStopSilencedAudio:true},null,2))
  console.log('PASS: two-minute active journey, repeated radio changes, bounded memory/sources, server-stop audio suspension')
} finally {
  await browser?.close()
  launcher('stop')
  if(data.startsWith(path.join(root,'.local-qa','soak-')))fs.rmSync(data,{recursive:true,force:true})
}
