import { t, useLanguage } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { progressFromRemaining, remainingFromSnapshot } from './journey'
import Compartment from './Compartment'
import { Link } from 'react-router-dom'

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

  const load = useCallback(async () => {
    try {
      const [active, paused, recent] = await Promise.all([
        api.get('/journeys/?status=active'),
        api.get('/journeys/?status=paused'),
        api.get('/journeys/'),
      ])
      setJourneys([
        ...new Map(
          [...active.results, ...paused.results, ...recent.results].map((item) => [item.id, item]),
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
    journeys.find((item) => item.status === 'active' || item.status === 'paused') || journeys[0]
  const elapsed = (now - fetchedAt) / 1000
  const progress = progressFromRemaining(journey, elapsed)
  const remaining = remainingFromSnapshot(journey, elapsed)

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
    <div className="compartment-dashboard">
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
        settings={settings}
        loading={loading}
        busy={busy}
        error={error}
        onAction={onAction}
      />
    </div>
  )
}
