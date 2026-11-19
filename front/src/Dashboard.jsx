import { t, useLanguage } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { progressFromRemaining, remainingFromSnapshot } from './journey'
import Compartment from './Compartment'
import { Link } from 'react-router-dom'
import Notebook from './Notebook'
import Atlas from './Atlas'
import OverlayFrame from './OverlayFrame'
import { useCompartmentOverlays } from './CompartmentOverlays'
import { deriveWorld } from './world'

export default function Dashboard() {
  useLanguage()

  const [legacyProfiles, setLegacyProfiles] = useState(0)
  const [journeys, setJourneys] = useState([])
  const [settings, setSettings] = useState({
    reduced_motion: false,
    ambient_particles: true,
    weather_effects: true,
    animation_intensity: 'full',
  })
  const [fetchedAt, setFetchedAt] = useState(performance.now())
  const [now, setNow] = useState(performance.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const completionRefresh = useRef(null)
  const breakRefresh = useRef(null)
  const sceneRef = useRef(null)
  const controlsTimer = useRef(null)
  const nativeFullscreen = useRef(false)
  const [immersive, setImmersive] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const { activeOverlay, setActiveOverlay, radioPlaying } = useCompartmentOverlays()

  useEffect(() => {
    document.body.classList.toggle('journey-immersive', immersive)
    return () => document.body.classList.remove('journey-immersive')
  }, [immersive])

  useEffect(() => {
    const fullscreenChanged = () => {
      if (nativeFullscreen.current && !document.fullscreenElement) {
        nativeFullscreen.current = false
        setImmersive(false)
      }
    }
    document.addEventListener('fullscreenchange', fullscreenChanged)
    return () => document.removeEventListener('fullscreenchange', fullscreenChanged)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || activeOverlay || !immersive) return
      event.preventDefault()
      exitImmersive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, activeOverlay])

  useEffect(() => () => clearTimeout(controlsTimer.current), [])

  function showControls() {
    setControlsVisible(true)
    clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 4000)
  }

  async function enterImmersive() {
    setImmersive(true)
    showControls()
    try {
      await sceneRef.current?.closest('.shell-main')?.requestFullscreen?.()
      nativeFullscreen.current = !!document.fullscreenElement
    } catch {
      nativeFullscreen.current = false
    }
  }

  function exitImmersive() {
    nativeFullscreen.current = false
    setImmersive(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  const load = useCallback(async () => {
    try {
      const [active, paused, resting, recent] = await Promise.all([
        api.get('/journeys/?status=active'),
        api.get('/journeys/?status=paused'),
        api.get('/journeys/?status=break'),
        api.get('/journeys/'),
      ])
      setJourneys([
        ...new Map(
          [...active.results, ...paused.results, ...resting.results, ...recent.results].map(
            (item) => [item.id, item],
          ),
        ).values(),
      ])
      setFetchedAt(performance.now())
      setError('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    api
      .get('/local/profiles/')
      .then((data) => setLegacyProfiles(data.profiles.length))
      .catch(() => {})
    api
      .get('/settings/')
      .then(setSettings)
      .catch(() => {})
    const refresh = setInterval(() => {
      if (!document.hidden) load()
    }, 30000)
    const tick = setInterval(() => {
      if (!document.hidden) setNow(performance.now())
    }, 1000)
    const visible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [load])

  const journey =
    journeys.find((item) => ['active', 'paused', 'break'].includes(item.status)) || journeys[0]
  const elapsed = (now - fetchedAt) / 1000
  const progress = progressFromRemaining(journey, elapsed)
  const remaining = remainingFromSnapshot(journey, elapsed)
  const breakRemaining =
    journey?.status === 'break'
      ? Math.max(0, Math.ceil((journey.break_remaining_seconds || 0) - elapsed))
      : 0
  const world = deriveWorld(journey, elapsed, settings.atmospheric_events !== false)

  useEffect(() => {
    if (
      journey?.status === 'active' &&
      remaining === 0 &&
      completionRefresh.current !== journey.id
    ) {
      completionRefresh.current = journey.id
      load()
    }
    if (journey?.status !== 'active') completionRefresh.current = null
  }, [journey?.id, journey?.status, remaining, load])

  useEffect(() => {
    if (
      journey?.status === 'break' &&
      breakRemaining === 0 &&
      breakRefresh.current !== journey.id
    ) {
      breakRefresh.current = journey.id
      load()
    }
    if (journey?.status !== 'break') breakRefresh.current = null
  }, [journey?.id, journey?.status, breakRemaining, load])

  async function onAction(action) {
    if (!journey) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/journeys/${journey.id}/${action}/`, {})
      await load()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={sceneRef}
      className={`compartment-dashboard ${controlsVisible ? 'controls-visible' : ''}`}
      onPointerMove={immersive ? showControls : undefined}
      onTouchStart={immersive ? showControls : undefined}
      onKeyDown={immersive ? showControls : undefined}
    >
      {legacyProfiles > 1 && (
        <div className="legacy-notice">
          {t('ui.your_previous_profiles_and_journeys_are_preserved')}{' '}
          <Link to="/settings">{t('ui.choose_stored_records_in_settings')}</Link>
        </div>
      )}
      <Compartment
        journey={journey}
        progress={progress}
        remaining={remaining}
        breakRemaining={breakRemaining}
        world={world}
        settings={settings}
        loading={loading}
        busy={busy}
        error={error}
        onAction={onAction}
        onOpenNotebook={() => setActiveOverlay('diary')}
        onOpenAtlas={() => setActiveOverlay('atlas')}
        onOpenRadio={() => setActiveOverlay('radio')}
        radioPlaying={radioPlaying}
        immersive={immersive}
        onEnterImmersive={enterImmersive}
        onExitImmersive={exitImmersive}
      />
      {activeOverlay === 'diary' && (
        <Notebook journey={journey} onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'atlas' && (
        <OverlayFrame
          title={t('rail.atlas')}
          kind="atlas-overlay"
          onClose={() => setActiveOverlay(null)}
        >
          <Atlas
            embedded
            journeySnapshot={journey}
            settingsSnapshot={settings}
            worldSnapshot={world}
          />
        </OverlayFrame>
      )}
    </div>
  )
}
