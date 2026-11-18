import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, TrainFront } from 'lucide-react'
import { api } from './api'
import { formatNumber, t, useLanguage } from './i18n'
import { deriveWorld, pointOnTrack } from './world'
import { atlasTrack, drawAtlasMap } from './atlas-map'

export default function Atlas() {
  useLanguage()
  const [params] = useSearchParams()
  const journeyId = params.get('journey')
  const [journey, setJourney] = useState(null)
  const [settings, setSettings] = useState({ atmospheric_events: true })
  const [fetchedAt, setFetchedAt] = useState(performance.now())
  const [now, setNow] = useState(performance.now())
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [error, setError] = useState('')
  const canvas = useRef(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.shell-main')?.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [data, options] = await Promise.all([
          api.get(journeyId && /^\d+$/.test(journeyId) ? `/journeys/${journeyId}/` : '/journeys/'),
          api.get('/settings/'),
        ])
        if (!active) return
        setJourney(
          data.results
            ? data.results.find((item) => item.status !== 'completed') || data.results[0] || null
            : data,
        )
        setSettings(options)
        setFetchedAt(performance.now())
        setError('')
      } catch (failure) {
        if (active) setError(failure.message)
      }
    }
    load()
    const refresh = setInterval(() => {
      if (!document.hidden) load()
    }, 30000)
    const tick = setInterval(() => {
      if (!document.hidden) setNow(performance.now())
    }, 1000)
    return () => {
      active = false
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [journeyId])

  const world = useMemo(
    () => deriveWorld(journey, (now - fetchedAt) / 1000, settings.atmospheric_events !== false),
    [journey, now, fetchedAt, settings.atmospheric_events],
  )
  const currentIndex = world?.region?.index || 0
  const index = Math.max(0, Math.min(selectedIndex ?? currentIndex, (world?.route.length || 1) - 1))
  const region = world?.route[index]
  const fraction =
    index < currentIndex ? 1 : index > currentIndex ? 0 : (world?.regionFraction ?? 0)
  const track = useMemo(() => (region ? atlasTrack(region.points) : []), [region])
  const marker = region ? pointOnTrack(track, fraction) : [40, 215]
  const restStops =
    journey?.breaks?.filter((item) => {
      const distance = item.at_minutes * 100
      return distance >= region.start && distance <= region.end
    }) || []

  useEffect(() => {
    if (region) drawAtlasMap(canvas.current, region, journey.route_seed || journey.id, fraction)
  }, [region, journey, fraction])

  useEffect(() => setSelectedPoint(null), [index])

  const pointLabel =
    selectedPoint === 'train'
      ? `${t('rail.current_location')}: ${formatNumber(Math.round(world?.distanceMeters || 0))} ${t('rail.meters')}`
      : selectedPoint === 'start'
        ? t('rail.departure_station')
        : selectedPoint === 'end'
          ? `${t('rail.destination_station')}: ${journey?.destination_station || t('rail.region.' + region?.id)}`
          : restStops.find((stop) => String(stop.id) === selectedPoint)
            ? t('rail.station_break')
            : ''

  function keyDown(event) {
    if (!world) return
    if (event.key === 'ArrowLeft') setSelectedIndex(Math.max(0, index - 1))
    if (event.key === 'ArrowRight') setSelectedIndex(Math.min(world.route.length - 1, index + 1))
  }

  return (
    <div className="atlas-page">
      <header className="atlas-heading">
        <div>
          <span className="eyebrow">{t('rail.railway')}</span>
          <h1>{t('rail.atlas')}</h1>
          <p>{t('rail.atlas_intro')}</p>
        </div>
        <Link className="button secondary" to="/dashboard">
          <ArrowLeft size={16} />
          {t('rail.return_carriage')}
        </Link>
      </header>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!world ? (
        <div className="atlas-empty">
          <TrainFront size={34} />
          <p>{t('rail.no_journey')}</p>
          <Link className="button primary" to="/journeys/new">
            {t('ui.new_journey')}
          </Link>
        </div>
      ) : (
        <>
          <div className="atlas-status">
            <strong>{journey.title}</strong>
            <span>
              {t('rail.distance')}: {formatNumber(Math.round(world.distanceMeters))} /{' '}
              {formatNumber(world.totalMeters)} {t('rail.meters')}
            </span>
            <span>
              {t('rail.remaining')}: {formatNumber(Math.round(world.remainingMeters))}{' '}
              {t('rail.meters')}
            </span>
            <span>{t('status.' + journey.status)}</span>
          </div>
          <div
            className="atlas-frame"
            tabIndex={0}
            onKeyDown={keyDown}
            aria-label={t('rail.map_keyboard')}
          >
            <div className="atlas-map" role="group" aria-label={t('rail.region.' + region.id)}>
              <canvas ref={canvas} aria-hidden="true" />
              <div className="atlas-map-title">
                {t('rail.region.' + region.id)} · {String(index + 1).padStart(2, '0')}
              </div>
              <button
                className="atlas-marker station start"
                style={{ left: '4%', top: '34%' }}
                onClick={() => setSelectedPoint('start')}
                aria-label={t('rail.departure_station')}
                title={t('rail.departure_station')}
              >
                ◆
              </button>
              <button
                className="atlas-marker station end"
                style={{ left: '94%', top: '34%' }}
                onClick={() => setSelectedPoint('end')}
                aria-label={t('rail.destination_station')}
                title={t('rail.destination_station')}
              >
                ◆
              </button>
              {restStops.map((stop) => {
                const [x, y] = pointOnTrack(
                  track,
                  (stop.at_minutes * 100 - region.start) / (region.end - region.start),
                )
                return (
                  <button
                    key={stop.id}
                    className="atlas-marker rest"
                    style={{ left: `${x / 10}%`, top: `${y / 4.2}%` }}
                    onClick={() => setSelectedPoint(String(stop.id))}
                    aria-label={t('rail.station_break')}
                    title={t('rail.station_break')}
                  >
                    ✚
                  </button>
                )
              })}
              {index === currentIndex && (
                <button
                  className="atlas-marker train"
                  style={{ left: `${marker[0] / 10}%`, top: `${marker[1] / 4.2}%` }}
                  onClick={() => setSelectedPoint('train')}
                  aria-label={t('rail.inspect_train')}
                  title={t('rail.inspect_train')}
                >
                  <TrainFront size={19} />
                </button>
              )}
              <div className="atlas-map-scale">
                0 ━━━ {formatNumber(region.end - region.start)} {t('rail.meters')}
              </div>
            </div>
          </div>
          {pointLabel && (
            <div className="atlas-point-info" role="status">
              {pointLabel}
            </div>
          )}
          <div className="atlas-navigation">
            <button
              className="button secondary"
              onClick={() => setSelectedIndex(index - 1)}
              disabled={index === 0}
              title={
                index === 0
                  ? t(world.route.length === 1 ? 'rail.single_region' : 'rail.route_start')
                  : undefined
              }
            >
              <ChevronLeft size={16} />
              {t('rail.previous_region')}
            </button>
            <div>
              <strong>{t('rail.region.' + region.id)}</strong>
              <small>
                {index + 1} / {world.route.length} · {formatNumber(region.end - region.start)}{' '}
                {t('rail.meters')}
              </small>
              <small>
                {t('rail.stops')}: {restStops.length}
              </small>
            </div>
            <button
              className="button secondary"
              onClick={() => setSelectedIndex(index + 1)}
              disabled={index === world.route.length - 1}
              title={
                index === world.route.length - 1
                  ? t(world.route.length === 1 ? 'rail.single_region' : 'rail.route_end')
                  : undefined
              }
            >
              {t('rail.next_region')}
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="atlas-navigation-hint">
            {t(world.route.length === 1 ? 'rail.single_region' : 'rail.navigate_hint')}
          </p>
          {selectedIndex !== null && selectedIndex !== currentIndex && (
            <button className="button subtle atlas-follow" onClick={() => setSelectedIndex(null)}>
              {t('rail.follow_train')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
