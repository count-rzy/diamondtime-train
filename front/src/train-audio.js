// Original procedural soundscape. No recordings, downloads or external services.
export class TrainAudioEngine {
  constructor(contextFactory = () => new AudioContext()) {
    this.contextFactory = contextFactory
    this.context = null
    this.nodes = new Set()
    this.voices = new Map()
    this.settings = {}
    this.journey = null
    this.timer = null
    this.closed = false
    this.starting = null
    this.nextHorn = 0
    this.lastArrival = null
    this.lastDeparture = null
  }

  noiseBuffer(context) {
    const length = context.sampleRate * 4
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const samples = buffer.getChannelData(0)
    let seed = 4139
    for (let index = 0; index < length; index++) {
      seed = (1664525 * seed + 1013904223) >>> 0
      samples[index] = seed / 2147483648 - 1
    }
    // Crossfade the loop seam; the buffer is immutable and shared by noise layers.
    const seam = Math.min(2048, length / 4)
    for (let index = 0; index < seam; index++) {
      const mix = index / (seam - 1)
      samples[length - seam + index] =
        samples[length - seam + index] * (1 - mix) + samples[(index + 1) % seam] * mix
    }
    return buffer
  }

  own(node) {
    this.nodes.add(node)
    return node
  }

  layer(type, frequency, gainValue) {
    const context = this.context
    const source = this.own(context.createBufferSource())
    source.buffer = this.noise
    source.loop = true
    const filter = this.own(context.createBiquadFilter())
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = 0.5
    const gain = this.own(context.createGain())
    gain.gain.value = gainValue
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
    return gain
  }

  async start() {
    if (this.closed) return false
    if (this.starting) return this.starting
    this.starting = (async () => {
      if (!this.context) {
        const context = this.contextFactory()
        this.context = context
        this.master = this.own(context.createGain())
        this.master.gain.value = 0
        const compressor = this.own(context.createDynamicsCompressor())
        compressor.threshold.value = -22
        compressor.knee.value = 18
        compressor.ratio.value = 4
        compressor.attack.value = 0.02
        compressor.release.value = 0.3
        this.master.connect(compressor).connect(context.destination)
        this.noise = this.noiseBuffer(context)
        this.rumble = this.layer('lowpass', 110, 0)
        this.wind = this.layer('bandpass', 650, 0)
        this.platform = this.layer('bandpass', 230, 0)
        this.rain = this.layer('highpass', 1800, 0)
        this.vibration = this.own(context.createGain())
        this.vibration.gain.value = 0
        this.vibration.connect(this.master)
        for (const frequency of [38, 63]) {
          const oscillator = this.own(context.createOscillator())
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          oscillator.connect(this.vibration)
          oscillator.start()
        }
      }
      await this.context.resume()
      if (this.closed) return false
      this.nextWheel = this.context.currentTime + 0.15
      this.nextHorn = this.context.currentTime + 70
      this.configure(this.journey, this.settings)
      if (!this.timer) this.timer = setInterval(() => this.schedule(), 200)
      return this.context.state === 'running'
    })().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  target(parameter, value, seconds = 1.2) {
    const now = this.context.currentTime
    parameter.cancelScheduledValues(now)
    parameter.setTargetAtTime(value, now, seconds)
  }

  configure(journey, settings) {
    if (journey !== this.journey) this.snapshotAt = performance.now()
    this.journey = journey
    this.settings = settings || {}
    if (!this.context || this.closed) return
    const enabled = this.settings.ambience_enabled !== false && !this.settings.ambience_muted
    const active = journey?.status === 'active'
    const paused = journey?.status === 'paused'
    const station = journey?.status === 'break' || journey?.status === 'completed'
    const progress = journey?.progress || 0
    const approach = active ? Math.max(0.15, Math.min(1, (100 - progress) / 8)) : 0
    this.speed = active ? approach : 0
    this.target(
      this.master.gain,
      enabled ? (Math.min(100, Math.max(0, this.settings.ambience_volume ?? 30)) / 100) * 0.22 : 0,
      0.25,
    )
    this.target(
      this.rumble.gain,
      active ? 0.65 * approach : paused ? 0.055 : station ? 0.035 : 0.018,
    )
    this.target(this.vibration.gain, active ? 0.055 * approach : 0)
    this.target(this.wind.gain, active ? 0.065 * approach : journey ? 0.012 : 0)
    this.target(this.platform.gain, station ? 0.045 : 0)
    const rain =
      this.settings.weather_sounds !== false &&
      this.settings.weather_effects !== false &&
      active &&
      progress > 28 &&
      progress < 53
    this.target(this.rain.gain, rain && journey ? 0.055 : 0)
    if (active && this.lastDeparture !== journey.id && enabled) {
      this.lastDeparture = journey.id
      if (this.settings.train_horn !== false) this.horn(0.025)
    }
    if (journey?.status === 'completed' && this.lastArrival !== journey.id) {
      this.lastArrival = journey.id
      if (enabled) this.tone(392, 0.035, 0.7, this.context.currentTime + 0.2)
    }
  }

  tone(frequency, amplitude, duration, at = this.context.currentTime) {
    if (this.closed || this.context.state !== 'running') return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(amplitude, at + Math.min(0.15, duration / 3))
    gain.gain.linearRampToValueAtTime(0, at + duration)
    oscillator.connect(gain).connect(this.master)
    this.voices.set(oscillator, [gain])
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
      this.voices.delete(oscillator)
    }
    oscillator.start(at)
    oscillator.stop(at + duration + 0.02)
  }

