import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { t, setLanguage, useLanguage } from './i18n'
import { TrainAudioEngine } from './train-audio'

const Context = createContext(null)
export const useTrainAudio = () => useContext(Context)

export function TrainAudioProvider({ children }) {
  const engine = useRef(null)
  const [settings, setSettings] = useState({ ambience_enabled: true, ambience_volume: 30 })
  const [state, setState] = useState('waiting')
  const ready = useRef(false)
  const blocked = useRef(false)
  useEffect(() => {
    const audio = new TrainAudioEngine()
    engine.current = audio
    let disposed = false
    let currentSettings = {}
    let currentJourney = null
    let refreshing = null
    async function refresh() {
      if (refreshing) return refreshing
      refreshing = (async () => {
        const [active, paused, resting, recent] = await Promise.all([
          api.get('/journeys/?status=active'),
          api.get('/journeys/?status=paused'),
          api.get('/journeys/?status=break'),
          api.get('/journeys/'),
        ])
        if (disposed) return
        currentJourney =
          active.results[0] || paused.results[0] || resting.results[0] || recent.results[0] || null
        audio.configure(currentJourney, currentSettings)
      })()
        .catch(() => {
          if (!disposed) {
            audio.suspend().catch(() => {})
            ready.current = false
            blocked.current = true
            setState('unavailable')
            window.dispatchEvent(new Event('lasttrain:server-unavailable'))
          }
        })
        .finally(() => {
          refreshing = null
        })
      return refreshing
    }
    api
      .get('/settings/')
      .then((data) => {
        if (disposed) return
        currentSettings = data
        setSettings(data)
        setLanguage(data.language || 'ru')
        audio.configure(currentJourney, data)
      })
      .catch(() => {})
    refresh()
    const updated = (event) => {
      currentSettings = event.detail
      setSettings(event.detail)
      audio.configure(currentJourney, currentSettings)
    }
    const unlock = async () => {
      if (
        disposed ||
        blocked.current ||
        ready.current ||
        currentSettings.ambience_enabled === false
      )
        return
      try {
        const started = await audio.start()
        if (disposed) return
        ready.current = started
        blocked.current = !started
        setState(started ? 'active' : 'unavailable')
      } catch {
        if (!disposed) {
          blocked.current = true
          setState('unavailable')
        }
      }
    }
    const visibility = async () => {
      if (document.hidden) {
        await audio.suspend()
        return
      }
      await refresh()
      if (ready.current && !disposed) audio.start().catch(() => setState('unavailable'))
    }
    const hide = (event) => (event.persisted ? audio.suspend() : audio.close())
    const show = (event) => {
      if (event.persisted) visibility()
    }
    const interval = setInterval(() => {
      if (!document.hidden) refresh()
    }, 15000)
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('lasttrain:settings-updated', updated)
    window.addEventListener('lasttrain:journey-updated', refresh)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      ready.current = false
      blocked.current = false
      clearInterval(interval)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('lasttrain:settings-updated', updated)
      window.removeEventListener('lasttrain:journey-updated', refresh)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', show)
      document.removeEventListener('visibilitychange', visibility)
      audio.close()
    }
  }, [])
  async function unlock() {
    blocked.current = false
    try {
      const started = await engine.current.start()
      ready.current = started
      setState(started ? 'active' : 'unavailable')
    } catch {
      blocked.current = true
      setState('unavailable')
    }
  }
  return <Context.Provider value={{ settings, state, unlock }}>{children}</Context.Provider>
}

export function TrainSoundStatus() {
  useLanguage()
  const audio = useTrainAudio()
  if (!audio) return null
  const muted = audio.settings.ambience_muted || audio.settings.ambience_enabled === false
  async function toggle() {
    if (audio.state !== 'active') {
      await audio.unlock()
      return
    }
    try {
      const settings = await api.patch('/settings/', {
        ambience_enabled: true,
        ambience_muted: !muted,
      })
      window.dispatchEvent(new CustomEvent('lasttrain:settings-updated', { detail: settings }))
    } catch {
      /* Settings offers detailed retry feedback. */
    }
  }
  return (
    <button
      className="train-sound-status"
      onClick={toggle}
      aria-label={
        audio.state !== 'active' ? t('audio.unlock') : t(muted ? 'audio.unmute' : 'audio.mute')
      }
    >
      <span aria-hidden="true">♫</span>{' '}
      {t(`audio.${audio.state === 'unavailable' ? 'unavailable' : muted ? 'muted' : audio.state}`)}
    </button>
  )
}
