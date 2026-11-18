import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, TrainFront } from 'lucide-react'
import { api } from './api'
import { formatNumber, t, useLanguage } from './i18n'
import { deriveWorld, pointOnTrack } from './world'

const art = (scene) => (scene === 'valley' ? '/art/valley-night.png' : `/art/rail-${scene}.png`)

export default function Atlas() {
  useLanguage()
  const [params] = useSearchParams()
  const journeyId = params.get('journey')
  const [journey, setJourney] = useState(null)
  const [settings, setSettings] = useState({ atmospheric_events: true })
  const [fetchedAt, setFetchedAt] = useState(performance.now())
  const [now, setNow] = useState(performance.now())
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [error, setError] = useState('')

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
  const marker = region ? pointOnTrack(region.points, fraction) : [40, 215]
  const track = region?.points.map((point) => point.join(',')).join(' ') || ''
  const restStops =
    journey?.breaks?.filter((item) => {
      const distance = item.at_minutes * 100
      return distance >= region.start && distance <= region.end
    }) || []

  function keyDown(event) {
    if (!world) return
    if (event.key === 'ArrowLeft') setSelectedIndex(Math.max(0, index - 1))
    if (event.key === 'ArrowRight') setSelectedIndex(Math.min(world.route.length - 1, index + 1))
  }

  return (
    <div className="atlas-page" onKeyDown={keyDown}>
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
          <div className="atlas-frame" tabIndex={0} aria-label={t('rail.map_keyboard')}>
            <svg
              viewBox="0 0 1000 420"
              role="img"
              aria-label={`${t('rail.region.' + region.id)} · ${Math.round(fraction * 100)}%`}
            >
              <defs>
                <pattern id="atlas-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M25 0H0V25" fill="none" stroke="#8ba2ae" strokeOpacity=".16" />
                </pattern>
                <clipPath id="atlas-traveled">
                  <rect x="0" y="0" width={Math.max(0, marker[0])} height="420" />
                </clipPath>
              </defs>
              <image
                href={art(region.scene)}
                width="1000"
                height="420"
                preserveAspectRatio="xMidYMid slice"
                opacity=".82"
              />
              <rect width="1000" height="420" fill="#0a1930" opacity=".22" />
              <rect width="1000" height="420" fill="url(#atlas-grid)" />
              <polyline
                points={track}
                fill="none"
                stroke="#111725"
                strokeWidth="19"
                strokeLinecap="square"
                strokeLinejoin="round"
              />
              <polyline
                points={track}
                fill="none"
                stroke="#987a65"
                strokeWidth="11"
                strokeLinecap="square"
                strokeLinejoin="round"
                strokeDasharray="5 9"
              />
              <polyline
                points={track}
                fill="none"
                stroke="#d8ba85"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={track}
                fill="none"
                stroke="#f9d18d"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                clipPath="url(#atlas-traveled)"
              />
              {region.points.slice(1).map((point, i) => (
                <circle key={i} cx={point[0]} cy={point[1]} r="3" fill="#f0d09b" />
              ))}
              {[region.points[0], region.points.at(-1)].map((point, i) => (
                <g key={i}>
                  <circle
                    cx={point[0]}
                    cy={point[1]}
                    r="13"
                    fill="#c49a69"
                    stroke="#17253b"
                    strokeWidth="5"
                  />
                  <circle cx={point[0]} cy={point[1]} r="4" fill="#f5d6a3" />
                </g>
              ))}
              {restStops.map((stop) => {
                const [x, y] = pointOnTrack(
                  region.points,
                  (stop.at_minutes * 100 - region.start) / (region.end - region.start),
                )
                return (
                  <g key={stop.id}>
                    <circle cx={x} cy={y} r="15" fill="#26394b" stroke="#e3ad74" strokeWidth="3" />
                    <path
                      d={`M${x - 5} ${y}h10 M${x} ${y - 5}v10`}
                      stroke="#f8d6a2"
                      strokeWidth="2"
                    />
                  </g>
                )
              })}
              <g transform={`translate(${marker[0]} ${marker[1]})`} className="atlas-locomotive">
                <circle r="20" fill="#e6bd83" stroke="#142034" strokeWidth="5" />
                <path d="M-10 5h20v-10h-8v-5h-8v5h-4z" fill="#243541" />
                <circle cx="-6" cy="7" r="3" fill="#263442" />
                <circle cx="7" cy="7" r="3" fill="#263442" />
              </g>
            </svg>
          </div>
          <div className="atlas-navigation">
            <button
              className="button secondary"
              onClick={() => setSelectedIndex(index - 1)}
              disabled={index === 0}
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
            >
              {t('rail.next_region')}
              <ChevronRight size={16} />
            </button>
          </div>
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