  horn(amplitude = 0.018) {
    if (!this.context) return
    this.tone(174, amplitude, 1.8)
    this.tone(220, amplitude * 0.65, 1.8)
  }

  clack(at, amount) {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 450 + Math.random() * 150
    filter.Q.value = 0.6
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(amount, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.075)
    source.connect(filter).connect(gain).connect(this.master)
    this.voices.set(source, [filter, gain])
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      gain.disconnect()
      this.voices.delete(source)
    }
    source.start(at, Math.random() * 2, 0.085)
  }

  schedule() {
    if (!this.context || this.context.state !== 'running' || this.closed) return
    if (this.journey?.status === 'active') {
      const remaining = Math.max(
        0,
        this.journey.remaining_seconds - (performance.now() - this.snapshotAt) / 1000,
      )
      if (remaining === 0) {
        this.configure({ ...this.journey, status: 'completed', progress: 100 }, this.settings)
      } else {
        const progress = 100 * (1 - remaining / (this.journey.duration_minutes * 60))
        this.speed = Math.max(0.15, Math.min(1, (100 - progress) / 8))
        this.target(this.rumble.gain, 0.65 * this.speed)
        this.target(this.vibration.gain, 0.055 * this.speed)
      }
    }
    if (!this.speed || this.settings.ambience_enabled === false || this.settings.ambience_muted)
      return
    const now = this.context.currentTime
    this.nextWheel = Math.max(now + 0.025, this.nextWheel)
    // Bounded lookahead: no burst of queued beats after background suspension.
    while (this.nextWheel < now + 0.45) {
      const strength = 0.1 * this.speed
      this.clack(this.nextWheel, strength)
      this.clack(this.nextWheel + 0.105, strength * 0.65)
      if (Math.random() < 0.08) this.tone(105 + Math.random() * 35, 0.009, 0.4, this.nextWheel)
      this.nextWheel += (0.52 + Math.random() * 0.055) / Math.max(0.25, this.speed)
    }
    if (now >= this.nextHorn) {
      if (this.settings.train_horn !== false) this.horn()
      this.nextHorn = now + 70 + Math.random() * 70
    }
  }

  async suspend() {
    clearInterval(this.timer)
    this.timer = null
    if (this.context && this.context.state !== 'closed') await this.context.suspend()
  }

  async close() {
    if (this.closed) return
    this.closed = true
    clearInterval(this.timer)
    this.timer = null
    for (const node of [
      ...this.voices.keys(),
      ...[...this.voices.values()].flat(),
      ...this.nodes,
    ]) {
      try {
        node.stop?.()
      } catch {
        /* already stopped */
      }
      node.disconnect()
      if ('onended' in node) node.onended = null
    }
    this.voices.clear()
    this.nodes.clear()
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.noise = null
  }
}
