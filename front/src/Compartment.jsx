import { formatDate, formatNumber, t, useLanguage } from './i18n'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Expand,
  MapPinned,
  Minimize,
  Pause,
  Play,
  Plus,
  Settings2,
  Ticket,
} from 'lucide-react'
import { atmosphere, formatTime, journeyStage } from './journey'
import PixelWorld from './PixelWorld'

export default function Compartment({
  journey,
  progress = 0,
  remaining = 0,
  breakRemaining = 0,
  world = null,
  settings = {},
  loading = false,
  busy = false,
  error = '',
  onAction,
  preview = false,
  onOpenNotebook,
  immersive = false,
  onEnterImmersive,
  onExitImmersive,
}) {
  useLanguage()
  const [arrivalPhase, setArrivalPhase] = useState('depot')
  const [stationApproach, setStationApproach] = useState(false)
  const previousStatus = useRef(journey?.status)
  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = journey?.status
    if (journey?.status === 'break' && previous === 'active' && !settings.reduced_motion) {
      setStationApproach(true)
      const stopped = setTimeout(() => setStationApproach(false), 1200)
      return () => clearTimeout(stopped)
    }
    setStationApproach(false)
    if (journey?.status !== 'completed' || previous === 'completed') return
    if (!previous || settings.reduced_motion) {
      setArrivalPhase('depot')
      return
    }
    setArrivalPhase('approach')
    const tunnel = setTimeout(() => setArrivalPhase('tunnel'), 1700)
    const depot = setTimeout(() => setArrivalPhase('depot'), 3400)
    return () => {
      clearTimeout(tunnel)
      clearTimeout(depot)
    }
  }, [journey?.status, settings.reduced_motion])

  const fixed = { dawn: 0, morning: 20, afternoon: 40, sunset: 60, twilight: 80, night: 99 }[
    settings.atmosphere
  ]
  const palette = atmosphere(
    fixed ?? progress,
    fixed === undefined ? journey?.duration_minutes || 60 : 60,
  )
  const arrived = journey?.status === 'completed' || progress >= 100
  const moving =
    (preview || journey?.status === 'active' || stationApproach) &&
    !arrived &&
    !settings.reduced_motion
  const slowing = (progress >= 92 || stationApproach) && moving
  const scene =
    journey?.status === 'break'
      ? stationApproach
        ? 'tunnel'
        : 'depot'
      : arrived
        ? arrivalPhase === 'approach'
          ? 'industry'
          : arrivalPhase === 'tunnel'
            ? 'tunnel'
            : 'depot'
        : progress >= 96
          ? 'tunnel'
          : progress >= 90
            ? 'industry'
            : world?.region?.scene || 'valley'
  const elapsed =
    journey?.status === 'completed'
      ? (journey.elapsed_seconds ?? journey.duration_minutes * 60)
      : Math.max(0, (journey?.duration_minutes || 0) * 60 - remaining)
  return (
    <section
      className={`compartment ${settings.crisp_pixels === false ? 'smooth-pixels' : ''} ${moving ? 'in-motion' : ''} ${slowing ? 'slowing' : ''} ${stationApproach ? 'station-approach' : ''} ${arrived ? 'at-station' : ''} ${settings.reduced_motion ? 'reduced' : ''} ${settings.animation_intensity === 'gentle' ? 'motion-gentle' : ''}`}
      aria-label={t('ui.train_compartment')}
    >
      <PixelWorld
        palette={palette}
        progress={progress}
        particles={settings.ambient_particles !== false}
        weather={settings.weather_effects !== false}
        scene={scene}
        event={world?.event}
      />
      <div className="cabin-vignette" />
      <div className="cabin-heading">
        <span>{t('ui.last_train_carriage_01')}</span>
        <strong>
          {journey
            ? journey.title
            : preview
              ? t('ui.your_focus_has_a_window_seat')
              : t('ui.a_seat_for_your_next_journey')}
        </strong>
        <small>
          {arrived
            ? t('ui.destination_reached')
            : journey?.status === 'break'
              ? t('rail.station_break')
              : journey?.status === 'paused'
                ? t('ui.resting_at_a_siding')
                : `${palette.name.toUpperCase()} · ${moving ? t('ui.in_motion') : t('ui.waiting_to_depart')}`}
        </small>
      </div>
      <div className="stage-indicator">
        <span className="live-dot" /> {arrived ? t('ui.arrival') : palette.name.toUpperCase()}{' '}
        <span className="stage-coordinate">
          {preview
            ? t('ui.a_world_in_motion')
            : `${journeyStage(progress).toUpperCase()} · ${Math.round(progress)}%`}
        </span>
      </div>
      {!preview && (
        <div className="cabin-mode-controls">
          {immersive ? (
            <button type="button" className="mode-button mode-exit" onClick={onExitImmersive}>
              <Minimize size={16} />
              {t('immersive.exit')}
            </button>
          ) : (
            <button
              type="button"
              className="mode-button"
              onClick={onEnterImmersive}
              disabled={!journey}
            >
              <Expand size={16} />
              {t('immersive.enter')}
            </button>
          )}
        </div>
      )}
      {!preview && (
        <Link className="cabin-settings" to="/settings" aria-label={t('ui.open_settings')}>
          <Settings2 size={18} />
          {t('ui.comforts')}{' '}
        </Link>
      )}
      {arrived && arrivalPhase !== 'depot' && (
        <button type="button" className="arrival-skip" onClick={() => setArrivalPhase('depot')}>
          {t('rail.skip_arrival')}
        </button>
      )}
      {arrived && arrivalPhase === 'depot' && (
        <div className="window-arrival" role="status">
          <span>{t('ui.last_stop')}</span>
          <strong>{t('ui.you_ve_arrived')}</strong>
          <small>
            {journey?.title} · {journey?.starting_station} → {journey?.destination_station}
          </small>
          <small>
            {t('rail.productive')}: {formatTime(elapsed)} · {t('rail.rest')}:{' '}
            {formatTime(journey?.break_seconds || 0)}
          </small>
          <small>
            {t('rail.distance')}: {formatNumber(((world?.distanceMeters || 0) / 1000).toFixed(1))}{' '}
            {t('rail.km')} · {t('rail.regions')}: {world?.route?.length || 0}
          </small>
          <small>
            {t('rail.notes')}: {journey?.diary_count ?? 0} ·{' '}
            {journey?.completed_at ? formatDate(journey.completed_at, true) : ''}
          </small>
        </div>
      )}
      <div className="cabin-board">
        <div className="board-top">
          <MapPinned size={17} />
          <span>
            {t('ui.route')}{' '}
            {journey
              ? t('ui.in_progress')
              : preview
                ? t('ui.your_next_chapter')
                : t('ui.unassigned')}
          </span>
          <span>
            {journey
              ? t('journey.ticket', { id: String(journey.id).padStart(4, '0') })
              : preview
                ? t('ui.car_01')
                : t('ui.no_ticket')}
          </span>
        </div>
        {journey ? (
          <>
            <div className="board-stations">
              <div>
                <small>{t('ui.from')}</small>
                <strong>{journey.starting_station}</strong>
              </div>
              <span className="route-arrow">······················➤</span>
              <div>
                <small>{t('ui.to')}</small>
                <strong>{journey.destination_station}</strong>
              </div>
            </div>
            <div className="board-progress">
              <div className="board-progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="board-bottom">
              <div>
                <small>{arrived ? t('ui.travel_time') : t('ui.time_to_arrival')}</small>
                <strong className="cabin-timer">
                  {journey.status === 'break'
                    ? formatTime(breakRemaining)
                    : arrived
                      ? formatTime(elapsed)
                      : formatTime(remaining)}
                </strong>
                {journey.status === 'break' && <small>{t('rail.break_countdown')}</small>}
                {world && (
                  <small className="board-elapsed">
                    {t('rail.distance')}: {formatNumber((world.distanceMeters / 1000).toFixed(1))}{' '}
                    {t('rail.km')}
                  </small>
                )}
                {!arrived && (
                  <small className="board-elapsed">
                    {t('ui.elapsed')} {formatTime(elapsed)}
                  </small>
                )}
              </div>
              <div className="board-actions">
                {journey.status === 'active' && remaining > 0 && (
                  <button
                    className="board-button"
                    disabled={busy}
                    onClick={() => onAction('pause')}
                  >
                    <Pause size={14} />
                    {t('ui.pause')}{' '}
                  </button>
                )}
                {journey.status === 'active' &&
                  journey.breaks?.some((item) => item.status === 'pending') && (
                    <button
                      className="board-button"
                      disabled={busy}
                      onClick={() => onAction('station-break')}
                    >
                      {t('rail.stop_at_station')}
                    </button>
                  )}
                {journey.status === 'paused' && (
                  <button
                    className="board-button"
                    disabled={busy}
                    onClick={() => onAction('resume')}
                  >
                    <Play size={14} />
                    {t('ui.resume')}{' '}
                  </button>
                )}
                {!arrived && (
                  <button
                    className="board-button quiet"
                    disabled={busy}
                    onClick={() => onAction('complete')}
                  >
                    {t('ui.finish')}{' '}
                  </button>
                )}
                {arrived && (
                  <Link className="board-button" to="/journeys/new">
                    <Plus size={14} />
                    {t('ui.new_trip')}{' '}
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="board-empty">
            <p>
              {loading
                ? t('ui.finding_your_seat_and_checking_the_timetable')
                : preview
                  ? t(
                      'ui.set_a_destination_for_your_time_watch_the_world_change_as_you_move_toward_it',
                    )
                  : t(
                      'ui.the_platform_is_quiet_choose_a_destination_and_watch_the_world_come_alive',
                    )}
            </p>
            {!loading && (
              <Link className="board-button" to={preview ? '/register' : '/journeys/new'}>
                {preview ? t('ui.begin_your_journey') : t('ui.take_your_seat')}{' '}
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        )}
        {error && (
          <p className="cabin-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="cabin-objects">
        {preview ? (
          <Link className="notebook-object" to="/register">
            <span className="object-top">
              <BookOpen size={15} />
              {t('ui.travel_journal')}{' '}
            </span>
            <strong>
              {t('ui.notes_from')} <br />
              {t('ui.the_road')}{' '}
            </strong>
            <span className="notebook-lines" />
            <small>{preview ? t('ui.write_your_story') : t('ui.open_diary')}</small>
          </Link>
        ) : (
          <button
            type="button"
            className="notebook-object"
            onClick={onOpenNotebook}
            aria-label={t('notebook.open')}
          >
            <span className="object-top">
              <BookOpen size={15} />
              {t('ui.travel_journal')}
            </span>
            <strong>
              {t('ui.notes_from')}
              <br />
              {t('ui.the_road')}
            </strong>
            <span className="notebook-lines" />
            <small>{t('ui.open_diary')}</small>
          </button>
        )}
        <div className="cabin-objects-right">
          <Link className="ticket-object" to={preview ? '/register' : '/statistics'}>
            <span>
              <Ticket size={16} />
              {t('ui.passenger_ticket')}{' '}
            </span>
            <strong>{t('ui.your_miles')}</strong>
            <small>{preview ? t('ui.collect_the_moments') : t('ui.view_statistics')}</small>
          </Link>
          {!preview && (
            <Link className="atlas-object" to="/atlas" aria-label={t('rail.open_atlas')}>
              <MapPinned size={16} />
              {t('rail.atlas')}
            </Link>
          )}
        </div>
      </div>
      {!preview && (
        <Link className="cabin-new" to="/journeys/new">
          <Plus size={14} />
          {t('ui.plan_a_journey')}{' '}
        </Link>
      )}
    </section>
  )
}
