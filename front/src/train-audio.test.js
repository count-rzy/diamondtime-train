import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrainAudioEngine } from './train-audio'

function audioContext() {
  const param = () => ({
    value: 0,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  })
  const nodes = []
  const node = () => {
    const value = {
      connect: vi.fn(function () {
        return arguments[0]
      }),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
      gain: param(),
      frequency: param(),
      Q: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }
    nodes.push(value)
    return value
  }
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: {},
    nodes,
    createGain: node,
    createOscillator: node,
    createBufferSource: node,
    createBiquadFilter: node,
    createDynamicsCompressor: node,
    createBuffer: (_, length) => {
      const data = new Float32Array(length)
      return { getChannelData: () => data }
    },
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended'
    }),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
  }
  return context
}
const journey = {
  id: 1,
  status: 'active',
  progress: 30,
  remaining_seconds: 42,
  duration_minutes: 1,
}
const settings = {
  ambience_enabled: true,
  ambience_volume: 30,
  train_horn: false,
  weather_sounds: true,
}
let engine
afterEach(async () => {
  await engine?.close()
  vi.useRealTimers()
})

describe('train ambience lifecycle', () => {
  it('allocates lazily, shares concurrent starts, and cleans every node and timer', async () => {
    vi.useFakeTimers()
    const context = audioContext(),
      factory = vi.fn(() => context)
    engine = new TrainAudioEngine(factory)
    engine.configure(journey, settings)
    expect(factory).not.toHaveBeenCalled()
    await Promise.all([engine.start(), engine.start(), engine.start()])
    expect(factory).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    engine.schedule()
    expect(engine.voices.size).toBeGreaterThan(0)
    await engine.close()
    expect(context.nodes.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true)
    expect(engine.voices.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(await engine.start()).toBe(false)
  })
  it('smoothly controls independent gain, weather, pause, approach and arrival', async () => {
    const context = audioContext()
    engine = new TrainAudioEngine(() => context)
    engine.configure(journey, settings)
    await engine.start()
    expect(engine.master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.066, 0, 0.25)
    expect(engine.rain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.055, 0, 1.2)
    engine.configure({ ...journey, status: 'paused' }, { ...settings, ambience_muted: true })
    expect(engine.speed).toBe(0)
    expect(engine.master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.25)
    engine.configure({ ...journey, progress: 99 }, { ...settings, weather_sounds: false })
    expect(engine.speed).toBe(0.15)
    expect(engine.rain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 1.2)
    const tone = vi.spyOn(engine, 'tone')
    engine.configure({ ...journey, status: 'completed' }, settings)
    engine.configure({ ...journey, status: 'completed' }, settings)
    expect(tone).toHaveBeenCalledTimes(1)
    expect(engine.speed).toBe(0)
  })
  it('has a continuous loop boundary and bounded voices after repeated scheduling', async () => {
    vi.useFakeTimers()
    const context = audioContext()
    engine = new TrainAudioEngine(() => context)
    engine.configure(journey, settings)
    await engine.start()
    const data = engine.noise.getChannelData(0)
    expect(data.at(-1)).toBe(data[0])
    for (let index = 0; index < 300; index++) {
      context.currentTime = index * 0.2
      engine.schedule()
      expect(engine.voices.size).toBeLessThan(8)
      for (const voice of [...engine.voices.keys()]) voice.onended()
    }
    await engine.suspend()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.state).toBe('suspended')
    await engine.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(engine.nextWheel).toBeGreaterThan(context.currentTime)
  })
  it('arrives from elapsed wall time even before the next server poll', async () => {
    vi.useFakeTimers()
    engine = new TrainAudioEngine(audioContext)
    engine.configure({ ...journey, remaining_seconds: 0.1 }, settings)
    await engine.start()
    await vi.advanceTimersByTimeAsync(600)
    expect(engine.journey.status).toBe('completed')
    expect(engine.speed).toBe(0)
  })
})
