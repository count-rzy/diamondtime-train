import { t, useLanguage } from './i18n'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, MapPinned, Pause, Play, Plus, Settings2, Ticket } from 'lucide-react'
import { atmosphere, formatTime, journeyStage } from './journey'
import PixelWorld from './PixelWorld'

export default function Compartment({
  journey,
  progress = 0,
  remaining = 0,
  settings = {},
  loading = false,
  busy = false,
  error = '',
  onAction,
  preview = false,
}) {
  useLanguage()

  const fixed = { dawn: 0, morning: 20, afternoon: 40, sunset: 60, twilight: 80, night: 99 }[
    settings.atmosphere
  ]
  const palette = atmosphere(
    fixed ?? progress,
    fixed === undefined ? journey?.duration_minutes || 60 : 60,
  )
  const arrived = journey?.status === 'completed' || progress >= 100
  const moving = (preview || journey?.status === 'active') && !arrived && !settings.reduced_motion
  const slowing = progress >= 92 && moving
  const elapsed =
    journey?.status === 'completed'
      ? (journey.elapsed_seconds ?? journey.duration_minutes * 60)
      : Math.max(0, (journey?.duration_minutes || 0) * 60 - remaining)
  return (
    <section
      className={`compartment ${settings.crisp_pixels === false ? 'smooth-pixels' : ''} ${moving ? 'in-motion' : ''} ${slowing ? 'slowing' : ''} ${arrived ? 'at-station' : ''} ${settings.reduced_motion ? 'reduced' : ''} ${settings.animation_intensity === 'gentle' ? 'motion-gentle' : ''}`}
      aria-label={t('ui.train_compartment')}
    >
      <PixelWorld
        palette={palette}
        progress={progress}
        particles={settings.ambient_particles !== false}
        weather={settings.weather_effects !== false}
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
        <Link className="cabin-settings" to="/settings" aria-label={t('ui.open_settings')}>
          <Settings2 size={18} />
          {t('ui.comforts')}{' '}
        </Link>
      )}
      {arrived && (
        <div className="window-arrival" role="status">
          <span>{t('ui.last_stop')}</span>
          <strong>{t('ui.you_ve_arrived')}</strong>
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
                  {arrived ? formatTime(elapsed) : formatTime(remaining)}
                </strong>
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
      <Link className="notebook-object" to={preview ? '/register' : '/diary'}>
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
      <Link className="ticket-object" to={preview ? '/register' : '/statistics'}>
        <span>
          <Ticket size={16} />
          {t('ui.passenger_ticket')}{' '}
        </span>
        <strong>{t('ui.your_miles')}</strong>
        <small>{preview ? t('ui.collect_the_moments') : t('ui.view_statistics')}</small>
      </Link>
      {!preview && (
        <Link className="cabin-new" to="/journeys/new">
          <Plus size={14} />
          {t('ui.plan_a_journey')}{' '}
        </Link>
      )}
    </section>
  )
}
