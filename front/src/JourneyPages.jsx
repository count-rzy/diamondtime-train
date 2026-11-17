import { t, useLanguage, formatDate, translateMessage } from './i18n'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, TrainFront } from 'lucide-react'
import { api } from './api'
import Scene from './Scene'

export function CreateJourney() {
  useLanguage()

  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const duration_minutes = Number(data.hours) * 60 + Number(data.minutes)
    if (duration_minutes < 1 || duration_minutes > 43200) {
      setError(t('ui.choose_a_duration_between_1_minute_and_30_days'))
      setBusy(false)
      return
    }
    try {
      await api.post('/journeys/', {
        title: data.title.trim(),
        description: data.description.trim(),
        starting_station: data.starting_station.trim(),
        destination_station: data.destination_station.trim(),
        duration_minutes,
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ui.a_new_departure')}</span>
          <h1>
            {t('ui.where_to_next')}
            <span className="heading-star">✦</span>
          </h1>
          <p>{t('ui.give_this_stretch_of_time_a_destination_worth_reaching')}</p>
        </div>
      </div>
      <div className="create-layout">
        <form className="panel create-form" onSubmit={submit}>
          <span className="eyebrow">{t('ui.your_ticket')}</span>
          <h2>{t('ui.plan_your_journey')}</h2>
          <div className="form-stack">
            <label>
              <span>{t('ui.journey_name')}</span>
              <input
                name="title"
                required
                maxLength="120"
                placeholder={t('ui.final_exams_a_new_project_a_quiet_afternoon')}
              />
            </label>
            <label>
              <span>
                {t('ui.what_are_you_working_toward')} <em>{t('ui.optional')}</em>
              </span>
              <textarea
                name="description"
                maxLength="2000"
                rows="3"
                placeholder={t('ui.a_note_to_your_future_self')}
              />
            </label>
            <div className="field-row">
              <label>
                <span>{t('ui.starting_station')}</span>
                <input
                  name="starting_station"
                  required
                  maxLength="80"
                  defaultValue={t('ui.departure')}
                />
              </label>
              <label>
                <span>{t('ui.destination_station')}</span>
                <input
                  name="destination_station"
                  required
                  maxLength="80"
                  placeholder={t('ui.your_destination')}
                />
              </label>
            </div>
            <div className="field-row duration-row">
              <label>
                <span>{t('ui.hours')}</span>
                <input type="number" name="hours" min="0" max="720" defaultValue="1" required />
              </label>
              <label>
                <span>{t('ui.minutes')}</span>
                <input type="number" name="minutes" min="0" max="59" defaultValue="0" required />
              </label>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {translateMessage(error)}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? t('ui.departing') : t('ui.begin_journey')} <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <div className="create-aside">
          <Scene progress={0} running={false} title={t('ui.your_new_beginning')} />
          <div className="panel">
            <span className="eyebrow">{t('ui.a_note_for_the_road')}</span>
            <h3>{t('ui.the_best_time_to_begin_is_now')}</h3>
            <p>
              {t(
                'ui.your_clock_starts_when_you_depart_you_can_pause_along_the_way_and_your_notes_will_always_be_here_when_you_return',
              )}{' '}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export function HistoryPage() {
  useLanguage()

  const [items, setItems] = useState([])
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function load(path = '/journeys/', append = false) {
    setLoading(true)
    try {
      const data = await api.get(path)
      setItems((old) => (append ? [...old, ...data.results] : data.results))
      setNext(
        data.next
          ? new URL(data.next).pathname.replace('/api', '') + new URL(data.next).search
          : null,
      )
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ui.the_miles_behind_you')}</span>
          <h1>
            {t('ui.journey_history')}
            <span className="heading-star">✦</span>
          </h1>
          <p>{t('ui.a_record_of_every_departure_and_every_arrival')}</p>
        </div>
        <Link to="/journeys/new" className="button secondary">
          <Plus size={16} />
          {t('ui.new_journey')}{' '}
        </Link>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {translateMessage(error)}
        </p>
      )}
      {items.length ? (
        <div className="history-list">
          {items.map((j) => (
            <article className="panel history-card" key={j.id}>
              <div className="history-icon">
                <TrainFront size={25} />
              </div>
              <div>
                <span className="eyebrow">
                  {formatDate(j.started_at)} · {t('status.' + j.status).toUpperCase()}
                </span>
                <h2>{j.title}</h2>
                <p>
                  {j.starting_station} <ArrowRight size={14} /> {j.destination_station}
                </p>
              </div>
              <div className="history-progress">
                <strong>{Math.round(j.progress)}%</strong>
                <div className="progress-track">
                  <span style={{ width: `${j.progress}%` }} />
                </div>
                <small>
                  {Math.floor(j.duration_minutes / 60)}
                  {t('ui.h')} {j.duration_minutes % 60}
                  {t('ui.m')}{' '}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="panel empty-state">
            <h2>{t('ui.no_journeys_yet')}</h2>
            <p>{t('ui.your_first_one_is_waiting_at_the_platform')}</p>
            <Link to="/journeys/new" className="button primary">
              {t('ui.set_off')} <ArrowRight size={16} />
            </Link>
          </div>
        )
      )}
      {loading && <p className="muted">{t('ui.loading_journeys')}</p>}
      {next && !loading && (
        <button className="button secondary load-more" onClick={() => load(next, true)}>
          {t('ui.load_more')}{' '}
        </button>
      )}
    </>
  )
}
